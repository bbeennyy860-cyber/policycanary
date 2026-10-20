import { afterEach, describe, expect, it, vi } from "vitest";

const captured: string[] = [];
vi.mock("ai", () => ({
  generateObject: vi.fn(async (args: { prompt: string; system: string }) => {
    captured.push(args.system + "\n" + args.prompt);
    return { object: { proposals: [
      { name: "Deformable", pattern: "fold|towel|cloth", rationale: "notes mention cloth" },
      { name: "Drawer", pattern: "drawer|open|close", rationale: "notes mention drawers" },
      { name: "Cups", pattern: "cup|mug|bowl", rationale: "notes mention cups" },
      { name: "Broken", pattern: "([bad", rationale: "invalid regex is dropped" },
    ] } };
  }),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: (model: string) => ({ model }) }));

import { getPairsFromData } from "../../data";
import { mineSlices } from "../miner";

afterEach(() => { delete process.env.OPENAI_API_KEY; captured.length = 0; });

describe("slice miner", () => {
  it("never sends confirmation-half rows to the LLM prompt", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-real";
    const pairs = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid").map(p => ({ ...p }));
    const split = Math.floor(pairs.length / 2);
    pairs.forEach((p, i) => {
      if (i >= split) { p.notes = `CONFMARKER_NOTE_${i} ${p.notes}`; p.instr = `CONFMARKER_INSTR_${i} ${p.instr}`; }
    });
    const result = await mineSlices(pairs.slice(0, split), { base: "pi0_fast_droid", cand: "paligemma_fast_specialist_droid" });
    expect(result.source).toBe("llm");
    expect(captured.length).toBe(1);
    expect(captured[0]).not.toContain("CONFMARKER");
    expect(captured[0]).not.toContain("test-key-not-real");
    expect(captured[0]).toContain(`"discoveryCount":${split}`);
    expect(result.proposals.map(p => p.name)).toEqual(["Deformable", "Drawer", "Cups"]);
  });

  it("serves cached proposals without calling the model when the LLM budget is spent", async () => {
    process.env.OPENAI_API_KEY = "test-key-not-real";
    const pairs = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid");
    const result = await mineSlices(pairs.slice(0, 10), { base: "a", cand: "b" }, { allowLlm: false });
    expect(result.source).toBe("fallback");
    expect(captured.length).toBe(0);
  });

  it("falls back to cached proposals without an API key", async () => {
    const pairs = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid");
    const result = await mineSlices(pairs.slice(0, 10), { base: "a", cand: "b" });
    expect(result.source).toBe("fallback");
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(captured.length).toBe(0);
  });
});
