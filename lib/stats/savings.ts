import type { GateConfig, Verdict } from "../contract";
import { runGate } from "./decide";
import { moments, normalQuantile } from "./math";

export interface SavingsResult {
  verdict: Verdict; decidedAt: number; totalPairs: number;
  fixedHorizonPairs: number; fixedHorizonCapped: boolean;
  pairsSaved: number; robotHoursUsed: number; robotHoursFixed: number; robotHoursSaved: number; pctSaved: number;
  sigma: number; delta: number;
}

/**
 * G2: robot time up to the sequential decision vs a fixed-horizon test sized by
 * n = ((z_{1-a/2} + z_{0.8}) * sigma / delta)^2, delta = |final mean|, sigma = sample sd,
 * capped at available pairs (capped => display as ">=").
 * durationsS[i] = robot seconds spent on pair i (both arms).
 */
export function savings(ds: number[], durationsS: number[], cfg: GateConfig): SavingsResult {
  if (durationsS.length !== ds.length) throw new RangeError("durations must align with diffs");
  const total = ds.length;
  if (total === 0) {
    return { verdict: "HOLD", decidedAt: 0, totalPairs: 0, fixedHorizonPairs: 0, fixedHorizonCapped: false, pairsSaved: 0,
      robotHoursUsed: 0, robotHoursFixed: 0, robotHoursSaved: 0, pctSaved: 0, sigma: 0, delta: 0 };
  }
  const { decision, decidedAt } = runGate(ds, cfg);
  const m = moments(ds);
  const sigma = Math.sqrt(m.variance), delta = Math.abs(m.mean);
  const z = normalQuantile(1 - cfg.alpha / 2) + normalQuantile(0.8);
  const raw = delta > 0 ? Math.ceil(((z * sigma) / delta) ** 2) : Infinity;
  const capped = !(raw <= total);
  const fixed = capped ? total : Math.max(1, raw);
  const secondsTo = (k: number) => durationsS.slice(0, k).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const used = secondsTo(decidedAt) / 3600, fixedH = secondsTo(fixed) / 3600;
  const saved = Math.max(0, fixedH - used);
  return { verdict: decision.verdict, decidedAt, totalPairs: total, fixedHorizonPairs: fixed, fixedHorizonCapped: capped,
    pairsSaved: Math.max(0, fixed - decidedAt), robotHoursUsed: round(used), robotHoursFixed: round(fixedH),
    robotHoursSaved: round(saved), pctSaved: fixedH > 0 ? round((saved / fixedH) * 100) : 0,
    sigma: round(sigma), delta: round(delta) };
}

function round(v: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
