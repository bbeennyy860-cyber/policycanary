import type { PairObs } from "../contract";
import { holm } from "./holm";
import { moments, normalCdf } from "./math";
import { wilson } from "./wilson";

export interface SiteStat { site: string; n: number; meanDiff: number; se: number; winRate: number; winCi: [number, number] }
export interface SiteHeterogeneity { sites: SiteStat[]; q: number; df: number; pValue: number; i2: number; concentratedAt: string[] }

/**
 * G4: per-site mean diff + Wilson CI on win rate (ties = half), Cochran's Q and I^2 across sites with n >= minN.
 * A site is flagged as a regression only after Holm correction across sites, the same standard the slice miner uses.
 */
export function siteHeterogeneity(pairs: PairObs[], minN = 10): SiteHeterogeneity {
  const groups = new Map<string, number[]>();
  for (const p of pairs) {
    const list = groups.get(p.site) ?? [];
    list.push(p.d);
    groups.set(p.site, list);
  }
  const sites: SiteStat[] = [];
  const pOneSided = new Map<string, number>();
  for (const [site, ds] of groups) {
    if (ds.length < minN) continue;
    const m = moments(ds);
    const se = Math.sqrt(m.variance / ds.length);
    pOneSided.set(site, se > 0 ? normalCdf(m.mean / se) : 1); // no spread, no estimable z: stay conservative
    const wins = ds.reduce((s, d) => s + (d > 0 ? 1 : d === 0 ? 0.5 : 0), 0);
    const ci = wilson(wins, ds.length);
    sites.push({ site, n: ds.length, meanDiff: r(m.mean), se: r(se), winRate: r(wins / ds.length), winCi: [r(ci[0]), r(ci[1])] });
  }
  sites.sort((a, b) => a.meanDiff - b.meanDiff || a.site.localeCompare(b.site));
  const floor = 1e-4; // variance floor for sites with identical outcomes
  const weights = sites.map(s => 1 / Math.max(s.se * s.se, floor / s.n));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const pooled = wSum ? sites.reduce((acc, s, i) => acc + weights[i] * s.meanDiff, 0) / wSum : 0;
  const q = sites.reduce((acc, s, i) => acc + weights[i] * (s.meanDiff - pooled) ** 2, 0);
  const df = Math.max(0, sites.length - 1);
  const pValue = df > 0 ? 1 - chiSquareCdf(q, df) : 1;
  const i2 = q > 0 ? Math.max(0, (q - df) / q) : 0;
  const tests = holm(sites.map(s => pOneSided.get(s.site)!));
  const concentratedAt = sites.filter((s, i) => tests[i].rejected).map(s => s.site);
  return { sites, q: r(q), df, pValue: r(pValue, 6), i2: r(i2), concentratedAt };
}

/** Regularized lower incomplete gamma P(a, x) (NR series / continued fraction). */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

function logGamma(z: number): number {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z--;
  let x = 0.9999999999998099;
  for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function chiSquareCdf(x: number, df: number): number { return gammaP(df / 2, x / 2); }

function r(v: number, dp = 4): number { const f = 10 ** dp; return Math.round(v * f) / f; }
