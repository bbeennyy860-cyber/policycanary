import { createHash } from "node:crypto";
import type {
  AuditEntry, DecisionRecord, GuardrailRecord, OverrideRecord, Rollout, RolloutDetail, SliceRun, TestedSliceResult, TrialIngestResponse,
} from "../api-types";
import type { GateConfig, PairObs, RolloutState, SliceProposal, Stage, Verdict } from "../contract";
import { addSession, findSession, policyNames } from "../data";
import { mineSlices } from "../slices/miner";
import { bettingCs } from "../stats/cs";
import { simulatePeeking } from "../stats/peeking";
import { savings } from "../stats/savings";
import { siteHeterogeneity } from "../stats/sites";
import { testSlices } from "../stats/slices";
import { appendAudit, verifyAudit, type AuditRow } from "./audit";
import { transaction, type Queryable } from "./db";
import { HttpError } from "./http";
import { IllegalTransition, isTerminal, stageForState, transition } from "./machine";
import { loadPairs, type StreamPair } from "./pair-source";
import { evaluateBatch, type ReplayDecision, type ReplayResult } from "./replay";
import type { CreateInput, OverrideInput, TrialInput } from "./validation";

export interface RolloutRecord extends Record<string, unknown> {
  id: number; baseline: string; candidate: string;
  alpha: number; margin: number; max_trials: number; mode: GateConfig["mode"];
  state: RolloutState; cursor: number; created_at: Date | string;
  stage: Stage; stage_start: number; revision: number; pairs: StreamPair[];
}
interface DecisionRow extends Record<string, unknown> {
  id: number; stage: Stage; n_pairs: number; mean_diff: number; lcb: number; ucb: number; verdict: Verdict; reason: string; created_at: Date | string;
}
interface SliceRunRow extends Record<string, unknown> {
  id: number; source: "llm" | "fallback"; model: string | null; split_index: number; proposals: SliceProposal[]; results: TestedSliceResult[]; created_at: Date | string;
}
interface OverrideRow extends Record<string, unknown> { id: number; from_state: RolloutState; to_state: RolloutState; actor: string; reason: string; created_at: Date | string }
interface GuardrailRow extends Record<string, unknown> { id: number; slice_name: string; pattern: string; approved_by: string; created_at: Date | string }

const rolloutSelect = `SELECT r.*, rt.stage, rt.stage_start, rt.revision, rt.pairs FROM rollouts r
  JOIN rollout_runtime rt ON rt.rollout_id = r.id`;
const iso = (v: Date | string | null | undefined) => (v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : "");

export async function readRollout(db: Queryable, id: number, lock = false): Promise<RolloutRecord> {
  const result = await db.query<RolloutRecord>(`${rolloutSelect} WHERE r.id = $1${lock ? " FOR UPDATE OF r" : ""}`, [id]);
  if (!result.rows[0]) throw new HttpError(404, "Rollout not found");
  return result.rows[0];
}
export function configFor(row: RolloutRecord): GateConfig {
  return { alpha: Number(row.alpha), margin: Number(row.margin), maxTrials: row.max_trials, mode: row.mode };
}
export function publicRollout(row: RolloutRecord): Rollout {
  return { id: row.id, baseline: row.baseline, candidate: row.candidate, alpha: Number(row.alpha), margin: Number(row.margin),
    maxTrials: row.max_trials, mode: row.mode, state: row.state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor,
    pairCount: row.pairs.length, revision: row.revision, createdAt: iso(row.created_at) };
}
function publicDecision(row: DecisionRow): DecisionRecord {
  return { id: row.id, stage: row.stage, n: row.n_pairs, mean: Number(row.mean_diff), lcb: Number(row.lcb), ucb: Number(row.ucb),
    verdict: row.verdict, reason: row.reason, createdAt: iso(row.created_at) };
}
function publicOverride(row: OverrideRow): OverrideRecord {
  return { id: row.id, fromState: row.from_state, toState: row.to_state, actor: row.actor, reason: row.reason, createdAt: iso(row.created_at) };
}
function publicGuardrail(row: GuardrailRow): GuardrailRecord {
  return { id: row.id, sliceName: row.slice_name, pattern: row.pattern, approvedBy: row.approved_by, createdAt: iso(row.created_at) };
}
function publicSliceRun(row: SliceRunRow): SliceRun {
  return { id: row.id, source: row.source, model: row.model, splitIndex: row.split_index, proposals: row.proposals, results: row.results, createdAt: iso(row.created_at) };
}
function publicAudit(row: AuditRow & { created_at?: Date | string }): AuditEntry {
  return { id: row.id, entity: row.entity, entityId: row.entity_id, action: row.action, payload: row.payload?.payload ?? {},
    prevHash: row.payload?.prevHash ?? "", hash: row.payload?.hash ?? "", createdAt: iso(row.created_at) };
}

export async function createRollout(input: CreateInput): Promise<Rollout> {
  const names = policyNames();
  if (!names.has(input.baseline) || !names.has(input.candidate)) throw new HttpError(404, "Unknown policy");
  const pairs = await loadPairs(input.baseline, input.candidate);
  return transaction(async db => {
    await db.query("SELECT pg_advisory_xact_lock(73291, 1)");
    const result = await db.query<{ id: number }>(`INSERT INTO rollouts (baseline, candidate, alpha, margin, max_trials, mode)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [input.baseline, input.candidate, input.alpha, input.margin, input.maxTrials, input.mode]);
    const id = result.rows[0].id;
    await db.query("INSERT INTO rollout_runtime (rollout_id, pairs) VALUES ($1, $2::jsonb)", [id, JSON.stringify(pairs)]);
    await appendAudit(db, "rollout", id, "CREATE", { ...input, state: "DRAFT", pairCount: pairs.length });
    return publicRollout(await readRollout(db, id));
  });
}

export async function listRollouts(): Promise<{ rollouts: Rollout[] }> {
  return transaction(async db => {
    const rows = await db.query<RolloutRecord>(`${rolloutSelect} ORDER BY r.id DESC`);
    return { rollouts: rows.rows.map(publicRollout) };
  });
}

export async function rolloutDetail(id: number): Promise<RolloutDetail> {
  const data = await transaction(async db => {
    const row = await readRollout(db, id);
    const decisions = await db.query<DecisionRow>("SELECT * FROM decisions WHERE rollout_id = $1 ORDER BY id", [id]);
    const overrides = await db.query<OverrideRow>("SELECT * FROM overrides WHERE rollout_id = $1 ORDER BY id", [id]);
    const guardrails = await db.query<GuardrailRow>("SELECT * FROM guardrails WHERE rollout_id = $1 ORDER BY id", [id]);
    const audit = await db.query<AuditRow & { created_at: Date }>("SELECT * FROM audit_log WHERE entity = 'rollout' AND entity_id = $1 ORDER BY id", [id]);
    const sliceRuns = await db.query<SliceRunRow>("SELECT * FROM slice_runs WHERE rollout_id = $1 ORDER BY id DESC", [id]);
    return { row, decisions: decisions.rows, overrides: overrides.rows, guardrails: guardrails.rows, audit: audit.rows, sliceRuns: sliceRuns.rows };
  });
  const { row } = data;
  const last = data.decisions.at(-1);
  // Show the just-completed stage until the first pair of the next stage is consumed.
  const justAdvanced = row.stage_start === row.cursor && last && last.verdict !== "CONTINUE";
  const csStage = justAdvanced ? last.stage : row.stage;
  const chartStart = justAdvanced ? Math.max(0, row.cursor - last.n_pairs) : row.stage_start;
  const cfg = configFor(row);
  const ds = row.pairs.map(p => p.d);
  const runs = data.sliceRuns.map(publicSliceRun);
  return {
    ...publicRollout(row),
    decisions: data.decisions.map(publicDecision), overrides: data.overrides.map(publicOverride),
    guardrails: data.guardrails.map(publicGuardrail), audit: data.audit.map(publicAudit), auditVerification: verifyAudit(data.audit),
    cs: bettingCs(ds.slice(chartStart, row.cursor), cfg.alpha), csStage, fullCs: bettingCs(ds, cfg.alpha),
    sliceRuns: runs, latestSliceRun: runs[0] ?? null,
    savings: savings(ds, row.pairs.map(p => p.durS ?? 0), cfg),
    sites: siteHeterogeneity(row.pairs),
  };
}

/** Optimistic lock: cursor + state must match what we read, and the runtime revision must match. */
async function saveState(db: Queryable, old: RolloutRecord, next: {
  state: RolloutState; cursor: number; stage: Stage; stageStart: number; maxTrials?: number; pairs?: StreamPair[];
}): Promise<void> {
  const result = await db.query(`UPDATE rollouts SET cursor = $3, state = $4, max_trials = $5
    WHERE id = $1 AND cursor = $2 AND state = $6 RETURNING id`,
  [old.id, old.cursor, next.cursor, next.state, next.maxTrials ?? old.max_trials, old.state]);
  if (result.rowCount !== 1) throw new HttpError(409, "Rollout changed concurrently (cursor moved); reload and retry");
  const runtime = await db.query(`UPDATE rollout_runtime SET stage = $3, stage_start = $4,
    pairs = $5::jsonb, revision = revision + 1 WHERE rollout_id = $1 AND revision = $2 RETURNING rollout_id`,
  [old.id, old.revision, next.stage, next.stageStart, JSON.stringify(next.pairs ?? old.pairs)]);
  if (runtime.rowCount !== 1) throw new HttpError(409, "Rollout stream changed concurrently; reload and retry");
}

async function persistReplay(db: Queryable, row: RolloutRecord, result: ReplayResult, pairs?: StreamPair[]): Promise<DecisionRecord[]> {
  await saveState(db, row, { ...result, pairs });
  const written: DecisionRecord[] = [];
  for (const d of result.decisions) {
    const inserted = await db.query<DecisionRow>(`INSERT INTO decisions (rollout_id, stage, n_pairs, mean_diff, lcb, ucb, verdict, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [row.id, d.stage, d.n, d.mean, d.lcb, d.ucb, d.verdict, d.reason]);
    written.push(publicDecision(inserted.rows[0]));
  }
  for (const change of result.transitions) {
    await appendAudit(db, "rollout", row.id, "TRANSITION", { ...change, cursor: result.cursor, stage: result.stage });
  }
  await appendAudit(db, "rollout", row.id, "REPLAY", {
    fromCursor: row.cursor, cursor: result.cursor, stage: row.stage,
    decisions: result.decisions.map((d: ReplayDecision) => ({ n: d.n, mean: d.mean, lcb: d.lcb, ucb: d.ucb, verdict: d.verdict, stage: d.stage })),
  });
  return written;
}

async function lastVerdict(db: Queryable, id: number): Promise<Verdict | undefined> {
  const previous = await db.query<DecisionRow>("SELECT verdict FROM decisions WHERE rollout_id = $1 ORDER BY id DESC LIMIT 1", [id]);
  return previous.rows[0]?.verdict;
}

export async function replayRollout(id: number, batch: number, expectedCursor?: number) {
  return transaction(async db => {
    const row = await readRollout(db, id);
    if (expectedCursor !== undefined && expectedCursor !== row.cursor) throw new HttpError(409, `Cursor mismatch: expected ${expectedCursor}, current ${row.cursor}`);
    const result = evaluateBatch({ state: row.state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor,
      pairs: row.pairs, config: configFor(row) }, batch, await lastVerdict(db, id));
    const decisions = await persistReplay(db, row, result);
    const decision = decisions.at(-1) ?? null;
    return { rollout: publicRollout({ ...row, state: result.state, stage: result.stage, stage_start: result.stageStart,
      cursor: result.cursor, revision: row.revision + 1 }), decisions, decision,
      stopped: isTerminal(result.state) || result.state === "HOLD" || (decision !== null && decision.verdict !== "CONTINUE") };
  });
}

export async function overrideRollout(id: number, input: OverrideInput) {
  return transaction(async db => {
    const row = await readRollout(db, id);
    const isResume = row.state === "HOLD" && input.toState === "EVALUATING";
    if (isResume && (input.maxTrials === undefined || input.maxTrials <= row.max_trials)) {
      throw new HttpError(400, "Resuming HOLD requires a larger maxTrials");
    }
    if (!isResume && input.maxTrials !== undefined) throw new HttpError(400, "maxTrials may only change when resuming HOLD");
    const state = transition(row.state, isResume ? "RESUME" : { type: "OVERRIDE", ...input });
    const stage = stageForState(state) ?? row.stage;
    const stageStart = isResume ? row.stage_start : stage !== row.stage ? row.cursor : row.stage_start;
    await saveState(db, row, { state, stage, stageStart, cursor: row.cursor, maxTrials: input.maxTrials });
    const inserted = await db.query<OverrideRow>("INSERT INTO overrides (rollout_id, from_state, to_state, actor, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, row.state, state, input.actor, input.reason]);
    await appendAudit(db, "rollout", id, isResume ? "RESUME" : "OVERRIDE", {
      fromState: row.state, toState: state, actor: input.actor, reason: input.reason,
      fromMaxTrials: row.max_trials, maxTrials: input.maxTrials ?? row.max_trials, cursor: row.cursor, stage,
    });
    return { rollout: publicRollout({ ...row, state, stage, stage_start: stageStart, max_trials: input.maxTrials ?? row.max_trials, revision: row.revision + 1 }),
      override: publicOverride(inserted.rows[0]) };
  });
}

export async function runSlices(id: number): Promise<SliceRun> {
  const row = await transaction(db => readRollout(db, id));
  const splitIndex = Math.floor(row.pairs.length / 2);
  // The LLM sees ONLY the discovery half.
  const mined = await mineSlices(row.pairs.slice(0, splitIndex), { base: row.baseline, cand: row.candidate });
  const results = testSlices(row.pairs, mined.proposals, splitIndex, Number(row.margin));
  return transaction(async db => {
    const inserted = await db.query<SliceRunRow>(`INSERT INTO slice_runs (rollout_id, source, model, split_index, proposals, results)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
    [id, mined.source, mined.model ?? null, splitIndex, JSON.stringify(mined.proposals), JSON.stringify(results)]);
    await appendAudit(db, "rollout", id, "SLICES", { runId: inserted.rows[0].id, splitIndex, pairCount: row.pairs.length,
      source: mined.source, confirmed: results.filter(r => r.confirmed).map(r => r.name) });
    return publicSliceRun(inserted.rows[0]);
  });
}

export async function approveGuardrail(id: number, sliceName: string, approvedBy: string) {
  return transaction(async db => {
    const row = await readRollout(db, id, true);
    const latest = await db.query<SliceRunRow>("SELECT * FROM slice_runs WHERE rollout_id = $1 ORDER BY id DESC LIMIT 1", [id]);
    const run = latest.rows[0];
    const slice = run?.results.find(r => r.name === sliceName && r.confirmed);
    if (!slice) throw new HttpError(409, "Slice is not confirmed in the latest slice run");
    const inserted = await db.query<GuardrailRow>("INSERT INTO guardrails (rollout_id, slice_name, pattern, approved_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [id, slice.name, slice.pattern, approvedBy]);
    await appendAudit(db, "rollout", id, "GUARDRAIL_APPROVED", { sliceName: slice.name, pattern: slice.pattern, approvedBy, runId: run.id });
    // Re-evaluate the guardrail on the rollout's data (full family, Holm preserved).
    const retest = testSlices(row.pairs, run.results.map(({ name, pattern, rationale }) => ({ name, pattern, rationale })),
      Math.floor(row.pairs.length / 2), Number(row.margin));
    const regressing = retest.some(r => r.name === slice.name && r.confirmed);
    let state = row.state;
    const reason = regressing ? `guardrail: ${slice.name} confirmed regression` : `guardrail: ${slice.name} approved; no confirmed regression on current data`;
    if (regressing && !isTerminal(row.state)) {
      state = transition(row.state, "GUARDRAIL");
      await saveState(db, row, { state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor });
      await appendAudit(db, "rollout", id, "TRANSITION", { fromState: row.state, toState: state, reason });
    }
    return { rollout: publicRollout({ ...row, state, revision: row.revision + (state !== row.state ? 1 : 0) }),
      guardrail: publicGuardrail(inserted.rows[0]), reason };
  });
}

export async function verifyRolloutAudit(id: number) {
  return transaction(async db => {
    await readRollout(db, id);
    const rows = await db.query<AuditRow>("SELECT * FROM audit_log WHERE entity = 'rollout' AND entity_id = $1 ORDER BY id", [id]);
    return verifyAudit(rows.rows);
  });
}

export async function rolloutPeeking(id: number) {
  const row = await transaction(db => readRollout(db, id));
  return simulatePeeking(row.pairs.map(p => p.d), { alpha: Number(row.alpha) });
}

interface IdemRow extends Record<string, unknown> { request_hash: string; status: number; response: unknown }

/** POST /api/trials. Same Idempotency-Key + same body returns the stored response; different body -> 409. */
export async function ingestTrials(key: string, input: TrialInput): Promise<{ status: number; body: unknown; replayed: boolean }> {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return transaction(async db => {
    await db.query("SELECT pg_advisory_xact_lock(73291, 1)");
    const existing = await db.query<IdemRow>("SELECT request_hash, status, response FROM idempotency_keys WHERE key = $1", [key]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) throw new HttpError(409, "Idempotency-Key reused with a different request body");
      return { status: existing.rows[0].status, body: existing.rows[0].response, replayed: true };
    }
    const names = new Set(input.results.map(r => r.policy));
    if (names.size !== input.results.length) throw new HttpError(400, "Each policy may appear once per session");
    const known = findSession(input.sessionId);
    if (known && input.results.some(r => Object.values(known.policies).some(a => a.name === r.policy))) {
      throw new HttpError(409, "Duplicate trial for (session, policy)");
    }
    const dupe = await db.query(`SELECT 1 FROM trials t JOIN policies p ON p.id = t.policy_id
      WHERE t.session_id = $1 AND p.name = ANY($2::text[]) LIMIT 1`, [input.sessionId, [...names]]);
    if (dupe.rows.length) throw new HttpError(409, "Duplicate trial for (session, policy)");
    await db.query("INSERT INTO sites (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [input.site]);
    const site = await db.query<{ id: number }>("SELECT id FROM sites WHERE name = $1", [input.site]);
    await db.query(`INSERT INTO sessions (id, occurred_at, site_id, instruction, notes) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING`, [input.sessionId, input.occurredAt, site.rows[0].id, input.instruction, input.notes]);
    for (const r of input.results) {
      await db.query("INSERT INTO policies (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r.policy]);
      const policy = await db.query<{ id: number }>("SELECT id FROM policies WHERE name = $1", [r.policy]);
      await db.query("INSERT INTO trials (session_id, policy_id, success, progress, duration_s) VALUES ($1, $2, $3, $4, $5)",
        [input.sessionId, policy.rows[0].id, r.success, r.progress, r.durationS ?? null]);
    }
    // Append the new pair to every non-terminal rollout whose two policies are both present.
    const byName = new Map(input.results.map(r => [r.policy, r]));
    const active = await db.query<RolloutRecord>(`${rolloutSelect} WHERE r.state NOT IN ('PROMOTED','ROLLED_BACK','ABANDONED') ORDER BY r.id FOR UPDATE OF r`);
    const appendedTo: TrialIngestResponse["appendedTo"] = [];
    for (const row of active.rows) {
      const b = byName.get(row.baseline), c = byName.get(row.candidate);
      if (!b || !c) continue;
      const pair: StreamPair = { sessionId: input.sessionId, t: new Date(input.occurredAt).toISOString(), site: input.site, instr: input.instruction,
        notes: input.notes, base: b.progress, cand: c.progress, d: c.progress - b.progress, durS: (b.durationS ?? 0) + (c.durationS ?? 0) };
      const pairs = [...row.pairs, pair];
      let decision: DecisionRecord | null = null;
      const caughtUp = row.cursor === row.pairs.length && ["EVALUATING", "CANARY", "EXPANDING"].includes(row.state);
      if (caughtUp) {
        const result = evaluateBatch({ state: row.state, stage: row.stage, stageStart: row.stage_start, cursor: row.cursor, pairs, config: configFor(row) },
          1, await lastVerdict(db, row.id));
        decision = (await persistReplay(db, row, result, pairs)).at(-1) ?? null;
      } else {
        await saveState(db, row, { state: row.state, cursor: row.cursor, stage: row.stage, stageStart: row.stage_start, pairs });
      }
      await appendAudit(db, "rollout", row.id, "INGEST", { sessionId: input.sessionId, d: pair.d, pairCount: pairs.length });
      appendedTo.push({ rolloutId: row.id, pairCount: pairs.length, decision });
    }
    const response: TrialIngestResponse = { sessionId: input.sessionId, inserted: input.results.length, appendedTo };
    await db.query("INSERT INTO idempotency_keys (key, request_hash, status, response) VALUES ($1, $2, $3, $4::jsonb)",
      [key, requestHash, 201, JSON.stringify(response)]);
    // Keep the in-memory read model consistent for this instance.
    const record = known ?? { id: input.sessionId, t: new Date(input.occurredAt).toISOString(), site: input.site, instr: input.instruction, notes: input.notes, policies: {} };
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const r of input.results) {
      const slot = letters[Object.keys(record.policies).length] ?? `P${Object.keys(record.policies).length}`;
      record.policies[slot] = { name: r.policy, success: r.success, progress: r.progress, duration: r.durationS ?? null };
    }
    if (!known) addSession(record);
    return { status: 201, body: response, replayed: false };
  });
}

export { IllegalTransition };
export type { PairObs };
