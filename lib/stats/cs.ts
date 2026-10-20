import type { CsPoint } from "../contract";
import { validateAlpha, validateDiffs } from "./math";

export function bettingCs(ds: number[], alpha = 0.05): CsPoint[] {
  validateDiffs(ds);
  const process = new BettingProcess(alpha);
  return ds.map(d => process.push(d));
}

/** Internal shared kernel. Production uses denominator 1000 (999 interior points).
 * Only the peeking simulator uses denominator 200 (199 interior points).
 */
export class BettingProcess {
  private readonly plus: Float64Array;
  private readonly minus: Float64Array;
  private readonly grid: Float64Array;
  private readonly logTerm: number;
  private readonly threshold: number;
  private left = 0;
  private right: number;
  private n = 0;
  private sum = 0;
  private sumD = 0;
  private sq = 0;
  private variance = 0.25;

  constructor(alpha = 0.05, private readonly denominator = 1000) {
    validateAlpha(alpha);
    if (!Number.isInteger(denominator) || denominator < 2) throw new RangeError("invalid grid");
    this.grid = Float64Array.from({ length: denominator - 1 }, (_, i) => (i + 1) / denominator);
    this.plus = new Float64Array(denominator - 1).fill(1);
    this.minus = new Float64Array(denominator - 1).fill(1);
    this.right = denominator - 2;
    this.logTerm = 2 * Math.log(2 / alpha);
    this.threshold = 2 / alpha;
  }

  push(d: number): CsPoint {
    const n = ++this.n, x = (d + 1) / 2;
    const lambda = Math.min(Math.sqrt(this.logTerm / (this.variance * n * Math.log(n + 1))), 0.5);
    // Both truncations min(lambda, .5/m) equal lambda since lambda <= .5.
    // The capital is convex in m, so its sublevel set is an interval. Once a
    // boundary is excluded it can never re-enter the running intersection.
    for (let i = this.left; i <= this.right; i++) {
      const bet = lambda * (x - this.grid[i]);
      this.plus[i] *= 1 + bet;
      this.minus[i] *= 1 - bet;
    }
    while (this.left <= this.right && this.plus[this.left] + this.minus[this.left] >= this.threshold) this.left++;
    while (this.right >= this.left && this.plus[this.right] + this.minus[this.right] >= this.threshold) this.right--;
    this.sum += x;
    this.sumD += d;
    this.sq += (x - this.sum / n) ** 2;
    this.variance = (0.25 + this.sq) / (n + 1);
    // An empty intersection is explicitly represented by reversed bounds.
    return { n, mean: this.sumD / n,
      lcb: this.left > this.right ? 1 : this.roundBound(this.grid[this.left]),
      ucb: this.left > this.right ? -1 : this.roundBound(this.grid[this.right]) };
  }

  private roundBound(m: number): number {
    return Math.round((2 * m - 1) * 1000) / 1000;
  }
}
