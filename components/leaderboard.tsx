"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fixed, integer, message, num, pick, record, rows, str, type JsonRecord } from "./api";
import { Card, Empty, ErrorNotice, Skeleton } from "./ui";

interface Entry { rank: number | null; name: string; logStrength: number; lo: number | null; hi: number | null; comparisons: number; insufficient: boolean }

function normalise(r: JsonRecord): Entry {
  const ci = pick(r, "ci", "ci95", "interval");
  const ciArr = Array.isArray(ci) ? ci : null;
  const ciRec = record(ci);
  const comparisons = num(pick(r, "comparisons", "n", "games", "count"));
  const lo = ciArr ? num(ciArr[0]) : pick(r, "lo", "ciLow", "lower", "ciLo") !== undefined ? num(pick(r, "lo", "ciLow", "lower", "ciLo")) : ciRec.lo !== undefined ? num(ciRec.lo) : null;
  const hi = ciArr ? num(ciArr[1]) : pick(r, "hi", "ciHigh", "upper", "ciHi") !== undefined ? num(pick(r, "hi", "ciHigh", "upper", "ciHi")) : ciRec.hi !== undefined ? num(ciRec.hi) : null;
  const flag = pick(r, "insufficient", "insufficientData", "lowData");
  return {
    rank: typeof r.rank === "number" ? r.rank : null,
    name: str(pick(r, "name", "policy")),
    logStrength: num(pick(r, "logStrength", "log_strength", "theta", "strength")),
    lo, hi, comparisons,
    insufficient: typeof flag === "boolean" ? flag : comparisons < 30,
  };
}

export function Leaderboard() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await api("/api/leaderboard");
      const list = rows(Array.isArray(payload) ? payload : pick(record(payload), "policies", "leaderboard", "rows", "entries"));
      setEntries(list.map(normalise)); // server order: ranked policies first, insufficient-data ones after
    } catch (e) { setError(message(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [min, max] = useMemo(() => {
    const vals = entries.flatMap(e => [e.lo ?? e.logStrength, e.hi ?? e.logStrength]);
    if (!vals.length) return [-1, 1];
    const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
    const pad = (hi - lo) * 0.05 || 0.5;
    return [lo - pad, hi + pad];
  }, [entries]);
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  function toggle(name: string) {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev.slice(-1), name]);
  }
  const [a, b] = selected;
  const rank = (n: string) => entries.findIndex(e => e.name === n);
  // Baseline = the stronger-ranked of the two (the incumbent); candidate = the other.
  const base = a && b ? (rank(a) <= rank(b) ? a : b) : null;
  const cand = a && b ? (base === a ? b : a) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label text-accent">Fleet leaderboard</div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Bradley–Terry policy strengths</h1>
          <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-muted">
            Fitted from every RoboArena session with two or more policies, using pairwise wins on partial success (ties count half).
            Intervals are 95% bootstrap CIs over sessions. Select two rows to open a head-to-head rollout.
          </p>
        </div>
        <div className="card flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
          {base && cand ? (
            <>
              <span className="font-mono text-muted">{base} <span className="text-dim">→</span> <span className="text-ink">{cand}</span></span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => router.push(`/?base=${encodeURIComponent(base)}&cand=${encodeURIComponent(cand)}`)}>New rollout</button>
              <button type="button" className="btn btn-sm" onClick={() => setSelected([])}>Clear</button>
            </>
          ) : <span className="text-muted">{selected.length === 1 ? `${selected[0]} selected; pick one more` : "Select two policies to compare"}</span>}
        </div>
      </div>

      <Card bodyClass="">
        {error ? <div className="p-5"><ErrorNotice onRetry={() => void load()}>{error}</ErrorNotice></div>
          : loading ? <Skeleton rows={8} />
          : !entries.length ? <Empty>No leaderboard data yet.</Empty>
          : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th className="w-12">Rank</th><th>Policy</th><th className="r">Log-strength</th><th className="w-[38%]">95% CI</th><th className="r">Comparisons</th><th>Data</th></tr></thead>
                <tbody>
                  {entries.map(e => {
                    const on = selected.includes(e.name);
                    return (
                      <tr key={e.name} onClick={() => toggle(e.name)} aria-selected={on}
                        className={`cursor-pointer ${on ? "[&>td]:bg-accent/10" : ""} ${e.insufficient ? "opacity-60" : ""}`}>
                        <td className="text-muted">{e.rank ?? "—"}</td>
                        <td className="font-mono text-[12.5px]">
                          <span className={`mr-2 inline-block h-3 w-3 rounded-[3px] border align-[-1px] ${on ? "border-accent bg-accent" : "border-line-strong"}`} />
                          {e.name}
                        </td>
                        <td className="r">{fixed(e.logStrength, 3)}</td>
                        <td>
                          <div className="relative h-5" title={e.lo !== null && e.hi !== null ? `[${fixed(e.lo)}, ${fixed(e.hi)}]` : "No interval"}>
                            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: x(0) }} />
                            {e.lo !== null && e.hi !== null && (
                              <div className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${e.insufficient ? "bg-dim/50" : "bg-accent/35"}`} style={{ left: x(e.lo), width: `calc(${x(e.hi)} - ${x(e.lo)})` }} />
                            )}
                            <div className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${e.insufficient ? "bg-dim" : "bg-accent"}`} style={{ left: x(e.logStrength) }} />
                          </div>
                        </td>
                        <td className="r">{integer(e.comparisons)}</td>
                        <td>{e.insufficient ? <span className="pill border-warn/30 bg-warn/10 text-warn">Insufficient data</span> : <span className="text-[12px] text-dim">n ≥ 30</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
      <p className="text-[12px] text-dim">Policies with fewer than 30 comparisons are listed unranked below the rest; their strengths should not drive release decisions.</p>
    </div>
  );
}
