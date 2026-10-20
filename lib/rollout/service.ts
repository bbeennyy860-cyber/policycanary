import type { GateConfig, PairObs, RolloutState, SliceResult, Stage, Verdict } from "../contract";
import { bettingCs } from "../stats/cs";
import { testSlices } from "../stats/slices";
import { mineSlices } from "../slices/miner";
import { appendAudit, verifyAudit, type AuditRow, type Json } from "./audit";
import { transaction, type Queryable } from "./db";
import { HttpError } from "./http";
import { IllegalTransition, stageForState, transition } from "./machine";
import { loadPairs } from "./pair-source";
import { evaluateBatch, type ReplayResult } from "./replay";
import type { CreateInput, OverrideInput } from "./validation";

export interface RolloutRecord extends Record<string, unknown> {
  id: number; baseline: string; candidate: string;
  baseline_policy_id: number; candidate_policy_id: number;
  alpha: number; margin: number; max_trials: number; mode: GateConfig["mode"];
  state: RolloutState; cursor: number; created_at: string;
  stage: Stage; stage_start: number; revision: number; pairs: PairObs[];
}
export interface DecisionRow extends Record<string, unknown> {
  id: number; stage: Stage; n_pairs: number; mean_diff: number; lcb: number; ucb: number; verdict: Verdict; reason: string;
}
export interface SliceRunRow extends Record<string, unknown> {
  id: number; source: string; model: string | null; proposals: unknown; results: SliceResult[];
}
const rolloutSelect = `SELECT r.*, b.name AS baseline, c.name AS candidate,
  rt.stage, rt.stage_start, rt.revision, rt.pairs FROM rollouts r
  JOIN policies b ON b.id = r.baseline_policy_id JOIN policies c ON c.id = r.candidate_policy_id
  JOIN rollout_runtime rt ON rt.rollout_id = r.id`;

export async function readRollout(db: Queryable, id: number): Promise<RolloutRecord> {
  const result = await db.query<RolloutRecord>(`${rolloutSelect} WHERE r.id = $1`, [id]);
  if (!result.rows[0]) throw new HttpError(404, "Rollout not found");
  return result.rows[0];
}
export function configFor(row: RolloutRecord): GateConfig {
  return { alpha: row.alpha, margin: row.margin, maxTrials: row.max_trials, mode: row.mode };
}
export function publicRollout(row: RolloutRecord) {
  const { pairs, stage_start: stageStart, max_trials: maxTrials, created_at: createdAt,
    baseline_policy_id: baselinePolicyId, candidate_policy_id: candidatePolicyId, ...rest } = row;
  return { ...rest, stageStart, maxTrials, createdAt, baselinePolicyId, candidatePolicyId, pairCount: pairs.length };
}
export function publicDecision(row: DecisionRow) {
  return { ...row, n: row.n_pairs, mean: row.mean_diff };
}

export async function createRollout(input: CreateInput) {
  return transaction(async db => {
    // Ingest and creation serialize initial stream snapshots; no pair can fall into the gap.
    await db.query("SELECT pg_advisory_xact_lock(73291, 1)");
    const policies = await db.query<{ id: number; name: string }>("SELECT id, name FROM policies WHERE name = ANY($1::text[])", [[input.baseline, input.candidate]]);
    const base = policies.rows.find(row => row.name === input.baseline);
    const cand = policies.rows.find(row => row.name === input.candidate);
    if (!base || !cand) throw new HttpError(404, "Unknown policy");
    const pairs = await loadPairs(input.baseline, input.candidate);
    const result = await db.query<{ id: number }>(`INSERT INTO rollouts
      (baseline_policy_id, candidate_policy_id, alpha, margin, max_trials, mode)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [base.id, cand.id, input.alpha, input.margin, input.maxTrials, input.mode]);
    const id = result.rows[0].id;
    await db.query("INSERT INTO rollout_runtime (rollout_id, pairs) VALUES ($1, $2::jsonb)", [id, JSON.stringify(pairs)]);
    await appendAudit(db, "rollout", id, "CREATE", { ...input, state: "DRAFT", pairCount: pairs.length });
    return publicRollout(await readRollout(db, id));
  });
}

export async function listRollouts() {
  return transaction(async db => {
    const rows = await db.query<RolloutRecord>(`${rolloutSelect} ORDER BY r.id DESC`);
    return { rollouts: rows.rows.map(publicRollout) };
  });
}

export async function rolloutDetail(id: number) {
  return transaction(async db => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const row = await readRollout(db, id);
    const decisions = await db.query<DecisionRow>("SELECT * FROM decisions WHERE rollout_id = $1 ORDER BY id", [id]);
    const overrides = await db.query("SELECT * FROM overrides WHERE rollout_id = $1 ORDER BY id", [id]);
    const guardrails = await db.query("SELECT * FROM guardrails WHERE rollout_id = $1 ORDER BY id", [id]);
    const audit = await db.query<AuditRow>("SELECT * FROM audit_log WHERE entity = 'rollout' AND entity_id = $1 ORDER BY id", [id]);
    const sliceRuns = await db.query<SliceRunRow>("SELECT * FROM slice_runs WHERE rollout_id = $1 ORDER BY id DESC", [id]);
    // Show the just-completed stage until the first pair of the next stage is consumed.
    const last = decisions.rows.at(-1);
    const chartStage = row.stage_start === row.cursor && last ? last.stage : row.stage;
    const chartStart = row.stage_start === row.cursor && last ? row.cursor - last.n_pairs : row.stage_start;
    const cs = bettingCs(row.pairs.slice(chartStart, row.cursor).map(pair => pair.d), row.alpha);
    return { ...publicRollout(row), decisions: decisions.rows.map(publicDecision), overrides: overrides.rows,
      guardrails: guardrails.rows, audit: audit.rows.map(item => ({ ...item, ...item.payload })),
      cs, csStage: chartStage, sliceRuns: sliceRuns.rows, auditVerification: verifyAudit(audit.rows) };
  });
}

/** Cursor comparison is mandatory; revision additionally covers appends and state-only changes. */
export async function saveState(db: Queryable, old: RolloutRecord, next: {
  state: RolloutState; cursor: number; stage: Stage; stageStart: number; maxTrials?: number; pairs?: PairObs[];
}): Promise<void> {
  const result = await db.query(`UPDATE rollouts SET cursor = $3, state = $4, max_trials = $5
    WHERE id = $1 AND cursor = $2 AND state = $6 RETURNING id`,
  [old.id, old.cursor, next.cursor, next.state, next.maxTrials ?? old.max_trials, old.state]);
  if (result.rowCount !== 1) throw new HttpError(409, "Rollout changed concurrently; reload and retry");
  const runtime = await db.query(`UPDATE rollout_runtime SET stage = $3, stage_start = $4,
    pairs = $5::jsonb, revision = revision + 1 WHERE rollout_id = $1 AND revision = $2 RETURNING rollout_id`,
  [old.id, old.revision, next.stage, next.stageStart, JSON.stringify(next.pairs ?? old.pairs)]);
  if (runtime.rowCount !== 1) throw new HttpError(409, "Rollout stream changed concurrently; reload and retry");
}

export async function persistReplay(db: Queryable, row: RolloutRecord, result: ReplayResult): Promise<void> {
  await saveState(db, row, result);
  for (const decision of result.decisions) {
    await db.query(`INSERT INTO decisions (rollout_id, stage, n_pairs, mean_diff, lcb, ucb, verdict, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, decision.stage, decision.n, decision.mean, decision.lcb, decision.ucb, decision.verdict, decision.reason]);
  }
  for (const change of result.transitions) {
    await appendAudit(db, "rollout", row.id, "TRANSITION", { ...change, cursor: result.cursor, stage: result.stage });
  }
  await appendAudit(db, "rollout", row.id, "REPLAY", {
    fromCursor: row.cursor, cursor: result.cursor, stage: row.stage, decisions: result.decisions.map(d => ({ ...d })),
  });
}

export async function replayInTransaction(db: Queryable, row: RolloutRecord, batch: number) {
  const previous = await db.query<DecisionRow>("SELECT * FROM decisions WHERE rollout_id = $1 ORDER BY id DESC LIMIT 1", [row.id]);
  const result = evaluateBatch({ state: row.state, stage: row.stage, stageStart: row.stage_start,
    cursor: row.cursor, pairs: row.pairs, config: configFor(row) }, batch, previous.rows[0]?.verdict);
  await persistReplay(db, row, result);
  return { ...publicRollout({ ...row, state: result.state, stage: result.stage, stage_start: result.stageStart,
    cursor: result.cursor, revision: row.revision + 1 }), decisions: result.decisions,
    decision: result.decisions.at(-1), stopped: result.decisions.at(-1)?.verdict !== "CONTINUE" };
}
export async function replayRollout(id: number, batch: number) {
  return transaction(async db => replayInTransaction(db, await readRollout(db, id), batch));
}

export async function overrideRollout(id: number, input: OverrideInput, resume = false) {
  return transaction(async db => {
    const row = await readRollout(db, id);
    const isResume = row.state === "HOLD" && input.toState === "EVALUATING";
    if (resume && !isResume) throw new IllegalTransition("Only HOLD can resume evaluation");
    if (isResume && (input.maxTrials === undefined || input.maxTrials <= row.max_trials)) {
      throw new HttpError(400, "Resuming HOLD requires a larger maxTrials");
    }
    if (!isResume && input.maxTrials !== undefined) throw new HttpError(400, "maxTrials may only change when resuming HOLD");
    const state = transition(row.state, isResume ? "RESUME" : { type: "OVERRIDE", ...input });
    const stage = stageForState(state) ?? row.stage;
    // A resumed EVAL retains its data; a manual stage change starts at the current cursor.
    const stageStart = isResume ? row.stage_start : stage !== row.stage ? row.cursor : row.stage_start;
    await saveState(db, row, { state, stage, stageStart, cursor: row.cursor, maxTrials: input.maxTrials });
    await db.query("INSERT INTO overrides (rollout_id, from_state, to_state, actor, reason) VALUES ($1, $2, $3, $4, $5)",
      [id, row.state, state, input.actor, input.reason]);
    await appendAudit(db, "rollout", id, isResume ? "RESUME" : "OVERRIDE", {
      fromState: row.state, toState: state, actor: input.actor, reason: input.reason,
      fromMaxTrials: row.max_trials, maxTrials: input.maxTrials ?? row.max_trials, cursor: row.cursor, stage,
    });
    return publicRollout({ ...row, state, stage, stage_start: stageStart, max_trials: input.maxTrials ?? row.max_trials, revision: row.revision + 1 });
  });
}

export async function runSlices(id: number) {
  const row = await transaction(db => readRollout(db, id));
  const splitIndex = Math.floor(row.pairs.length / 2);
  const mined = await mineSlices(row.pairs.slice(0, splitIndex), { base: row.baseline, cand: row.candidate });
  const results = testSlices(row.pairs, mined.proposals, splitIndex, row.margin);
  return transaction(async db => {
    // Version the run against replay/ingest and concurrent approvals; no stale run becomes latest.
    await saveState(db, row, { state: row.state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor });
    const inserted = await db.query<{ id: number }>(`INSERT INTO slice_runs (rollout_id, source, model, proposals, results)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING id`,
    [id, mined.source, mined.model ?? null, JSON.stringify(mined.proposals), JSON.stringify(results)]);
    await appendAudit(db, "rollout", id, "SLICES", { runId: inserted.rows[0].id, splitIndex,
      pairCount: row.pairs.length, source: mined.source, confirmed: results.filter(item => item.confirmed).map(item => item.name) });
    return { id: inserted.rows[0].id, ...mined, splitIndex, results };
  });
}

export async function approveGuardrail(id: number, sliceName: string, approvedBy: string) {
  return transaction(async db => {
    // Lock the rollout before reading latest: a concurrent slice run cannot supersede approval.
    await db.query("SELECT id FROM rollouts WHERE id = $1 FOR UPDATE", [id]);
    const row = await readRollout(db, id);
    const latest = await db.query<SliceRunRow>("SELECT * FROM slice_runs WHERE rollout_id = $1 ORDER BY id DESC LIMIT 1", [id]);
    const run = latest.rows[0];
    const slice = run?.results.find(item => item.name === sliceName && item.confirmed);
    if (!slice) throw new HttpError(409, "Slice is not confirmed in the latest run");
    // Retest the complete family, preserving Holm multiplicity, against current data.
    const tested = testSlices(row.pairs, run.results.map(({ name, pattern, rationale }) => ({ name, pattern, rationale })),
      Math.floor(row.pairs.length / 2), row.margin);
    if (!tested.some(item => item.name === sliceName && item.confirmed)) {
      throw new HttpError(409, "Slice no longer confirms on the current rollout data");
    }
    const state = transition(row.state, "GUARDRAIL");
    const reason = `guardrail: ${slice.name} confirmed regression`;
    await saveState(db, row, { state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor });
    await db.query("INSERT INTO guardrails (rollout_id, slice_name, pattern, approved_by) VALUES ($1, $2, $3, $4)",
      [id, slice.name, slice.pattern, approvedBy]);
    await appendAudit(db, "rollout", id, "GUARDRAIL", { fromState: row.state, toState: state, sliceName,
      pattern: slice.pattern, approvedBy, reason, runId: run.id });
    return { ...publicRollout({ ...row, state, revision: row.revision + 1 }), reason };
  });
}

export async function verifyRolloutAudit(id: number) {
  return transaction(async db => {
    await readRollout(db, id);
    const rows = await db.query<AuditRow>("SELECT * FROM audit_log WHERE entity = 'rollout' AND entity_id = $1 ORDER BY id", [id]);
    return verifyAudit(rows.rows);
  });
}

export function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
