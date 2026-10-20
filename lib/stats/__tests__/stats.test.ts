import { describe, expect, it } from "vitest";
import golden from "../../../data/golden.json";
import { DEFAULT_GATE } from "../../contract";
import { getPairsFromData, pairDurations, sessions } from "../../data";
import { bradleyTerry } from "../bradleyTerry";
import { bettingCs } from "../cs";
import { decide, runGate } from "../decide";
import { simulatePeeking } from "../peeking";
import { savings } from "../savings";
import { siteHeterogeneity } from "../sites";
import { testSlices } from "../slices";
import { wilson } from "../wilson";

const G = golden as Record<string, { n: number; mean: number; decision: string; at: number; cs_at_decision: number[]; cs_final: number[]; cs_at_10: number[]; cs_at_50: number[] }>;
const cases: [string, string][] = [
  ["pi0_droid", "pi0_fast_droid"],
  ["paligemma_fast_droid", "paligemma_binning_droid"],
  ["pi0_fast_droid", "paligemma_fast_specialist_droid"],
];

describe("wilson", () => {
  it("matches golden wilson(7,10)", () => {
    const [lo, hi] = wilson(7, 10);
    expect(lo).toBeCloseTo(0.397, 3);
    expect(hi).toBeCloseTo(0.892, 3);
  });
});

describe("betting CS + gate on golden rollouts", () => {
  for (const [base, cand] of cases) {
    const g = G[`${base}->${cand}`];
    it(`${base} -> ${cand}: ${g.decision} at ${g.at}`, () => {
      const pairs = getPairsFromData(base, cand);
      expect(pairs.length).toBe(g.n);
      const mean = pairs.reduce((s, p) => s + p.d, 0) / pairs.length;
      expect(mean).toBeCloseTo(g.mean, 4);
      const cs = bettingCs(pairs.map(p => p.d));
      expect([cs[9].lcb, cs[9].ucb]).toEqual(g.cs_at_10);
      expect([cs[49].lcb, cs[49].ucb]).toEqual(g.cs_at_50);
      expect([cs.at(-1)!.lcb, cs.at(-1)!.ucb]).toEqual(g.cs_final);
      const { decision, decidedAt } = runGate(pairs.map(p => p.d), DEFAULT_GATE);
      expect(decision.verdict).toBe(g.decision);
      expect(decidedAt).toBe(g.at);
      expect([decision.lcb, decision.ucb]).toEqual(g.cs_at_decision);
      expect(decision.reason).toContain(`n=${g.at}`);
    });
  }

  it("golden headline numbers", () => {
    const promote = runGate(getPairsFromData("pi0_droid", "pi0_fast_droid").map(p => p.d), DEFAULT_GATE).decision;
    expect(promote).toMatchObject({ verdict: "PROMOTE", n: 136, lcb: 0.006, ucb: 0.25 });
    const rollback = runGate(getPairsFromData("paligemma_fast_droid", "paligemma_binning_droid").map(p => p.d), DEFAULT_GATE).decision;
    expect(rollback).toMatchObject({ verdict: "ROLLBACK", n: 55, lcb: -0.628, ucb: -0.028 });
    const hold = runGate(getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid").map(p => p.d), DEFAULT_GATE).decision;
    expect(hold).toMatchObject({ verdict: "HOLD", n: 691, lcb: -0.072, ucb: 0.01 });
  });

  it("decide rules", () => {
    const cfg = DEFAULT_GATE;
    expect(decide({ n: 5, mean: 0, lcb: -0.5, ucb: -0.03 }, cfg)).toBe("ROLLBACK");
    expect(decide({ n: 5, mean: 0, lcb: 0.001, ucb: 0.3 }, cfg)).toBe("PROMOTE");
    expect(decide({ n: 5, mean: 0, lcb: -0.01, ucb: 0.3 }, { ...cfg, mode: "noninferiority" })).toBe("PROMOTE");
    expect(decide({ n: 5, mean: 0, lcb: -0.3, ucb: 0.3 }, cfg)).toBe("CONTINUE");
    expect(decide({ n: 5, mean: 0, lcb: -0.3, ucb: 0.3 }, cfg, true)).toBe("HOLD");
    expect(decide({ n: 2000, mean: 0, lcb: -0.3, ucb: 0.3 }, cfg)).toBe("HOLD");
  });
});

describe("testSlices on specialist rollout", () => {
  const pairs = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid");
  const split = Math.floor(pairs.length / 2);
  const proposals = [
    { name: "deformable", pattern: "fold|towel|cloth|napkin|shirt|rag|fabric", rationale: "fixture" },
    { name: "drawer", pattern: "drawer|open|close", rationale: "fixture" },
    { name: "cup_mug", pattern: "cup|mug|bowl", rationale: "fixture" },
    { name: "bad", pattern: "([unclosed", rationale: "fixture" },
  ];
  const results = testSlices(pairs, proposals, split);
  const by = (n: string) => results.find(r => r.name === n)!;

  it("uses split 345", () => expect(split).toBe(345));
  it("confirms deformable on held-out half", () => {
    const r = by("deformable");
    expect(r.nDisc).toBe(34);
    expect(r.meanDisc).toBeCloseTo(-0.188, 3);
    expect(r.nConf).toBe(32);
    expect(r.meanConf).toBeCloseTo(-0.170, 3);
    expect(r.z).toBeCloseTo(-2.55, 2);
    expect(r.pOneSided).toBeCloseTo(0.0054, 4);
    expect(r.confirmed).toBe(true);
    expect(r.permutationPValue).toBeGreaterThan(0);
    expect(r.permutationPValue).toBeLessThan(0.05);
  });
  it("rejects drawer", () => {
    const r = by("drawer");
    expect(r.nConf).toBe(42);
    expect(r.meanConf).toBeCloseTo(-0.064, 3);
    expect(r.pOneSided).toBeCloseTo(0.13, 2);
    expect(r.confirmed).toBe(false);
  });
  it("rejects invalid regex", () => {
    const r = by("bad");
    expect(r.confirmed).toBe(false);
    expect(r.rejectReason).toBe("invalid pattern");
  });
  it("survives Holm with 8 proposals (threshold 0.05/8)", () => {
    const eight = [...proposals.slice(0, 3), ...["pour", "stack|on top", "marker|pen", "wipe|clean", "zzzz_none"].map(p => ({ name: p, pattern: p, rationale: "x" }))];
    const r = testSlices(pairs, eight, split).find(x => x.name === "deformable")!;
    expect(r.holmThreshold).toBeCloseTo(0.05 / 8, 6);
    expect(r.confirmed).toBe(true);
  });
  it("rejects slices with too few confirmation pairs", () => {
    const r = testSlices(pairs, [{ name: "none", pattern: "zzzz_none", rationale: "x" }], split)[0];
    expect(r.confirmed).toBe(false);
    expect(r.rejectReason).toMatch(/too few/);
  });
});

describe("gold features", () => {
  it("G1 peeking simulator: naive >> 5%, CS <= 5%, under 2s, deterministic", () => {
    const ds = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid").map(p => p.d);
    const t0 = Date.now();
    const a = simulatePeeking(ds);
    const elapsed = Date.now() - t0;
    expect(a.replications).toBe(400);
    expect(a.gridPoints).toBe(199);
    expect(a.naiveFalseRate).toBeGreaterThan(0.1);
    expect(a.csFalseRate).toBeLessThanOrEqual(0.05);
    expect(elapsed).toBeLessThan(2000);
    const b = simulatePeeking(ds);
    expect(b.naiveFalseDecisions).toBe(a.naiveFalseDecisions);
    expect(b.csFalseDecisions).toBe(a.csFalseDecisions);
  });

  it("G2 savings: rollback saves robot time", () => {
    const pairs = getPairsFromData("paligemma_fast_droid", "paligemma_binning_droid");
    const s = savings(pairs.map(p => p.d), pairDurations(pairs, "paligemma_fast_droid", "paligemma_binning_droid"), DEFAULT_GATE);
    expect(s.verdict).toBe("ROLLBACK");
    expect(s.decidedAt).toBe(55);
    expect(s.robotHoursUsed).toBeGreaterThan(0);
    expect(s.fixedHorizonPairs).toBeGreaterThan(0);
    const hold = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid");
    const h = savings(hold.map(p => p.d), pairDurations(hold, "pi0_fast_droid", "paligemma_fast_specialist_droid"), DEFAULT_GATE);
    expect(h.fixedHorizonCapped).toBe(true);
  });

  it("G3 Bradley-Terry leaderboard", () => {
    const btSessions = sessions().slice(0, 1500).map(s => ({ arms: Object.values(s.policies).map(a => ({ name: a.name, progress: a.progress })) }));
    const r = bradleyTerry(btSessions, { resamples: 20 });
    expect(r.entries.length).toBeGreaterThan(5);
    for (const e of r.entries) {
      expect(Number.isFinite(e.logStrength)).toBe(true);
      expect(e.ci[0]).toBeLessThanOrEqual(e.ci[1] + 1e-9);
    }
    expect(r.entries[0].rank).toBe(1);
    expect(bradleyTerry(btSessions, { resamples: 20 })).toEqual(r);
  });

  it("G4 site heterogeneity", () => {
    const pairs = getPairsFromData("paligemma_fast_droid", "paligemma_binning_droid");
    const h = siteHeterogeneity(pairs);
    expect(h.sites.length).toBeGreaterThan(1);
    expect(h.sites.every(s => s.n >= 10)).toBe(true);
    expect(h.df).toBe(h.sites.length - 1);
    expect(h.i2).toBeGreaterThanOrEqual(0);
    expect(h.i2).toBeLessThanOrEqual(1);
    expect(h.pValue).toBeGreaterThanOrEqual(0);
    expect(h.pValue).toBeLessThanOrEqual(1);
  });
});
