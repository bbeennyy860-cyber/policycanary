"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty } from "./ui";

export interface BandPoint { n: number; mean: number; lcb: number; ucb: number }

export function BandChart({ points, margin, level, decisionN, verdict }: { points: BandPoint[]; margin: number; level: number; decisionN?: number | null; verdict?: string | null }) {
  if (!points.length) return <Empty>Press Replay to stream paired sessions. The band tightens as evidence accumulates.</Empty>;
  const data = points.map(p => ({ n: p.n, mean: p.mean, lcb: p.lcb, ucb: p.ucb, band: [p.lcb, p.ucb] as [number, number] }));
  const lo = Math.min(...points.map(p => p.lcb), -margin);
  const hi = Math.max(...points.map(p => p.ucb), margin);
  const pad = Math.max((hi - lo) * 0.08, 0.02);
  const domain: [number, number] = [Math.max(-1, Math.floor((lo - pad) * 20) / 20), Math.min(1, Math.ceil((hi + pad) * 20) / 20)];
  const span = domain[1] - domain[0];
  const step = span > 1.2 ? 0.5 : span > 0.6 ? 0.25 : span > 0.3 ? 0.1 : 0.05;
  const ticks: number[] = [];
  for (let t = Math.ceil(domain[0] / step) * step; t <= domain[1] + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  const markerColor = verdict === "ROLLBACK" ? "#f87171" : verdict === "HOLD" ? "#fbbf24" : "#34d399";
  return (
    <div role="img" aria-label="Anytime-valid confidence sequence for mean candidate minus baseline progress, against number of pairs.">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 18 }}>
          <CartesianGrid stroke="#22314a" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="n" type="number" domain={[1, "dataMax"]} stroke="#8a9bb4" tickLine={false} axisLine={{ stroke: "#22314a" }} fontSize={11}
            label={{ value: "Pairs n (current stage)", position: "insideBottom", offset: -10, fill: "#8a9bb4", fontSize: 11 }} />
          <YAxis domain={domain} ticks={ticks} interval={0} stroke="#8a9bb4" tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: "#111a2b", border: "1px solid #2f4262", borderRadius: 8, fontSize: 12, color: "#e6edf6" }}
            labelStyle={{ color: "#8a9bb4" }}
            labelFormatter={v => `n = ${v}`}
            formatter={(value, name) => [Array.isArray(value) ? `[${Number(value[0]).toFixed(3)}, ${Number(value[1]).toFixed(3)}]` : Number(value).toFixed(3), name]}
          />
          <Area dataKey="band" name="CS [L, U]" type="linear" stroke="none" fill="#2dd4bf" fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="lcb" name="Lower L" stroke="#2dd4bf" strokeOpacity={0.55} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Line dataKey="ucb" name="Upper U" stroke="#2dd4bf" strokeOpacity={0.55} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Line dataKey="mean" name="Mean Δ" stroke="#e6edf6" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          <ReferenceLine y={0} stroke="#8a9bb4" strokeWidth={1} />
          <ReferenceLine y={margin} stroke="#7487a3" strokeDasharray="5 4" />
          <ReferenceLine y={-margin} stroke="#7487a3" strokeDasharray="5 4" />
          {decisionN ? <ReferenceLine x={decisionN} stroke={markerColor} strokeWidth={1.5} label={{ value: `${verdict ?? "decision"} @ ${decisionN}`, position: "insideTopRight", fill: markerColor, fontSize: 11 }} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink" />Mean Δ</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-accent/25 ring-1 ring-accent/50" />{level}% confidence sequence [L, U]</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-dim" />±{margin} margin</span>
        {decisionN ? <span className="flex items-center gap-1.5"><span className="h-3 w-0.5" style={{ background: markerColor }} />Decision at n = {decisionN}</span> : null}
      </div>
    </div>
  );
}
