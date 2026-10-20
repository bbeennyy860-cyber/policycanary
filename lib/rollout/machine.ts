import type { RolloutState, Stage, Verdict } from "../contract";

export type RolloutEvent =
  | "START"
  | "RESUME"
  | "ABANDON"
  | "GUARDRAIL"
  | Verdict
  | { type: "OVERRIDE"; toState: RolloutState; actor: string; reason: string };

export class IllegalTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalTransition";
  }
}

export function transition(state: RolloutState, event: RolloutEvent): RolloutState {
  const type = typeof event === "string" ? event : event.type;
  const fail = (): never => { throw new IllegalTransition(`${state} cannot accept ${type}`); };
  if (isTerminal(state)) return fail();
  if (typeof event !== "string") {
    if (!event.actor.trim() || event.reason.trim().length < 10 || event.toState === state) return fail();
    return event.toState;
  }
  if (event === "GUARDRAIL") return "ROLLED_BACK";
  if (state === "DRAFT" && event === "START") return "EVALUATING";
  if (state === "HOLD") {
    if (event === "RESUME") return "EVALUATING";
    if (event === "ABANDON") return "ABANDONED";
  }
  if (state === "EVALUATING" || state === "CANARY" || state === "EXPANDING") {
    if (event === "CONTINUE") return state;
    if (event === "ROLLBACK") return "ROLLED_BACK";
    if (event === "HOLD") return "HOLD";
    if (event === "PROMOTE") {
      return state === "EVALUATING" ? "CANARY" : state === "CANARY" ? "EXPANDING" : "PROMOTED";
    }
  }
  return fail();
}

export function isTerminal(state: RolloutState): boolean {
  return state === "PROMOTED" || state === "ROLLED_BACK" || state === "ABANDONED";
}

export function stageForState(state: RolloutState): Stage | undefined {
  if (state === "DRAFT" || state === "EVALUATING") return "EVAL";
  if (state === "CANARY") return "CANARY_10";
  if (state === "EXPANDING") return "EXPAND_50";
  if (state === "PROMOTED") return "FULL";
}
