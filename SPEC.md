# PolicyCanary — build contract (single source of truth for all workers)

## Product
Release gate for robot AI policies. A robotics team registers a baseline and a candidate policy, streams paired
trial outcomes, and PolicyCanary decides PROMOTE / ROLLBACK / HOLD with an anytime-valid sequential test,
walks the rollout through stages, and audits every decision and override. An AI "Slice Miner" reads evaluator
notes from the *discovery* period only and proposes failure slices; the engine tests them on the held-out
*confirmation* period with Holm correction. AI proposes, statistics disposes, a human approves.

Data: RoboArena DataDump (Hugging Face, MIT licence) snapshot in `data/roboarena_sessions.json`:
3,882 sessions, 10,781 policy episodes, 21 policies, 33 sites, 3,878 sessions with free-text notes.
Record shape:
```json
{"id":"uuid","t":"ISO-8601","site":"nvidia","instr":"Put the purple cylinder on the red can","pref":"B",
 "notes":"free text","policies":{"A":{"name":"pi0_droid","success":0,"progress":0.33,"duration":399},"B":{...}}}
```
Sessions are pre-sorted by `t` ascending. A session has 1, 2, 4 or 7 policy arms.

## Stack (fixed)
Next.js 15 App Router + TypeScript strict, Tailwind, Drizzle ORM + `@neondatabase/serverless` (Postgres via
Vercel Marketplace Neon, `DATABASE_URL`), zod, Vitest, Vercel AI SDK (`ai` + `@ai-sdk/openai`) with
`generateObject`, Recharts. Deploy on Vercel. No other dependencies without a reason in the commit message.

## Shared types — `lib/contract.ts` (W0 creates; nobody else edits)
```ts
export type Verdict = "CONTINUE" | "PROMOTE" | "ROLLBACK" | "HOLD";
export type RolloutState = "DRAFT" | "EVALUATING" | "CANARY" | "EXPANDING" | "PROMOTED" | "ROLLED_BACK" | "HOLD" | "ABANDONED";
export type Stage = "EVAL" | "CANARY_10" | "EXPAND_50" | "FULL";
export interface PairObs { sessionId: string; t: string; site: string; instr: string; notes: string; base: number; cand: number; d: number } // d = cand - base, progress in [0,1]
export interface CsPoint { n: number; mean: number; lcb: number; ucb: number }   // bounds on mean d in [-1,1]
export interface Decision { n: number; mean: number; lcb: number; ucb: number; verdict: Verdict; reason: string }
export interface GateConfig { alpha: number; margin: number; maxTrials: number; mode: "superiority" | "noninferiority" }
export interface SliceProposal { name: string; pattern: string; rationale: string } // pattern = case-insensitive JS regex over instr
export interface SliceResult extends SliceProposal { nDisc: number; meanDisc: number; nConf: number; meanConf: number; z: number; pOneSided: number; holmThreshold: number; confirmed: boolean; rejectReason?: string }
export const DEFAULT_GATE: GateConfig = { alpha: 0.05, margin: 0.02, maxTrials: 2000, mode: "superiority" };
```

## Postgres schema — `db/schema.ts` (W0 creates; W1 owns afterwards)
- `policies(id serial pk, name text unique not null)`
- `sites(id serial pk, name text unique not null)`
- `sessions(id uuid pk, occurred_at timestamptz not null, site_id fk, instruction text not null, notes text not null default '')`
- `trials(id serial pk, session_id fk, policy_id fk, success smallint not null, progress real not null check 0..1, duration_s int)`
  UNIQUE(session_id, policy_id)
- `rollouts(id serial pk, baseline_policy_id fk, candidate_policy_id fk, alpha real, margin real, max_trials int, mode text,
  state text not null default 'DRAFT', cursor int not null default 0, created_at timestamptz default now())`
  CHECK baseline <> candidate
- `decisions(id serial pk, rollout_id fk, stage text, n_pairs int, mean_diff real, lcb real, ucb real, verdict text, reason text, created_at)`
- `overrides(id serial pk, rollout_id fk, from_state text, to_state text, actor text not null, reason text not null check length>=10, created_at)`
- `slice_runs(id serial pk, rollout_id fk, source text check in ('llm','fallback'), model text, proposals jsonb, results jsonb, created_at)`
- `guardrails(id serial pk, rollout_id fk, slice_name text, pattern text, approved_by text not null, created_at)`
- `audit_log(id serial pk, entity text, entity_id int, action text, payload jsonb, created_at)`

## Statistics (W2, pure TS in `lib/stats/`, no I/O)
1. `wilson(k, n, z=1.96)` → [lo, hi]. Golden: wilson(7,10) ≈ [0.397, 0.892].
2. `bettingCs(ds: number[], alpha=0.05): CsPoint[]` — Waudby-Smith & Ramdas (2023) hedged-capital confidence
   sequence for the mean of bounded data. Map x = (d+1)/2 ∈ [0,1]. Grid m ∈ {0.001..0.999 step 0.001}.
   Predictable plug-in bet: λ_t = min( sqrt(2·ln(2/α) / (σ̂²_{t-1} · t · ln(t+1))), 0.5 ), with
   σ̂²_0 = 0.25 and σ̂²_t = (0.25 + Σ(x_i − x̄_i)²)/(t+1) updated AFTER using λ_t.
   K⁺_t(m) *= 1 + min(λ_t, 0.5/m)(x_t − m);  K⁻_t(m) *= 1 − min(λ_t, 0.5/(1−m))(x_t − m).
   m stays in the set while ½K⁺ + ½K⁻ < 1/α. Running intersection: lo = max(lo, min alive), hi = min(hi, max alive).
   Return bounds mapped back: L = 2·lo − 1, U = 2·hi − 1, rounded to 3 dp. Valid under continuous monitoring.
3. `decide(cs: CsPoint, cfg): Verdict` — ROLLBACK if U < −margin; PROMOTE if L > 0 (superiority) or L > −margin
   (non-inferiority); HOLD if n ≥ maxTrials or data exhausted; else CONTINUE. Reason string must cite n, L, U.
4. `testSlices(pairs, proposals, splitIndex)` — discovery = pairs[0..split), confirmation = pairs[split..].
   For each proposal: compile regex (invalid → rejected "invalid pattern"); require nConf ≥ 15 (else rejected "too few");
   one-sided z = mean/(sd/√n) on confirmation d's (H1: mean < 0); p via erfc. Holm step-down across ALL proposals at α=0.05:
   sort p ascending, threshold_k = α/(m−k), stop at first failure. confirmed = passes Holm AND meanConf < −margin.
   splitIndex = floor(pairs.length/2) (chronological; the LLM never sees confirmation rows).

### Golden values — `data/golden.json` (computed by reference Python on this exact data; tests MUST match)
| Rollout (base → cand) | pairs | mean d | verdict | at pair | CS at decision |
|---|---|---|---|---|---|
| pi0_droid → pi0_fast_droid | 710 | +0.1159 | PROMOTE | 136 | [0.006, 0.250] |
| paligemma_fast_droid → paligemma_binning_droid | 677 | −0.3575 | ROLLBACK | 55 | [−0.628, −0.028] |
| pi0_fast_droid → paligemma_fast_specialist_droid | 691 | −0.0316 | HOLD | 691 | [−0.072, 0.010] |
Pairing rule: a session contributes one pair when both policies appear in it; d = cand.progress − base.progress.
Slice reference (specialist rollout, split=345): regex `fold|towel|cloth|napkin|shirt|rag|fabric` →
disc n=34 mean −0.188; conf n=32 mean −0.170, z −2.55, p 0.0054. With ≤8 proposals it survives Holm (0.05/8=0.00625).
CAVEAT (verified): that substring regex also matches "sto*rag*e"; the clean word-boundary version
`\b(fold\w*|towels?|cloth\w*|napkins?|shirts?|rags?|fabric)\b` gives conf n=31 mean −0.158 p 0.0099, which passes
Holm only if it is the smallest p among ≤5 proposals. The finding is real but borderline. Do NOT tune proposal counts or
patterns to force confirmation; the UI shows whatever the engine decides. Tests use the substring regex above as a fixed fixture.
Other reference slices on conf: cup|mug|bowl n=87 −0.066 p 0.054; drawer|open|close n=42 −0.064 p 0.13 (should be rejected).

## Rollout state machine (W3, `lib/rollout/machine.ts`)
DRAFT→EVALUATING (start). EVALUATING→CANARY on PROMOTE | ROLLED_BACK on ROLLBACK | HOLD on HOLD.
CANARY→EXPANDING on PROMOTE (stage-2 replay continues from cursor) | ROLLED_BACK. EXPANDING→PROMOTED | ROLLED_BACK.
HOLD→EVALUATING (raise maxTrials, audited) | ABANDONED. Any non-terminal → ROLLED_BACK if an approved guardrail
slice is confirmed regressing on the rollout's data. Manual override from any non-terminal state with actor + reason ≥10 chars.
Terminal: PROMOTED, ROLLED_BACK, ABANDONED. Illegal transition → HTTP 409. Every transition writes audit_log.
Stage mapping for replay: pairs are consumed in chronological order; first decision crossing moves EVAL→CANARY_10;
the gate then resets the CS on the remaining stream for CANARY_10→EXPAND_50 and EXPAND_50→FULL. If the stream ends
before a crossing, verdict HOLD. (Replay narrates stages over historical data; UI labels it "replay of RoboArena evaluations".)

## API (W3 owns routes; all inputs zod-validated; errors `{error}` JSON)
- `GET /api/health` → `{ok, db, sessions, trials}`
- `GET /api/policies` → names + episode counts. `GET /api/pairs?base=&cand=` → pair count + mean.
- `POST /api/rollouts {baseline, candidate, alpha?, margin?, maxTrials?, mode?}` → 201 rollout. Same policy twice → 400. Unknown policy → 404.
- `GET /api/rollouts`, `GET /api/rollouts/:id` → rollout + decisions + overrides + guardrails + audit + cs series.
- `POST /api/rollouts/:id/replay {batch=25}` → advances cursor by batch pairs, writes one decision row per evaluated pair
  batch end (and always on a verdict change), applies transitions. Idempotent on cursor: concurrent calls use
  `UPDATE ... WHERE cursor = $expected` optimistic lock; loser gets 409.
- `POST /api/trials {sessionId, occurredAt, site, instruction, notes?, results:[{policy, success, progress, durationS}]}` → 201;
  duplicate (session, policy) → 409; progress outside [0,1] → 400. Ingested pairs are appended to matching active rollouts.
- `POST /api/rollouts/:id/override {toState, actor, reason}` → 400 if reason <10 chars; 409 if illegal.
- `POST /api/rollouts/:id/slices` → runs Slice Miner (W5) then testSlices; stores slice_runs row; returns results.
- `POST /api/rollouts/:id/guardrails {sliceName, approvedBy}` → only for a confirmed slice from latest run, else 409; then
  re-evaluates guardrail → may transition to ROLLED_BACK with reason "guardrail: <slice> confirmed regression".

## UI (W4, `app/(dash)/**`, components/)
Single dashboard, dark, dense, professional. Pages: `/` overview (counts, policy table, "new rollout" form),
`/rollouts/[id]` detail: state badge + stage timeline; confidence-band chart (mean, L, U vs n, zero line, ±margin lines);
Replay button (calls replay repeatedly until terminal/HOLD, animates); decisions table; Slice Miner panel (proposals with
rationale, confirmed vs rejected with n/mean/p/threshold, "approve as guardrail" button); override form; audit log.
Copy must be honest: "replay of real RoboArena evaluation sessions (MIT)", "confirmed on later held-out data".

## Demo script (≤2 min)
1. Overview: 21 policies, 33 sites, 10,781 real episodes.
2. pi0_droid → pi0_fast_droid: Replay → PROMOTE at pair 136 → CANARY; band visibly tightens.
3. paligemma_fast → paligemma_binning: ROLLBACK at pair 55 (622 pairs earlier than running all 677).
4. pi0_fast → fast_specialist: HOLD — "no detectable difference overall". Mine slices → AI proposes ≤8 → engine rejects most,
   confirms deformable (−0.17 on held-out). Approve as guardrail → ROLLED_BACK, audited.
5. curl a new trial into /api/trials → new decision row. Override form rejects an empty reason.
