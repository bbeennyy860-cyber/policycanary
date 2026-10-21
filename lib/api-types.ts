/**
 * Response types for every PolicyCanary API route. All errors are `{ error: string }`
 * with a non-2xx status (400 validation, 404 unknown, 409 conflict, 503 database unavailable).
 */
import type { CsPoint, GateConfig, RolloutState, SliceProposal, SliceResult, Stage, Verdict } from "./contract";

export type { CsPoint, GateConfig, RolloutState, SliceProposal, SliceResult, Stage, Verdict };

export interface ApiError { error: string }

/** GET /api/health */
export interface HealthResponse {
  ok: boolean; db: boolean; dataSource: "json";
  sessions: number; trials: number; policies: number; sites: number;
}

/** GET /api/policies */
export interface PolicySummary { name: string; episodes: number; sessions: number; successRate: number; meanProgress: number }
export interface PoliciesResponse {
  policies: PolicySummary[];
  totals: { sessions: number; episodes: number; policies: number; sites: number; sessionsWithNotes: number };
}

/** GET /api/pairs?base=&cand= */
export interface PairsResponse { base: string; cand: string; count: number; mean: number | null }

/** Rollout as returned by list/create/replay/override/guardrail routes. */
export interface Rollout {
  id: number; baseline: string; candidate: string;
  alpha: number; margin: number; maxTrials: number; mode: GateConfig["mode"];
  state: RolloutState; stage: Stage; stageStart: number; cursor: number; pairCount: number;
  revision: number; createdAt: string;
}

export interface DecisionRecord {
  id: number; stage: Stage; n: number; mean: number; lcb: number; ucb: number;
  verdict: Verdict; reason: string; createdAt: string;
}
export interface OverrideRecord { id: number; fromState: RolloutState; toState: RolloutState; actor: string; reason: string; createdAt: string }
export interface GuardrailRecord { id: number; sliceName: string; pattern: string; approvedBy: string; createdAt: string }
export interface AuditEntry {
  id: number; entity: string; entityId: number; action: string;
  payload: Record<string, unknown>; prevHash: string; hash: string; createdAt: string;
}
/** GET /api/rollouts/:id/audit/verify */
export interface AuditVerification { valid: boolean; length: number; firstBrokenId: number | null }

export interface TestedSliceResult extends SliceResult { permutationPValue: number }
export interface SliceRun {
  id: number; source: "llm" | "fallback"; model: string | null; splitIndex: number;
  proposals: SliceProposal[]; results: TestedSliceResult[]; createdAt: string;
}

/** G2 time-to-decision ledger (fixed-horizon fields are an oracle reference). */
export interface SavingsResult {
  verdict: Verdict; decidedAt: number; totalPairs: number;
  robotHoursUsed: number; robotHoursAll: number; pctUsed: number;
  fixedHorizonPairs: number; fixedHorizonCapped: boolean; robotHoursFixed: number; // capped => label "≥"
  sigma: number; delta: number;
}

/** G4 per-site heterogeneity. */
export interface SiteStat { site: string; n: number; meanDiff: number; se: number; winRate: number; winCi: [number, number] }
export interface SiteHeterogeneity {
  sites: SiteStat[]; // sites with n >= 10
  q: number; df: number; pValue: number; i2: number;
  concentratedAt: string[]; // sites whose mean diff is significantly < 0 after Holm correction across sites
}

/** GET /api/rollouts/:id */
export interface RolloutDetail extends Rollout {
  decisions: DecisionRecord[]; overrides: OverrideRecord[]; guardrails: GuardrailRecord[];
  audit: AuditEntry[]; auditVerification: AuditVerification;
  cs: CsPoint[]; csStage: Stage;            // CS series of the current (or just-completed) stage up to cursor
  sliceRuns: SliceRun[]; latestSliceRun: SliceRun | null;
  savings: SavingsResult | null;            // null until the gate has reached a decision
  sites: SiteHeterogeneity;                 // replayed pairs only
}

/** GET /api/rollouts */
export interface RolloutsListResponse { rollouts: Rollout[] }
/** POST /api/rollouts -> 201 */
export interface CreateRolloutRequest { baseline: string; candidate: string; alpha?: number; margin?: number; maxTrials?: number; mode?: GateConfig["mode"] }
export type CreateRolloutResponse = Rollout;

/** POST /api/rollouts/:id/replay { batch?: number } */
export interface ReplayResponse { rollout: Rollout; decisions: DecisionRecord[]; decision: DecisionRecord | null; stopped: boolean }

/** POST /api/rollouts/:id/override { toState, actor, reason, maxTrials? } */
export interface OverrideRequest { toState: RolloutState; actor: string; reason: string; maxTrials?: number }
export interface OverrideResponse { rollout: Rollout; override: OverrideRecord }

/** POST /api/rollouts/:id/slices */
export type SlicesResponse = SliceRun;

/** POST /api/rollouts/:id/guardrails { sliceName, approvedBy } -> 201 */
export interface GuardrailResponse { rollout: Rollout; guardrail: GuardrailRecord; reason: string }

/** GET /api/rollouts/:id/peeking (G1) */
export interface PeekingResponse {
  replications: number; seed: number; alpha: number; gridPoints: number; peekEvery: number; nPairs: number;
  naiveFalseRate: number; csFalseRate: number; naiveFalseDecisions: number; csFalseDecisions: number; elapsedMs: number;
}

/** POST /api/trials (Idempotency-Key header required) -> 201 */
export interface TrialIngestRequest {
  sessionId: string; occurredAt: string; site: string; instruction: string; notes?: string;
  results: { policy: string; success: 0 | 1; progress: number; durationS?: number | null }[];
}
export interface TrialIngestResponse {
  sessionId: string; inserted: number;
  appendedTo: { rolloutId: number; pairCount: number; decision: DecisionRecord | null }[];
}

/** GET /api/leaderboard (G3) */
export interface LeaderboardEntry {
  rank: number | null; name: string; logStrength: number; ci: [number, number] | null; comparisons: number; insufficientData: boolean;
}
export interface LeaderboardResponse { entries: LeaderboardEntry[]; sessionsUsed: number; bootstrapResamples: number; seed: number }
