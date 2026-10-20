import { describe, expect, it } from "vitest";
import { DEFAULT_GATE } from "../../contract";
import { getPairsFromData } from "../../data";
import { auditHash, verifyAudit, type AuditRow } from "../audit";
import { errorResponse, HttpError } from "../http";
import { DatabaseUnavailable } from "../db";
import { IllegalTransition, transition } from "../machine";
import { evaluateBatch } from "../replay";
import { overrideSchema, trialSchema } from "../validation";

describe("state machine", () => {
  it("legal transitions", () => {
    expect(transition("DRAFT", "START")).toBe("EVALUATING");
    expect(transition("EVALUATING", "PROMOTE")).toBe("CANARY");
    expect(transition("CANARY", "PROMOTE")).toBe("EXPANDING");
    expect(transition("EXPANDING", "PROMOTE")).toBe("PROMOTED");
    expect(transition("EVALUATING", "ROLLBACK")).toBe("ROLLED_BACK");
    expect(transition("EVALUATING", "HOLD")).toBe("HOLD");
    expect(transition("HOLD", "RESUME")).toBe("EVALUATING");
    expect(transition("HOLD", "ABANDON")).toBe("ABANDONED");
    expect(transition("CANARY", "GUARDRAIL")).toBe("ROLLED_BACK");
  });
  it("illegal transitions throw (-> 409)", () => {
    expect(() => transition("PROMOTED", "START")).toThrow(IllegalTransition);
    expect(() => transition("DRAFT", "ABANDON")).toThrow(IllegalTransition);
    expect(() => transition("ROLLED_BACK", { type: "OVERRIDE", toState: "EVALUATING", actor: "ben", reason: "long enough reason" })).toThrow(IllegalTransition);
    expect(errorResponse(new IllegalTransition("x")).status).toBe(409);
  });
  it("override requires reason >= 10 chars (-> 400)", () => {
    expect(overrideSchema.safeParse({ toState: "HOLD", actor: "ben", reason: "short" }).success).toBe(false);
    expect(overrideSchema.safeParse({ toState: "HOLD", actor: "ben", reason: "operator judgement call" }).success).toBe(true);
    const parsed = overrideSchema.safeParse({ toState: "HOLD", actor: "ben", reason: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(errorResponse(parsed.error).status).toBe(400);
  });
  it("progress outside [0,1] rejected (-> 400)", () => {
    const base = { sessionId: "6f1b0a52-0d7e-4c1e-9d38-1f2a3b4c5d6e", occurredAt: "2026-10-20T10:00:00Z", site: "lab", instruction: "fold the towel" };
    expect(trialSchema.safeParse({ ...base, results: [{ policy: "a", success: 1, progress: 1.2, durationS: 10 }] }).success).toBe(false);
    expect(trialSchema.safeParse({ ...base, results: [{ policy: "a", success: 1, progress: 0.7, durationS: 10 }] }).success).toBe(true);
  });
  it("DB unavailable -> 503 JSON", async () => {
    const res = errorResponse(new DatabaseUnavailable());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Database unavailable" });
    expect(errorResponse(Object.assign(new Error("connect"), { code: "ECONNREFUSED" })).status).toBe(503);
    expect(errorResponse(new HttpError(404, "Rollout not found")).status).toBe(404);
  });
});

describe("replay", () => {
  const pairs = getPairsFromData("pi0_droid", "pi0_fast_droid");
  it("PROMOTE at pair 136 moves EVALUATING -> CANARY and resets the stage", () => {
    let snap = { state: "DRAFT" as const, stage: "EVAL" as const, stageStart: 0, cursor: 0, pairs, config: DEFAULT_GATE };
    let state: string = snap.state, cursor = 0, stage: string = "EVAL", stageStart = 0;
    const all = [];
    for (let i = 0; i < 20 && state !== "CANARY"; i++) {
      const r = evaluateBatch({ ...snap, state: state as never, cursor, stage: stage as never, stageStart }, 25);
      all.push(...r.decisions);
      ({ state, cursor, stage, stageStart } = r);
    }
    expect(state).toBe("CANARY");
    expect(cursor).toBe(136);
    expect(stage).toBe("CANARY_10");
    expect(stageStart).toBe(136);
    const promote = all.find(d => d.verdict === "PROMOTE")!;
    expect([promote.n, promote.lcb, promote.ucb]).toEqual([136, 0.006, 0.25]);
    void snap;
  });
  it("ROLLBACK at pair 55", () => {
    const rb = getPairsFromData("paligemma_fast_droid", "paligemma_binning_droid");
    const r = evaluateBatch({ state: "EVALUATING", stage: "EVAL", stageStart: 0, cursor: 0, pairs: rb, config: DEFAULT_GATE }, 2000);
    expect(r.state).toBe("ROLLED_BACK");
    expect(r.cursor).toBe(55);
    expect(r.decisions.at(-1)).toMatchObject({ verdict: "ROLLBACK", lcb: -0.628, ucb: -0.028 });
  });
  it("replaying a terminal rollout is illegal", () => {
    expect(() => evaluateBatch({ state: "PROMOTED", stage: "FULL", stageStart: 0, cursor: 0, pairs, config: DEFAULT_GATE }, 25)).toThrow(IllegalTransition);
  });
});

describe("audit hash chain", () => {
  const mk = (rows: { action: string; payload: Record<string, string | number> }[]): AuditRow[] => {
    let prev = "";
    return rows.map((r, i) => {
      const payload = { ...r.payload, entity: "rollout", entityId: 1, action: r.action };
      const hash = auditHash(prev, payload);
      const row: AuditRow = { id: i + 1, entity: "rollout", entity_id: 1, action: r.action, payload: { payload, prevHash: prev, hash } };
      prev = hash;
      return row;
    });
  };
  it("verifies an intact chain and detects tampering", () => {
    const rows = mk([{ action: "CREATE", payload: { a: 1 } }, { action: "REPLAY", payload: { cursor: 25 } }, { action: "TRANSITION", payload: { to: "CANARY" } }]);
    expect(verifyAudit(rows)).toEqual({ valid: true, length: 3, firstBrokenId: null });
    (rows[1].payload.payload as Record<string, unknown>).cursor = 999;
    expect(verifyAudit(rows)).toEqual({ valid: false, length: 3, firstBrokenId: 2 });
  });
});
