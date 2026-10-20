import type { PairObs } from "./contract";
import { getPairsFromData } from "./data";

/** Pairs come from the in-memory RoboArena snapshot (ordered by t, then id). */
export async function getPairs(base: string, cand: string): Promise<PairObs[]> {
  return getPairsFromData(base, cand);
}
