export function wilson(k: number, n: number, z = 1.96): [number, number] {
  // Fractional k supports half-credit ties in a site's win rate.
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(k) || k < 0 || k > n
    || !Number.isFinite(z) || z < 0) throw new RangeError("invalid Wilson inputs");
  if (n === 0) return [0, 1];
  const p = k / n, zz = z * z, denominator = 1 + zz / n;
  const center = (p + zz / (2 * n)) / denominator;
  const radius = z * Math.sqrt(p * (1 - p) / n + zz / (4 * n * n)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
