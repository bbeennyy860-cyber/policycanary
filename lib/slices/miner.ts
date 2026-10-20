import type { PairObs, SliceProposal } from "../contract";

export async function mineSlices(
  discoveryPairs: PairObs[],
  ctx: { base: string; cand: string },
): Promise<{ source: "llm" | "fallback"; model?: string; proposals: SliceProposal[] }> {
  void [discoveryPairs, ctx];
  throw new Error("not implemented");
}
