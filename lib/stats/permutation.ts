import { validateDiffs } from "./math";
import { mulberry32 } from "./random";

export interface PermutationOptions { permutations?: number; seed?: number }

/** Paired label randomization: independently swap baseline/candidate within each
 * held-out pair (equivalently sign-flip d). H1 is mean < 0. Never shuffle discovery
 * observations into confirmation. Add-one correction prevents zero Monte Carlo p.
 */
export function permutationPValue(ds: readonly number[], options: PermutationOptions = {}): number {
  validateDiffs(ds);
  const { permutations = 2000, seed = 0x51ce } = options;
  if (!Number.isInteger(permutations) || permutations < 1) throw new RangeError("permutations must be positive");
  const random = mulberry32(seed);
  if (ds.length === 0) return 1;
  const observed = ds.reduce((sum, d) => sum + d, 0);
  // Allow for round-off when equal sums are formed in a different sign order.
  const tolerance = 1e-12 * Math.max(1, ds.length);
  let extreme = 0;
  for (let r = 0; r < permutations; r++) {
    let sum = 0;
    for (const d of ds) sum += random() < 0.5 ? d : -d;
    if (sum <= observed + tolerance) extreme++;
  }
  return (extreme + 1) / (permutations + 1);
}
