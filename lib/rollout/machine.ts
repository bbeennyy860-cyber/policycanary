import type { RolloutState, Verdict } from "../contract";

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
  void [state, event];
  throw new Error("not implemented");
}
