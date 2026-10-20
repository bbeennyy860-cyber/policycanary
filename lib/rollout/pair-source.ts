import type { PairObs } from "../contract";
import { getPairsFromData, pairDurations } from "../data";

export interface StreamPair extends PairObs { durS?: number }

export async function loadPairs(base: string, cand: string): Promise<StreamPair[]> {
  const pairs = getPairsFromData(base, cand);
  const durations = pairDurations(pairs, base, cand);
  return pairs.map((p, i) => ({ ...p, durS: durations[i] }));
}
