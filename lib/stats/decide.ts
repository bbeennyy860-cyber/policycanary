import type { CsPoint, Decision, GateConfig, Verdict } from "../contract";
import { bettingCs } from "./cs";
import { validateAlpha } from "./math";

function validateConfig(cfg: GateConfig): void {
  validateAlpha(cfg.alpha);
  if (!Number.isFinite(cfg.margin) || cfg.margin < 0 || cfg.margin > 1
    || !Number.isInteger(cfg.maxTrials) || cfg.maxTrials < 1
    || (cfg.mode !== "superiority" && cfg.mode !== "noninferiority")) {
    throw new RangeError("invalid gate configuration");
  }
}

export function decide(cs: CsPoint, cfg: GateConfig, exhausted = false): Verdict {
  validateConfig(cfg);
  if (cs.ucb < -cfg.margin) return "ROLLBACK";
  if (cs.lcb > (cfg.mode === "superiority" ? 0 : -cfg.margin)) return "PROMOTE";
  if (cs.n >= cfg.maxTrials || exhausted) return "HOLD";
  return "CONTINUE";
}

export function runGate(ds: number[], cfg: GateConfig): {
  series: CsPoint[];
  decision: Decision;
  decidedAt: number;
} {
  validateConfig(cfg);
  // Return the full chart series, but preserve the first terminal decision.
  const series = bettingCs(ds, cfg.alpha);
  let point: CsPoint = { n: 0, mean: 0, lcb: -1, ucb: 1 };
  let verdict: Verdict = "HOLD";
  for (const cs of series) {
    point = cs;
    verdict = decide(cs, cfg, cs.n === ds.length);
    if (verdict !== "CONTINUE") break;
  }
  const explanation = verdict === "ROLLBACK" ? `U < -margin (${-cfg.margin})`
    : verdict === "PROMOTE" ? `L > ${cfg.mode === "superiority" ? 0 : -cfg.margin} (${cfg.mode})`
    : point.n >= cfg.maxTrials ? "maximum trials reached" : "data exhausted";
  const decision: Decision = { ...point, verdict,
    reason: `${verdict}: n=${point.n}, L=${point.lcb.toFixed(3)}, U=${point.ucb.toFixed(3)}; ${explanation}` };
  return { series, decision, decidedAt: point.n };
}
