import type { GateConfig, Verdict } from "../contract";
import { runGate } from "./decide";
import { moments, normalQuantile } from "./math";

export interface SavingsResult {
  verdict: Verdict; decidedAt: number; totalPairs: number;
  robotHoursUsed: number; robotHoursAll: number; pctUsed: number;
  fixedHorizonPairs: number; fixedHorizonCapped: boolean; robotHoursFixed: number;
  sigma: number; delta: number;
}

/**
 * G2: robot time to the sequential decision vs running every available pair.
 * Also reports the oracle fixed-horizon size n = ((z_{1-a/2} + z_{0.8}) * sigma / delta)^2 with
 * delta = |final mean|: that needs the true effect up front, so it is a reference point, not a fair baseline.
 * durationsS[i] = robot seconds spent on pair i (both arms).
 */
export function savings(ds: number[], durationsS: number[], cfg: GateConfig): SavingsResult {
  if (durationsS.length !== ds.length) throw new RangeError("durations must align with diffs");
  const total = ds.length;
  if (total === 0) {
    return { verdict: "HOLD", decidedAt: 0, totalPairs: 0, robotHoursUsed: 0, robotHoursAll: 0, pctUsed: 0,
      fixedHorizonPairs: 0, fixedHorizonCapped: false, robotHoursFixed: 0, sigma: 0, delta: 0 };
  }
  const { decision, decidedAt } = runGate(ds, cfg);
  const m = moments(ds);
  const sigma = Math.sqrt(m.variance), delta = Math.abs(m.mean);
  const z = normalQuantile(1 - cfg.alpha / 2) + normalQuantile(0.8);
  const raw = delta > 0 ? Math.ceil(((z * sigma) / delta) ** 2) : Infinity;
  const capped = !(raw <= total);
  const fixed = capped ? total : Math.max(1, raw);
  const hoursTo = (k: number) => durationsS.slice(0, k).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) / 3600;
  const used = hoursTo(decidedAt), all = hoursTo(total);
  return { verdict: decision.verdict, decidedAt, totalPairs: total,
    robotHoursUsed: round(used), robotHoursAll: round(all), pctUsed: all > 0 ? round((used / all) * 100) : 0,
    fixedHorizonPairs: fixed, fixedHorizonCapped: capped, robotHoursFixed: round(hoursTo(fixed)),
    sigma: round(sigma), delta: round(delta) };
}

function round(v: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
