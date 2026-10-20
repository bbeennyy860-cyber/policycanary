import type { CsPoint, Decision, GateConfig, Verdict } from "../contract";

export function decide(cs: CsPoint, cfg: GateConfig, exhausted = false): Verdict {
  void [cs, cfg, exhausted];
  throw new Error("not implemented");
}

export function runGate(ds: number[], cfg: GateConfig): {
  series: CsPoint[];
  decision: Decision;
  decidedAt: number;
} {
  void [ds, cfg];
  throw new Error("not implemented");
}
