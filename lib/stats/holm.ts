import { validateAlpha } from "./math";

export interface HolmResult { p: number; threshold: number; rejected: boolean }

/** Step-down tests in input order; invalid/untestable proposals must enter as p=1. */
export function holm(ps: readonly number[], alpha = 0.05): HolmResult[] {
  validateAlpha(alpha);
  if (ps.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new RangeError("p must be in [0, 1]");
  const ordered = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i);
  const results: HolmResult[] = new Array(ps.length);
  let stopped = false;
  ordered.forEach(({ p, i }, rank) => {
    const threshold = alpha / (ps.length - rank);
    const rejected = !stopped && p <= threshold;
    if (!rejected) stopped = true;
    results[i] = { p, threshold, rejected };
  });
  return results;
}
