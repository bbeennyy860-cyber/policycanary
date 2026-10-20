import { BettingProcess } from "./cs";
import { studentTCdf } from "./math";
import { mulberry32 } from "./random";

export interface PeekingOptions { replications?: number; seed?: number; alpha?: number; peekEvery?: number; gridDenominator?: number }
export interface PeekingResult {
  replications: number; seed: number; alpha: number; gridPoints: number; peekEvery: number; nPairs: number;
  naiveFalseRate: number; csFalseRate: number; naiveFalseDecisions: number; csFalseDecisions: number; elapsedMs: number;
}

/**
 * G1: under the null (random sign flips of the real paired diffs, so the true mean is 0),
 * compare naive "t-test after every `peekEvery` pairs, decide if p < alpha" against the betting CS
 * (decide when the CS excludes 0). Uses a coarser 199-point grid for speed (documented).
 */
export function simulatePeeking(ds: number[], opts: PeekingOptions = {}): PeekingResult {
  const started = Date.now();
  const { replications = 400, seed = 20261020, alpha = 0.05, peekEvery = 10, gridDenominator = 200 } = opts;
  const random = mulberry32(seed);
  let naiveFalse = 0, csFalse = 0;
  const n = ds.length;
  const flipped = new Float64Array(n);
  for (let r = 0; r < replications; r++) {
    for (let i = 0; i < n; i++) flipped[i] = random() < 0.5 ? ds[i] : -ds[i];
    // Naive repeated t-tests.
    let sum = 0, sumSq = 0, naiveHit = false;
    for (let i = 0; i < n && !naiveHit; i++) {
      sum += flipped[i]; sumSq += flipped[i] * flipped[i];
      const k = i + 1;
      if (k % peekEvery === 0 && k >= 2) {
        const mean = sum / k;
        const variance = (sumSq - k * mean * mean) / (k - 1);
        if (variance <= 0) { if (mean !== 0) naiveHit = true; continue; }
        const t = mean / Math.sqrt(variance / k);
        const p = 2 * (1 - studentTCdf(Math.abs(t), k - 1));
        if (p < alpha) naiveHit = true;
      }
    }
    if (naiveHit) naiveFalse++;
    // Anytime-valid betting CS.
    const process = new BettingProcess(alpha, gridDenominator);
    for (let i = 0; i < n; i++) {
      const point = process.push(flipped[i]);
      if (point.lcb > 0 || point.ucb < 0) { csFalse++; break; }
    }
  }
  return { replications, seed, alpha, gridPoints: gridDenominator - 1, peekEvery, nPairs: n,
    naiveFalseRate: replications ? naiveFalse / replications : 0, csFalseRate: replications ? csFalse / replications : 0,
    naiveFalseDecisions: naiveFalse, csFalseDecisions: csFalse, elapsedMs: Date.now() - started };
}
