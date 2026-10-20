import type { PairObs, SliceProposal, SliceResult } from "../contract";

export function testSlices(
  pairs: PairObs[],
  proposals: SliceProposal[],
  splitIndex: number,
  margin = 0.02,
): SliceResult[] {
  void [pairs, proposals, splitIndex, margin];
  throw new Error("not implemented");
}
