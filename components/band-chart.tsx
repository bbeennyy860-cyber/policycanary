"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty } from "./ui";

export interface BandPoint { n: number; mean: number; lcb: number; ucb: number }

export function BandChart({ points, margin, decisionN, verdict }: { points: BandPoint[]; margin: number; decisionN?: number | null; verdict?: string | null }) {
  if (!points.length) return <Empty>Press Replay to stream paired sessions. The band tightens as evidence accumulates.</Empty>;
  const data = points.map(p => ({ n: p.n, mean: p.mean, lcb: p.lcb, ucb: p.ucb, band: [p.lcb, p.ucb] as [number, number] }));
  const lo = Math.min(...points.map(p => p.lcb), -margin);
  const hi = Math.max(...points.map(p => p.ucb), margin);
  const pad = Math.max((hi - lo) * 0.08, 0.02);
  const domain: [number, number] = [Math.max(-1, Math.floor((lo - pad) * 20) / 20), Math.min(1, Math.ceil((hi + pad) * 20) / 20)];
  const markerColor = verdict === "ROLLBACK" ? "#f87171" : verdict === "HOLD" ? "#fbbf24" : "#34d399";
  return (
    <div role="img" aria-label="Anytime-valid confidence sequence for mean candidate minus baseline progress, against number of pairs.">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 18 }}>
          <CartesianGrid stroke="#1e2b40" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="n" type="number" domain={[1, "dataMax"]} stroke="#63748e" tickLine={false} axisLine={{ stroke: "#22314a" }} fontSize={11}
            label={{ value: "Pairs n (current stage)", position: "insideBottom", offset: -10, fill: "#63748e", fontSize: 11 }} />
          <YAxis domain={domain} stroke="#63748e" tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v: number) => v.toFixed(2)} />
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
          <ReferenceLine y={margin} stroke="#63748e" strokeDasharray="5 4" label={{ value: `+${margin}`, position: "right", fill: "#63748e", fontSize: 10 }} />
          <ReferenceLine y={-margin} stroke="#63748e" strokeDasharray="5 4" label={{ value: `−${margin}`, position: "right", fill: "#63748e", fontSize: 10 }} />
          {decisionN ? <ReferenceLine x={decisionN} stroke={markerColor} strokeWidth={1.5} label={{ value: `${verdict ?? "decision"} @ ${decisionN}`, position: "insideTopRight", fill: markerColor, fontSize: 11 }} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
