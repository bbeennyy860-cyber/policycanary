import type { CsPoint } from "../contract";
import { validateAlpha, validateDiffs } from "./math";

/**
 * Exact port of ref/cs.py (Waudby-Smith & Ramdas hedged-capital betting CS).
 * Production grid: m in {0.001..0.999} (denominator 1000, 999 points).
 * The peeking simulator alone uses denominator 200 (199 points) for speed.
 */
export function bettingCs(ds: number[], alpha = 0.05): CsPoint[] {
  validateDiffs(ds);
  const process = new BettingProcess(alpha);
  return ds.map(d => process.push(d));
}

export class BettingProcess {
  private readonly plus: Float64Array;
  private readonly minus: Float64Array;
  private readonly grid: Float64Array;
  private readonly logTerm: number;
  private readonly invAlpha: number;
  private lo = 0;
  private hi = 1;
  private n = 0;
  private sum = 0;
  private sumD = 0;
  private sq = 0;
  private variance = 0.25;

  constructor(alpha = 0.05, private readonly denominator = 1000) {
    validateAlpha(alpha);
    if (!Number.isInteger(denominator) || denominator < 2) throw new RangeError("invalid grid");
    const size = denominator - 1;
    this.grid = Float64Array.from({ length: size }, (_, i) => (i + 1) / denominator);
    this.plus = new Float64Array(size).fill(1);
    this.minus = new Float64Array(size).fill(1);
    this.logTerm = 2 * Math.log(2 / alpha);
    this.invAlpha = 1 / alpha;
  }

  push(d: number): CsPoint {
    const t = ++this.n;
    const x = (d + 1) / 2;
    const lam = Math.min(Math.sqrt(this.logTerm / (this.variance * t * Math.log(t + 1))), 0.5);
    let minAlive = Infinity, maxAlive = -Infinity;
    const { grid, plus, minus } = this;
    for (let i = 0; i < grid.length; i++) {
      const m = grid[i];
      plus[i] *= 1 + Math.min(lam, 0.5 / m) * (x - m);
      minus[i] *= 1 - Math.min(lam, 0.5 / (1 - m)) * (x - m);
      if (0.5 * plus[i] + 0.5 * minus[i] < this.invAlpha) {
        if (m < minAlive) minAlive = m;
        if (m > maxAlive) maxAlive = m;
      }
    }
    if (minAlive !== Infinity) {
      this.lo = Math.max(this.lo, minAlive);
      this.hi = Math.min(this.hi, maxAlive);
    }
    this.sum += x;
    this.sumD += d;
    this.sq += (x - this.sum / t) ** 2;
    this.variance = (0.25 + this.sq) / (t + 1);
    return { n: t, mean: this.sumD / t, lcb: round3(2 * this.lo - 1), ucb: round3(2 * this.hi - 1) };
  }
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
