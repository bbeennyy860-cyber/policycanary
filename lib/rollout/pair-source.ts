import type { PairObs } from "../contract";

/** W1 owns this module; importing lazily keeps machine-only tests independent. */
export async function loadPairs(base: string, cand: string): Promise<PairObs[]> {
  const { getPairs } = await import("../pairs");
  return getPairs(base, cand);
}
