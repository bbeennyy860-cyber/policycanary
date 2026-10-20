/** Complementary error function; relative error about 1.2e-7 (NR approximation). */
export function erfc(x: number): number {
  if (x === 0) return 1;
  if (x === Infinity) return 0;
  if (x === -Infinity) return 2;
  const t = 1 / (1 + Math.abs(x) / 2);
  const tail = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t *
    (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t *
    (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? tail : 2 - tail;
}

export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}
export { normalCdf as normalCDF };

export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0, 1)");
  let lo = -40, hi = 40;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function validateAlpha(alpha: number): void {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError("alpha must be in (0, 1)");
}

export function validateDiffs(ds: readonly number[]): void {
  if (ds.some(d => !Number.isFinite(d) || d < -1 || d > 1)) {
    throw new RangeError("paired differences must be finite and in [-1, 1]");
  }
}

/** Sample variance, using Welford's stable recurrence. Empty samples have mean 0. */
export function moments(xs: readonly number[]): { n: number; mean: number; variance: number } {
  let mean = 0, m2 = 0, n = 0;
  for (const x of xs) {
    n++;
    const delta = x - mean;
    mean += delta / n;
    m2 += delta * (x - mean);
  }
  return { n, mean, variance: n > 1 ? Math.max(0, m2 / (n - 1)) : 0 };
}

// Lanczos log-gamma and a continued fraction for the regularized incomplete beta.
function logGamma(z: number): number {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z--;
  let x = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) x += coefficients[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const safe = (v: number): number => Math.abs(v) < tiny ? tiny : v;
  let c = 1, d = 1 / safe(1 - (a + b) * x / (a + 1)), h = d;
  for (let m = 1; m <= 200; m++) {
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 / safe(1 + aa * d); c = safe(1 + aa / c); h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 / safe(1 + aa * d); c = safe(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b;
}

/** Exact Student-t CDF (up to numerical precision), used by the naive peeking test. */
export function studentTCdf(t: number, df: number): number {
  if (!(df > 0 && Number.isFinite(df))) throw new RangeError("df must be positive and finite");
  const tail = 0.5 * regularizedBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0, 1)");
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  let lo = 0, hi = 1;
  while (studentTCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
