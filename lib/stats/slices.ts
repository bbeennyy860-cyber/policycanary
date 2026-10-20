import type { PairObs, SliceProposal, SliceResult } from "../contract";
import { holm } from "./holm";
import { moments, normalCdf, validateDiffs } from "./math";
import { permutationPValue } from "./permutation";

export interface TestedSliceResult extends SliceResult { permutationPValue: number }

export function testSlices(
  pairs: PairObs[],
  proposals: SliceProposal[],
  splitIndex = Math.floor(pairs.length / 2),
  margin = 0.02,
): TestedSliceResult[] {
  if (!Number.isInteger(splitIndex) || splitIndex < 0 || splitIndex > pairs.length) throw new RangeError("invalid split index");
  if (!Number.isFinite(margin) || margin < 0 || margin > 1) throw new RangeError("invalid margin");
  validateDiffs(pairs.map(pair => pair.d));
  const results = proposals.map((proposal): TestedSliceResult => {
    const result: TestedSliceResult = { ...proposal, nDisc: 0, meanDisc: 0, nConf: 0, meanConf: 0,
      z: 0, pOneSided: 1, permutationPValue: 1, holmThreshold: 0, confirmed: false };
    let pattern: RegExp;
    try { pattern = new RegExp(proposal.pattern, "i"); }
    catch { return { ...result, rejectReason: "invalid pattern" }; }
    const discovery: number[] = [], confirmation: number[] = [];
    pairs.forEach((pair, index) => {
      if (pattern.test(pair.instr)) (index < splitIndex ? discovery : confirmation).push(pair.d);
    });
    const disc = moments(discovery), conf = moments(confirmation);
    result.nDisc = disc.n; result.meanDisc = disc.mean;
    result.nConf = conf.n; result.meanConf = conf.mean;
    result.permutationPValue = permutationPValue(confirmation);
    if (conf.n < 15) return { ...result, rejectReason: "too few confirmation pairs (requires 15)" };
    // A degenerate sample has no estimable z statistic. Keep it conservative
    // and JSON-safe; the permutation cross-check remains available.
    if (conf.variance === 0) return { ...result, rejectReason: "zero confirmation variance" };
    result.z = conf.mean / Math.sqrt(conf.variance / conf.n);
    result.pOneSided = normalCdf(result.z);
    return result;
  });
  const corrected = holm(results.map(r => r.pOneSided));
  return results.map((result, i) => {
    const test = corrected[i];
    result.holmThreshold = test.threshold;
    if (result.rejectReason) return result;
    result.confirmed = test.rejected && result.meanConf < -margin;
    if (!test.rejected) result.rejectReason = "did not pass Holm correction";
    else if (!result.confirmed) result.rejectReason = "regression does not exceed margin";
    return result;
  });
}
