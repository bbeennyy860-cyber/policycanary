import { mulberry32 } from "./random";

export interface BtSession { arms: { name: string; progress: number }[] }
export interface BtEntry { rank: number | null; name: string; logStrength: number; ci: [number, number] | null; comparisons: number; insufficientData: boolean }
export interface BtResult { entries: BtEntry[]; sessionsUsed: number; bootstrapResamples: number; seed: number }

interface Contribution { i: number; j: number; wi: number } // one comparison; wi in {0, 0.5, 1}

/** Hunter (2004) MM iterations. A tiny symmetric pseudo-count (0.01 win each way per compared pair) keeps strengths finite. */
export function fitBt(k: number, wins: Float64Array, counts: Float64Array, tol = 1e-8, maxIter = 5000): Float64Array {
  let p = new Float64Array(k).fill(1);
  const w = new Float64Array(k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j && counts[i * k + j] > 0) w[i] += wins[i * k + j] + 0.01;
  for (let iter = 0; iter < maxIter; iter++) {
    const next = new Float64Array(k);
    for (let i = 0; i < k; i++) {
      let denom = 0;
      for (let j = 0; j < k; j++) {
        const nij = counts[i * k + j];
        if (i !== j && nij > 0) denom += (nij + 0.02) / (p[i] + p[j]);
      }
      next[i] = denom > 0 ? w[i] / denom : p[i];
    }
    let logMean = 0, active = 0;
    for (let i = 0; i < k; i++) if (next[i] > 0) { logMean += Math.log(next[i]); active++; }
    const scale = Math.exp(active ? logMean / active : 0);
    let delta = 0;
    for (let i = 0; i < k; i++) { next[i] /= scale; delta = Math.max(delta, Math.abs(next[i] - p[i])); }
    p = next;
    if (delta < tol) break;
  }
  return p;
}

export function bradleyTerry(sessions: BtSession[], opts: { resamples?: number; seed?: number; minComparisons?: number } = {}): BtResult {
  const { resamples = 200, seed = 7, minComparisons = 30 } = opts;
  sessions = sessions.filter(s => s.arms.length >= 2); // single-arm sessions compare nothing
  const names = [...new Set(sessions.flatMap(s => s.arms.map(a => a.name)))].sort();
  const index = new Map(names.map((n, i) => [n, i]));
  const k = names.length;
  const perSession: Contribution[][] = [];
  for (const s of sessions) {
    const list: Contribution[] = [];
    for (let a = 0; a < s.arms.length; a++) for (let b = a + 1; b < s.arms.length; b++) {
      const x = s.arms[a], y = s.arms[b];
      list.push({ i: index.get(x.name)!, j: index.get(y.name)!, wi: x.progress > y.progress ? 1 : x.progress < y.progress ? 0 : 0.5 });
    }
    perSession.push(list);
  }
  const accumulate = (pick: (add: (c: Contribution[]) => void) => void) => {
    const wins = new Float64Array(k * k), counts = new Float64Array(k * k);
    pick(list => {
      for (const c of list) {
        wins[c.i * k + c.j] += c.wi; wins[c.j * k + c.i] += 1 - c.wi;
        counts[c.i * k + c.j] += 1; counts[c.j * k + c.i] += 1;
      }
    });
    return { wins, counts };
  };
  const full = accumulate(add => perSession.forEach(add));
  const strengths = fitBt(k, full.wins, full.counts);
  const random = mulberry32(seed);
  const samples: number[][] = names.map(() => []);
  for (let r = 0; r < resamples; r++) {
    const boot = accumulate(add => { for (let s = 0; s < perSession.length; s++) add(perSession[Math.floor(random() * perSession.length)]); });
    const p = fitBt(k, boot.wins, boot.counts, 1e-6, 2000);
    for (let i = 0; i < k; i++) if (boot.counts.subarray(i * k, i * k + k).some(v => v > 0)) samples[i].push(Math.log(p[i]));
  }
  const quantile = (xs: number[], q: number) => {
    if (!xs.length) return NaN;
    const sorted = xs.slice().sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  // Insufficient-data policies are listed after the ranked ones, unranked: their strength is mostly prior.
  let rank = 0;
  const entries = names.map((name, i) => {
    let comparisons = 0;
    for (let j = 0; j < k; j++) comparisons += full.counts[i * k + j];
    return { rank: null as number | null, name, logStrength: r4(Math.log(strengths[i])),
      ci: samples[i].length ? [r4(quantile(samples[i], 0.025)), r4(quantile(samples[i], 0.975))] as [number, number] : null,
      comparisons, insufficientData: comparisons < minComparisons };
  }).sort((a, b) => Number(a.insufficientData) - Number(b.insufficientData) || b.logStrength - a.logStrength)
    .map(e => ({ ...e, rank: e.insufficientData ? null : ++rank }));
  return { entries, sessionsUsed: perSession.length, bootstrapResamples: resamples, seed };
}

function r4(v: number): number { return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }
