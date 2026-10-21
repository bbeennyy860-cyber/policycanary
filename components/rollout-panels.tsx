"use client";
import { useEffect, useState, type FormEvent } from "react";
import cache from "@/data/slice_cache.json";
import { api, ApiError, fixed, integer, message, num, pick, pct, pval, record, rows, signed, str, time, type JsonRecord } from "./api";
import { Card, Empty, ErrorNotice } from "./ui";

/* ---------- G2 time to decision ---------- */
export function SavingsCard({ savings }: { savings: JsonRecord }) {
  if (!Object.keys(savings).length || savings.decidedAt === undefined) {
    return <Card title="Time to decision"><p className="text-[13px] text-muted">Available once the gate reaches a decision.</p></Card>;
  }
  const capped = savings.fixedHorizonCapped === true;
  const decided = str(savings.verdict) !== "HOLD";
  return (
    <Card title="Time to decision" subtitle="Robot time the gate needed, against running every available pair">
      <div className="num text-[30px] font-semibold leading-none tracking-tight text-accent">{fixed(savings.robotHoursUsed, 1)} h</div>
      <div className="mt-1 text-[12px] text-muted">
        {decided ? `${pct(num(savings.pctUsed) / 100)} of the ${fixed(savings.robotHoursAll, 1)} h for all ${integer(savings.totalPairs)} pairs` : "No decision: the data ran out first"}
      </div>
      <dl className="num mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <dt className="text-dim">Decided at pair</dt><dd className="text-right">{integer(savings.decidedAt)} of {integer(savings.totalPairs)}</dd>
        <dt className="text-dim">Oracle fixed-horizon pairs</dt><dd className="text-right">{capped ? "≥ " : ""}{integer(savings.fixedHorizonPairs)}</dd>
        <dt className="text-dim">σ / δ</dt><dd className="text-right">{fixed(savings.sigma, 3)} / {fixed(savings.delta, 3)}</dd>
      </dl>
      <p className="mt-3 text-[11.5px] leading-relaxed text-dim">The oracle test is sized with the true effect δ, which is unknown before the trials run, and it may be read only once. The gate can be checked after every pair without inflating false promotions.</p>
    </Card>
  );
}

/* ---------- G1 peeking simulator ---------- */
export function PeekingPanel({ id }: { id: string }) {
  const [data, setData] = useState<JsonRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true); setError("");
    try { setData(record(await api(`/api/rollouts/${encodeURIComponent(id)}/peeking`))); }
    catch (e) { setError(message(e)); }
    setBusy(false);
  }
  return (
    <Card title="Peeking simulator" subtitle="Why a sequential test: what happens if you check results after every 10 pairs?"
      action={<button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run()}>{busy ? "Simulating…" : data ? "Run again" : "Run simulation"}</button>}>
      {error && <ErrorNotice onRetry={() => void run()}>{error}</ErrorNotice>}
      {!data && !error && (
        <p className="text-[13px] leading-relaxed text-muted">
          Sign-flips this rollout&apos;s real paired differences so the true effect is zero, then replays it hundreds of times with a seeded generator.
          Any PROMOTE or ROLLBACK under a zero effect is a false decision.
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-bad/30 bg-bad/5 p-4">
              <div className="label">Naive peeking (t-test)</div>
              <div className="num mt-2 text-[34px] font-semibold leading-none text-bad">{pct(data.naiveFalseRate)}</div>
              <div className="num mt-1.5 text-[11.5px] text-muted">{integer(data.naiveFalseDecisions)} of {integer(data.replications)} replays</div>
            </div>
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="label">PolicyCanary (betting CS)</div>
              <div className="num mt-2 text-[34px] font-semibold leading-none text-accent">{pct(data.csFalseRate)}</div>
              <div className="num mt-1.5 text-[11.5px] text-muted">{integer(data.csFalseDecisions)} of {integer(data.replications)} replays</div>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            If you peeked naively every {integer(data.peekEvery)} pairs and shipped on p &lt; 0.05, you would make a false release decision
            {" "}<span className="text-ink">{pct(data.naiveFalseRate, 0)}</span> of the time. The confidence sequence stays at or below α = {fixed(data.alpha, 2)} no matter how often you look.
          </p>
          <p className="num text-[11.5px] text-dim">R = {integer(data.replications)} · seed {str(data.seed)} · {integer(data.nPairs)} pairs · {integer(data.gridPoints)}-point grid · {integer(data.elapsedMs)} ms</p>
        </div>
      )}
    </Card>
  );
}

/* ---------- G4 site heterogeneity ---------- */
export function SitesPanel({ sites }: { sites: JsonRecord }) {
  const list = rows(sites.sites).sort((a, b) => num(a.meanDiff) - num(b.meanDiff));
  const concentrated = new Set((Array.isArray(sites.concentratedAt) ? sites.concentratedAt : []).map(s => str(s)));
  return (
    <Card title="Site heterogeneity" bodyClass=""
      subtitle={list.length ? <span className="num">Cochran&apos;s Q = {fixed(sites.q, 2)} (df {integer(sites.df)}, p {pval(sites.pValue)}) · I² = {pct(sites.i2, 0)}</span> : "Sites with at least 10 pairs"}>
      {!list.length ? <Empty>Per-site statistics appear when the rollout has enough paired data.</Empty> : (
        <>
          {concentrated.size > 0 && (
            <div className="border-b border-line bg-bad/5 px-5 py-2.5 text-[12.5px] text-bad">
              Regression concentrated at (Holm-corrected across sites): <span className="font-mono">{[...concentrated].join(", ")}</span>
            </div>
          )}
          <div className="max-h-[300px] overflow-auto">
            <table className="tbl">
              <thead className="sticky top-0 bg-surface"><tr><th>Site</th><th className="r">n</th><th className="r">Mean Δ</th><th className="r">±1.96 SE</th><th className="r">Win rate [95% CI]</th></tr></thead>
              <tbody>
                {list.map(s => {
                  const name = str(s.site); const hot = concentrated.has(name);
                  const ci = Array.isArray(s.winCi) ? s.winCi : [];
                  return (
                    <tr key={name} className={hot ? "[&>td]:bg-bad/5" : ""}>
                      <td className={`font-mono text-[12.5px] ${hot ? "text-bad" : ""}`}>{name}</td>
                      <td className="r">{integer(s.n)}</td>
                      <td className={`r ${num(s.meanDiff) < 0 ? "text-bad" : num(s.meanDiff) > 0 ? "text-good" : ""}`}>{signed(s.meanDiff)}</td>
                      <td className="r text-muted">{fixed(num(s.se) * 1.96, 3)}</td>
                      <td className="r text-muted">{pct(s.winRate, 0)} <span className="text-dim">[{pct(ci[0], 0)}, {pct(ci[1], 0)}]</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------- G6 slice miner ---------- */
export function SliceMinerPanel({ id, initialRun, terminal, onChanged }: { id: string; initialRun: JsonRecord; terminal: boolean; onChanged: () => Promise<unknown> }) {
  const [run, setRun] = useState<JsonRecord>(initialRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approver, setApprover] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [approveMsg, setApproveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (Object.keys(initialRun).length && !Object.keys(run).length) setRun(initialRun); }, [initialRun, run]);

  async function mine() {
    setBusy(true); setError(""); setApproveMsg(null);
    try { setRun(record(await api(`/api/rollouts/${encodeURIComponent(id)}/slices`, {}))); await onChanged(); }
    catch (e) { setError(message(e)); }
    setBusy(false);
  }
  async function approve(sliceName: string) {
    if (approver.trim().length < 2) { setApproveMsg({ ok: false, text: "Enter your name as approver first." }); return; }
    setApproving(sliceName); setApproveMsg(null);
    try {
      const res = record(await api(`/api/rollouts/${encodeURIComponent(id)}/guardrails`, { sliceName, approvedBy: approver.trim() }));
      setApproveMsg({ ok: true, text: str(res.reason, `Guardrail approved for ${sliceName}.`) });
      await onChanged();
    } catch (e) { setApproveMsg({ ok: false, text: `${e instanceof ApiError ? `${e.status}: ` : ""}${message(e)}` }); }
    setApproving(null);
  }

  const results = rows(run.results);
  const confirmed = results.filter(r => r.confirmed === true);
  const rejected = results.filter(r => r.confirmed !== true);
  const split = num(run.splitIndex);
  const ai = str(run.source) === "llm";

  return (
    <Card title="AI Slice Miner"
      subtitle="AI saw only the first half of the timeline; every idea is tested on the held-out second half."
      action={<button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void mine()}>{busy ? "Mining and testing…" : results.length ? "Re-run miner" : "Mine failure slices"}</button>}>
      {error && <div className="mb-4"><ErrorNotice onRetry={() => void mine()}>{error}</ErrorNotice></div>}
      {!results.length ? (
        <p className="text-[13px] leading-relaxed text-muted">
          A language model reads instructions and evaluator notes from the discovery half only and proposes task slices where the candidate may regress.
          The engine then tests each proposal on the confirmation half with a one-sided z-test, Holm step-down correction across all proposals, and a 2,000-shuffle permutation test.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="num flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
            <span>Source: <span className="text-ink">{ai ? `LLM (${str(run.model)})`
              : `hand-labelled reference proposals from ${cache.provenance.baseline} → ${cache.provenance.candidate} (LLM not called)`}</span></span>
            <span>Discovery pairs 1–{integer(split)} · confirmation {integer(split + 1)}+</span>
            <span><span className="text-good">{confirmed.length} confirmed</span> · <span className="text-bad">{rejected.length} rejected</span> of {results.length} proposals</span>
            {run.createdAt !== undefined && <span>Run {time(run.createdAt)}</span>}
          </div>

          {confirmed.length > 0 && (
            <div className="space-y-3">
              <div className="label text-good">Confirmed on held-out data</div>
              {confirmed.map(r => (
                <div key={str(r.name)} className="rounded-lg border border-good/30 bg-good/5 p-4">
                  <SliceHead r={r} ai={ai} />
                  <SliceStats r={r} />
                  {!terminal && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-good/20 pt-3">
                      <input className="input h-8 w-48" placeholder="Approver name" value={approver} onChange={e => setApprover(e.target.value)} aria-label="Approved by" />
                      <button type="button" className="btn btn-sm border-good/40 text-good" disabled={approving !== null} onClick={() => void approve(str(r.name))}>
                        {approving === str(r.name) ? "Approving…" : "Approve as guardrail"}
                      </button>
                      <span className="text-[11.5px] text-dim">Approving re-tests the slice and rolls back if it still regresses.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {approveMsg && <div className={`rounded-md border px-3 py-2 text-[13px] ${approveMsg.ok ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad"}`}>{approveMsg.text}</div>}

          {rejected.length > 0 && (
            <div className="space-y-3">
              <div className="label text-bad">Rejected: {ai ? "the AI's idea" : "the proposal"} did not survive</div>
              <div className="grid gap-3 md:grid-cols-2">
                {rejected.map(r => (
                  <div key={str(r.name)} className="rounded-lg border border-line bg-surface-2/50 p-4">
                    <SliceHead r={r} ai={ai} />
                    <div className="mt-2 rounded border border-bad/25 bg-bad/5 px-2.5 py-1.5 text-[12px] text-bad">{rejectReason(r)}</div>
                    <SliceStats r={r} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function rejectReason(r: JsonRecord): string {
  const given = str(r.rejectReason, "");
  if (given) return given;
  const p = num(r.pOneSided, 1), t = num(r.holmThreshold);
  if (t > 0 && p > t) return `Failed Holm: p ${pval(p)} > threshold ${pval(t)}`;
  return `Effect on held-out data not below the −margin (mean ${signed(r.meanConf)})`;
}
function SliceHead({ r, ai }: { r: JsonRecord; ai: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[13.5px] font-semibold text-ink">{str(r.name)}</div>
        <code className="truncate font-mono text-[11px] text-dim" title={str(r.pattern)}>/{str(r.pattern)}/i</code>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted"><span className="text-dim">{ai ? "AI rationale" : "Rationale (hand-labelled)"}: </span>{str(r.rationale, "")}</p>
    </div>
  );
}
function SliceStats({ r }: { r: JsonRecord }) {
  const items: [string, string][] = [
    ["Disc n / mean", `${integer(r.nDisc)} / ${signed(r.meanDisc)}`],
    ["Held-out n / mean", `${integer(r.nConf)} / ${signed(r.meanConf)}`],
    ["z", fixed(r.z, 2)],
    ["p (one-sided)", pval(r.pOneSided)],
    ["Holm threshold", num(r.holmThreshold) > 0 ? pval(r.holmThreshold) : "—"],
    ["Permutation p", pval(pick(r, "permutationPValue", "permP"))],
  ];
  return (
    <dl className="num mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-[12px] lg:grid-cols-6">
      {items.map(([k, v]) => <div key={k}><dt className="text-[10.5px] text-dim">{k}</dt><dd className="mt-0.5 text-ink">{v}</dd></div>)}
    </dl>
  );
}

/* ---------- override ---------- */
const OVERRIDE_TARGETS = ["EVALUATING", "CANARY", "EXPANDING", "PROMOTED", "ROLLED_BACK", "HOLD", "ABANDONED"];
export function OverridePanel({ id, state, maxTrials, onChanged }: { id: string; state: string; maxTrials: number; onChanged: () => Promise<unknown> }) {
  const [toState, setToState] = useState("ROLLED_BACK");
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [newMax, setNewMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const resume = state === "HOLD" && toState === "EVALUATING";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setResult(null);
    try {
      const body: JsonRecord = { toState, actor: actor.trim(), reason };
      if (resume) body.maxTrials = num(newMax, maxTrials + 500);
      await api(`/api/rollouts/${encodeURIComponent(id)}/override`, body);
      setResult({ ok: true, text: `State changed to ${toState.replaceAll("_", " ")}. Recorded in the audit log.` });
      setReason("");
      await onChanged();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setResult({ ok: false, text: `${status === 400 ? "Rejected (400)" : status === 409 ? "Illegal transition (409)" : "Error"}: ${message(err)}` });
    }
    setBusy(false);
  }
  return (
    <Card title="Manual override" subtitle="Needs an actor and a reason of at least 10 characters. The actor is self-reported: this demo has no sign-in.">
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">From<input className="input font-mono text-muted" value={state} readOnly aria-readonly /></label>
          <label className="field">To state
            <select className="input font-mono" value={toState} onChange={e => setToState(e.target.value)}>
              {OVERRIDE_TARGETS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {resume && (
          <label className="field">New max pairs (must exceed {integer(maxTrials)})
            <input className="input num" inputMode="numeric" value={newMax} placeholder={String(maxTrials + 500)} onChange={e => setNewMax(e.target.value.replace(/\D/g, ""))} />
          </label>
        )}
        <label className="field">Actor<input className="input" value={actor} onChange={e => setActor(e.target.value)} placeholder="e.g. release-manager@lab" /></label>
        <label className="field">Reason<textarea className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why this override is justified" /></label>
        {result && <div role="status" className={`rounded-md border px-3 py-2 text-[12.5px] ${result.ok ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad"}`}>{result.text}</div>}
        <button className="btn w-full" disabled={busy}>{busy ? "Submitting…" : "Submit override"}</button>
      </form>
    </Card>
  );
}

/* ---------- audit log (G5) ---------- */
export function AuditPanel({ id, audit, fallback, refreshKey }: { id: string; audit: JsonRecord[]; fallback: JsonRecord; refreshKey: number }) {
  const [verify, setVerify] = useState<JsonRecord | null>(null);
  const [verifyError, setVerifyError] = useState("");
  useEffect(() => {
    let live = true;
    api(`/api/rollouts/${encodeURIComponent(id)}/audit/verify`)
      .then(v => { if (live) { setVerify(record(v)); setVerifyError(""); } })
      .catch(e => { if (live) setVerifyError(message(e)); });
    return () => { live = false; };
  }, [id, refreshKey]);
  const v = verify ?? (Object.keys(fallback).length ? fallback : null);
  const badge = v ? (v.valid === true
    ? <span className="pill border-good/30 bg-good/10 text-good">Chain verified · {integer(v.length)} entries</span>
    : <span className="pill border-bad/30 bg-bad/10 text-bad">Chain broken at #{str(v.firstBrokenId)}</span>)
    : verifyError ? <span className="pill border-warn/30 bg-warn/10 text-warn" title={verifyError}>Verification unavailable</span>
    : <span className="pill border-line-strong bg-surface-2 text-muted">Verifying…</span>;
  return (
    <Card title="Audit log" subtitle="SHA-256 hash chain: each entry commits to the previous hash" action={badge} bodyClass="">
      {!audit.length ? <Empty>No audit entries yet.</Empty> : (
        <div className="max-h-[420px] overflow-auto">
          <table className="tbl">
            <thead className="sticky top-0 bg-surface"><tr><th>#</th><th>Time</th><th>Action</th><th>Detail</th><th>Hash</th></tr></thead>
            <tbody>
              {[...audit].reverse().map((a, i) => {
                const p = record(a.payload);
                const inner = record(p.payload);
                const src = { ...inner, ...p, ...a };
                const hash = str(pick(a, "hash") ?? p.hash, "");
                return (
                  <tr key={str(a.id, String(i))}>
                    <td className="text-dim">{str(a.id)}</td>
                    <td className="whitespace-nowrap text-[12px] text-muted">{time(pick(a, "createdAt", "created_at"))}</td>
                    <td><span className="font-mono text-[11.5px] text-ink">{str(a.action)}</span></td>
                    <td className="max-w-[420px] truncate text-[12px] text-muted" title={auditSummary(src)}>{auditSummary(src)}</td>
                    <td className="font-mono text-[11px] text-dim" title={hash}>{hash ? `${hash.slice(0, 10)}…` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function auditSummary(p: JsonRecord): string {
  const parts: string[] = [];
  if (p.fromState !== undefined && p.toState !== undefined) parts.push(`${str(p.fromState)} → ${str(p.toState)}`);
  if (p.actor !== undefined) parts.push(`by ${str(p.actor)}`);
  if (p.approvedBy !== undefined) parts.push(`approved by ${str(p.approvedBy)}`);
  if (p.sliceName !== undefined) parts.push(`slice ${str(p.sliceName)}`);
  if (p.fromCursor !== undefined && p.cursor !== undefined) parts.push(`pairs ${integer(p.fromCursor)} → ${integer(p.cursor)}`);
  if (p.pairCount !== undefined && p.action === "CREATE") parts.push(`${integer(p.pairCount)} pairs`);
  if (Array.isArray(p.confirmed)) parts.push(`confirmed: ${p.confirmed.length ? p.confirmed.map(c => str(c)).join(", ") : "none"}`);
  if (p.reason !== undefined) parts.push(str(p.reason));
  if (p.baseline !== undefined && p.candidate !== undefined) parts.push(`${str(p.baseline)} → ${str(p.candidate)}`);
  return parts.join(" · ") || "—";
}
