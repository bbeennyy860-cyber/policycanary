import type { Decision, GateConfig, PairObs, RolloutState, Stage, Verdict } from "../contract";
import { bettingCs } from "../stats/cs";
import { decide } from "../stats/decide";
import { IllegalTransition, stageForState, transition } from "./machine";

export interface ReplaySnapshot {
  state: RolloutState;
  stage: Stage;
  stageStart: number;
  cursor: number;
  pairs: PairObs[];
  config: GateConfig;
}
export interface StateChange { fromState: RolloutState; toState: RolloutState; reason: string }
export interface ReplayDecision extends Decision { stage: Stage; cursor: number }
export interface ReplayResult {
  state: RolloutState;
  stage: Stage;
  stageStart: number;
  cursor: number;
  decisions: ReplayDecision[];
  transitions: StateChange[];
}

/**
 * Pure replay: inspect every prefix, persist batch ends, stop at the first crossing.
 * exhaustOnEnd: reaching the end of the stream means HOLD. True for the fixed historical replay;
 * live ingest passes false, because there the end of the stream only means "no more trials yet".
 */
export function evaluateBatch(snapshot: ReplaySnapshot, batch: number, previousVerdict?: Verdict, exhaustOnEnd = true): ReplayResult {
  if (!["DRAFT", "EVALUATING", "CANARY", "EXPANDING"].includes(snapshot.state)) {
    throw new IllegalTransition(`Cannot replay ${snapshot.state}`);
  }
  const result: ReplayResult = {
    state: snapshot.state, stage: snapshot.stage, stageStart: snapshot.stageStart, cursor: snapshot.cursor,
    decisions: [], transitions: [],
  };
  if (result.state === "DRAFT") {
    result.state = transition(result.state, "START");
    result.transitions.push({ fromState: "DRAFT", toState: result.state, reason: "Replay started" });
  }
  const end = Math.min(snapshot.cursor + batch, snapshot.pairs.length, snapshot.stageStart + snapshot.config.maxTrials);
  const ds = snapshot.pairs.slice(snapshot.stageStart, Math.max(end, snapshot.cursor)).map(pair => pair.d);
  const series = bettingCs(ds, snapshot.config.alpha);
  const consume = (point: { n: number; mean: number; lcb: number; ucb: number }, cursor: number, exhausted: boolean) => {
    const verdict = decide(point, snapshot.config, exhausted);
    const reason = `n=${point.n}, L=${point.lcb.toFixed(3)}, U=${point.ucb.toFixed(3)}: ${verdict}${exhausted ? " (stream exhausted)" : ""}`;
    result.cursor = cursor;
    if (verdict !== "CONTINUE" || cursor === end || verdict !== previousVerdict) {
      result.decisions.push({ ...point, stage: snapshot.stage, cursor, verdict, reason });
    }
    previousVerdict = verdict;
    if (verdict !== "CONTINUE") {
      const fromState = result.state;
      result.state = transition(fromState, verdict);
      result.transitions.push({ fromState, toState: result.state, reason });
      if (verdict === "PROMOTE") {
        result.stage = stageForState(result.state)!;
        result.stageStart = cursor;
      }
      return true;
    }
    return false;
  };
  if (end <= snapshot.cursor) return result; // caught up: nothing new to read, so no new decision
  for (let cursor = snapshot.cursor + 1; cursor <= end; cursor++) {
    const point = series[cursor - snapshot.stageStart - 1];
    if (consume(point, cursor, exhaustOnEnd && cursor === snapshot.pairs.length)) break;
  }
  return result;
}
