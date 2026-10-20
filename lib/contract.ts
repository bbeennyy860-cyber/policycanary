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
