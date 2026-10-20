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
const providers: { apiKey: string; baseURL: string }[] = [];
vi.mock("@ai-sdk/openai", () => ({
  openai: (model: string) => ({ model }),
  createOpenAI: (settings: { apiKey: string; baseURL: string }) => {
    providers.push(settings);
    return (model: string) => ({ model, baseURL: settings.baseURL });
  },
}));

import { getPairsFromData } from "../../data";
import { mineSlices } from "../miner";

afterEach(() => {
  delete process.env.OPENAI_API_KEY; delete process.env.NETLIFY_AI_GATEWAY_KEY; delete process.env.NETLIFY_AI_GATEWAY_URL;
  captured.length = 0; providers.length = 0;
});

describe("slice miner", () => {
  it("prefers Netlify AI Gateway credentials over a project OPENAI_API_KEY", async () => {
    process.env.OPENAI_API_KEY = "stale-project-key";
    process.env.NETLIFY_AI_GATEWAY_KEY = "gateway-token-not-real";
    process.env.NETLIFY_AI_GATEWAY_URL = "https://example.netlify.app/.netlify/ai";
    const pairs = getPairsFromData("pi0_fast_droid", "paligemma_fast_specialist_droid");
    const result = await mineSlices(pairs.slice(0, 40), { base: "a", cand: "b" });
    expect(result.source).toBe("llm");
    expect(providers).toEqual([{ apiKey: "gateway-token-not-real", baseURL: "https://example.netlify.app/.netlify/ai" }]);
  });

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
