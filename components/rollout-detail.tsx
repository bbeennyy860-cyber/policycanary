"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RolloutDetail as RolloutDetailData } from "@/lib/api-types";
import { api, ApiError, fixed, integer, message, num, pick, record, rows, signed, str, time, type JsonRecord } from "./api";
import { BandChart, type BandPoint } from "./band-chart";
import { Badge, Card, Empty, ErrorNotice, Skeleton } from "./ui";
import { AuditPanel, OverridePanel, PeekingPanel, SavingsCard, SitesPanel, SliceMinerPanel } from "./rollout-panels";

const STAGES = ["EVAL", "CANARY_10", "EXPAND_50", "FULL"] as const;
const STAGE_LABEL: Record<string, string> = { EVAL: "Eval", CANARY_10: "Canary 10%", EXPAND_50: "Expand 50%", FULL: "Full" };
export const TERMINAL = new Set(["PROMOTED", "ROLLED_BACK", "ABANDONED"]);

type Detail = Partial<RolloutDetailData> & JsonRecord;

function StageTimeline({ stage, state }: { stage: string; state: string }) {
  const idx = Math.max(0, STAGES.indexOf(stage as (typeof STAGES)[number]));
  const done = state === "PROMOTED";
  const failed = state === "ROLLED_BACK" || state === "ABANDONED";
  return (
    <ol className="flex items-center gap-0" aria-label="Rollout stages">
      {STAGES.map((s, i) => {
        const complete = done ? true : i < idx;
        const current = !done && i === idx;
        const tone = current && failed ? "border-bad text-bad bg-bad/10" : current && state === "HOLD" ? "border-warn text-warn bg-warn/10"
          : current ? "border-accent text-accent bg-accent/10" : complete ? "border-accent/50 text-ink bg-surface-2" : "border-line text-dim";
        return (
          <li key={s} className="flex items-center">
            <span className={`flex h-7 items-center gap-2 rounded-md border px-2.5 text-[12px] font-medium ${tone}`}>
              <span className="num text-[10.5px] opacity-70">{i + 1}</span>{STAGE_LABEL[s]}
            </span>
            {i < STAGES.length - 1 && <span className={`mx-1.5 h-px w-6 ${complete ? "bg-accent/50" : "bg-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function RolloutDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState("");
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = record(await api(`/api/rollouts/${encodeURIComponent(id)}`)) as Detail;
      setDetail(d); setError(null);
      return d;
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : 0, text: message(e) });
      return null;
    }
  }, [id]);
  useEffect(() => { void load(); return () => { stopRef.current = true; }; }, [load]);

  const state = str(detail?.state, "DRAFT");
  const cursor = num(detail?.cursor);
  const pairCount = num(pick(detail ?? {}, "pairCount"));
  const exhausted = pairCount > 0 && cursor >= pairCount;
  const canReplay = !TERMINAL.has(state) && state !== "HOLD" && !exhausted;

  async function replay(once = false) {
    setReplayError(""); setReplaying(true); stopRef.current = false;
    try {
      for (let i = 0; i < 400 && !stopRef.current; i++) {
        const res = record(await api(`/api/rollouts/${encodeURIComponent(id)}/replay`, { batch: 25 }));
        const r = Object.keys(record(res.rollout)).length ? record(res.rollout) : res;
        const d = await load();
        const s = str(d?.state ?? r.state, "");
        const c = num(d?.cursor ?? r.cursor), total = num(d?.pairCount ?? r.pairCount);
        if (once || TERMINAL.has(s) || s === "HOLD" || (total > 0 && c >= total)) break;
        await new Promise(resolve => setTimeout(resolve, 220));
      }
    } catch (e) {
      setReplayError(e instanceof ApiError && e.status === 409 ? `${message(e)} Reloaded the latest state.` : message(e));
      await load();
    } finally { setReplaying(false); }
  }

  const points: BandPoint[] = useMemo(() => rows(detail?.cs).map(p => ({ n: num(p.n), mean: num(p.mean), lcb: num(p.lcb), ucb: num(p.ucb) })), [detail?.cs]);
  const decisions = useMemo(() => rows(detail?.decisions), [detail?.decisions]);
  const csStage = str(detail?.csStage, str(detail?.stage, "EVAL"));
  const crossing = useMemo(() => [...decisions].reverse().find(d => str(d.stage) === csStage && str(d.verdict) !== "CONTINUE"), [decisions, csStage]);
  const last = decisions.at(-1);
  const margin = num(detail?.margin, 0.02);

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-[13px] text-muted hover:text-ink">← Overview</Link>
        <Card title={error.status === 404 ? "Rollout not found" : "Could not load rollout"}>
          <ErrorNotice onRetry={error.status === 404 ? undefined : () => void load()}>{error.text}</ErrorNotice>
        </Card>
      </div>
    );
  }
  if (!detail) return <div className="space-y-4"><div className="skeleton h-8 w-72" /><Card><Skeleton rows={8} /></Card></div>;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link href="/" className="text-[13px] text-muted hover:text-ink">← Overview</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[24px] font-semibold tracking-tight">Rollout #{str(detail.id)}</h1>
              <Badge value={state} />
            </div>
            <div className="mt-1.5 font-mono text-[13px] text-muted">
              {str(detail.baseline)} <span className="text-dim">→</span> <span className="text-ink">{str(detail.candidate)}</span>
            </div>
            <div className="num mt-1 text-[12px] text-dim">
              {str(detail.mode)} · α {fixed(detail.alpha, 2)} · margin {fixed(detail.margin, 2)} · max {integer(detail.maxTrials)} pairs · created {time(detail.createdAt)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {replaying
              ? <button type="button" className="btn" onClick={() => { stopRef.current = true; }}>Pause</button>
              : <button type="button" className="btn" disabled={!canReplay} onClick={() => void replay(true)}>Step 25</button>}
            <button type="button" className="btn btn-primary min-w-[120px]" disabled={!canReplay || replaying} onClick={() => void replay(false)}>
              {replaying ? "Replaying…" : cursor > 0 ? "Resume replay" : "Replay"}
            </button>
          </div>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-3">
          <StageTimeline stage={str(detail.stage, "EVAL")} state={state} />
          <div className="flex min-w-[220px] flex-1 items-center gap-3 md:max-w-[340px]">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pairCount ? Math.min(100, (cursor / pairCount) * 100) : 0}%` }} />
            </div>
            <span className="num text-[12px] text-muted">{integer(cursor)} / {integer(pairCount)} pairs</span>
          </div>
        </div>
        {replayError && <ErrorNotice>{replayError}</ErrorNotice>}
        {error && <ErrorNotice onRetry={() => void load()}>{error.text}</ErrorNotice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card title="Confidence sequence"
          subtitle={<>Mean Δ progress (candidate − baseline) with its anytime-valid 95% band, stage <span className="font-mono">{csStage}</span>{csStage !== str(detail.stage, csStage) ? " (just completed)" : ""}. ROLLBACK when U &lt; −margin; PROMOTE when L &gt; {str(detail.mode) === "noninferiority" ? "−margin" : "0"}.</>}>
          <BandChart points={points} margin={margin} decisionN={crossing ? num(crossing.n) : null} verdict={crossing ? str(crossing.verdict) : null} />
        </Card>
        <div className="space-y-6">
          <Card title="Latest decision">
            {last ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Badge value={str(last.verdict)} /><span className="num text-[12px] text-muted">n = {integer(last.n)} · {str(last.stage)}</span></div>
                <dl className="num grid grid-cols-3 gap-2 text-center">
                  {[["Mean Δ", signed(last.mean)], ["L", signed(last.lcb)], ["U", signed(last.ucb)]].map(([k, v]) => (
                    <div key={k} className="rounded-md border border-line bg-bg/50 py-2"><dt className="text-[11px] text-dim">{k}</dt><dd className="mt-0.5 text-[15px] font-semibold">{v}</dd></div>
                  ))}
                </dl>
                <p className="text-[12.5px] leading-relaxed text-muted">{str(last.reason, "")}</p>
              </div>
            ) : <p className="text-[13px] text-muted">No decisions yet. Replay streams historical sessions in time order; the gate evaluates after every batch of 25 pairs.</p>}
          </Card>
          <SavingsCard savings={record(detail.savings)} />
        </div>
      </div>

      <Card title="Decisions" subtitle="One row per evaluated batch end and every verdict change" bodyClass=""
        action={<span className="num text-[12px] text-dim">{integer(decisions.length)} rows</span>}>
        {!decisions.length ? <Empty>No decisions recorded yet.</Empty> : (
          <div className="max-h-[320px] overflow-auto">
            <table className="tbl">
              <thead className="sticky top-0 bg-surface"><tr><th>Stage</th><th className="r">n</th><th className="r">Mean Δ</th><th className="r">L</th><th className="r">U</th><th>Verdict</th><th>Reason</th></tr></thead>
              <tbody>
                {[...decisions].reverse().map((d, i) => (
                  <tr key={str(d.id, String(i))}>
                    <td className="font-mono text-[12px] text-muted">{str(d.stage)}</td>
                    <td className="r">{integer(d.n)}</td>
                    <td className="r">{signed(d.mean)}</td>
                    <td className="r">{signed(d.lcb)}</td>
                    <td className="r">{signed(d.ucb)}</td>
                    <td><Badge value={str(d.verdict)} /></td>
                    <td className="max-w-[420px] truncate text-[12px] text-muted" title={str(d.reason, "")}>{str(d.reason, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PeekingPanel id={id} />
        <SitesPanel sites={record(detail.sites)} />
      </div>

      <SliceMinerPanel id={id} initialRun={record(pick(detail, "latestSliceRun") ?? rows(detail.sliceRuns)[0])} terminal={TERMINAL.has(state)} onChanged={load} />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <OverridePanel id={id} state={state} maxTrials={num(detail.maxTrials)} onChanged={load} />
        <AuditPanel id={id} audit={rows(detail.audit)} fallback={record(detail.auditVerification)} refreshKey={rows(detail.audit).length} />
      </div>
    </div>
  );
}
