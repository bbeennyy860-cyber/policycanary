"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, integer, message, num, record, rows, signed, str, type JsonRecord } from "./api";
import { Badge, Empty, ErrorNotice, Panel } from "./ui";

export function Overview() {
  const router = useRouter();
  const [policies, setPolicies] = useState<JsonRecord[]>([]);
  const [rollouts, setRollouts] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rolloutError, setRolloutError] = useState("");
  const [baseline, setBaseline] = useState("pi0_droid");
  const [candidate, setCandidate] = useState("pi0_fast_droid");
  const [mode, setMode] = useState("superiority");
  const [pairInfo, setPairInfo] = useState<JsonRecord | null>(null);
  const [pairError, setPairError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState("");
  async function load() {
    setLoading(true); setLoadError(""); setRolloutError("");
    const results = await Promise.allSettled([api("/api/policies"), api("/api/rollouts")]);
    if (results[0].status === "fulfilled") { const payload = results[0].value; setPolicies(rows(Array.isArray(payload) ? payload : record(payload).policies)); } else setLoadError(message(results[0].reason));
    if (results[1].status === "fulfilled") { const payload = results[1].value; setRollouts(rows(Array.isArray(payload) ? payload : record(payload).rollouts)); } else setRolloutError(message(results[1].reason));
    setLoading(false);
  }
  useEffect(() => { const query = new URLSearchParams(window.location.search); setBaseline(query.get("base") || "pi0_droid"); setCandidate(query.get("cand") || "pi0_fast_droid"); void load(); }, []);
  useEffect(() => {
    const controller = new AbortController(); setPairInfo(null); setPairError("");
    if (baseline && candidate && baseline !== candidate) void api(`/api/pairs?base=${encodeURIComponent(baseline)}&cand=${encodeURIComponent(candidate)}`, undefined, controller.signal).then(value => setPairInfo(record(value))).catch(error => { if (!controller.signal.aborted) setPairError(message(error)); });
    return () => controller.abort();
  }, [baseline, candidate]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    if (!baseline || !candidate || baseline === candidate) { setFormError("Choose two different policies."); return; }
    setSaving(true);
    try { const response = record(await api("/api/rollouts", { baseline, candidate, mode })); const id = response.id ?? record(response.rollout).id; if (id === undefined) throw new Error("The server did not return a rollout ID."); router.push(`/rollouts/${encodeURIComponent(str(id))}`); }
    catch (error) { setFormError(message(error)); setSaving(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">POLICY RELEASE CONTROL</p><h1>Release gate for robot AI policies</h1><p className="subtitle">Move from evaluation to rollout with evidence at every stage.</p></div><a className="button primary" href="#new-rollout">New rollout <span>↗</span></a></div>
    <div className="stats-grid">{[["Policies", "21", "Registered in the source dataset"], ["Evaluation sites", "33", "Across the RoboArena fleet"], ["Real episodes", "10,781", "Observed policy executions"], ["Sessions with notes", "3,878", "Of 3,882 evaluation sessions"]].map(([label, value, caption]) => <section className="stat-card" key={label}><p>{label}<span className="stat-marker" /></p><strong>{value}</strong><small>{caption}</small></section>)}</div>
    <p className="source-note">RoboArena snapshot · Replay of real RoboArena evaluation sessions (MIT licence)</p>
    <div className="overview-grid">
      <Panel title="Policy registry" eyebrow="EVALUATION DATA" action={<span className="subtle">{policies.length ? `${policies.length} policies` : "Source policies"}</span>}>
        <div className="table-toolbar"><label className="search-label"><span>Search</span><input aria-label="Search policies" placeholder="Filter policies by name…" value={filter} onChange={e => setFilter(e.target.value)} /></label><Link className="text-link" href="/leaderboard">View rankings ↗</Link></div>
        {loadError ? <div className="panel-body"><ErrorNotice>{loadError}</ErrorNotice><button className="button" onClick={() => void load()}>Retry loading</button></div> : loading ? <Empty>Loading policy registry…</Empty> : <div className="table-wrap registry-table"><table><thead><tr><th>Policy</th><th className="number">Episodes</th><th /></tr></thead><tbody>{policies.filter(p => str(p.name).toLowerCase().includes(filter.toLowerCase())).map(p => <tr key={str(p.name)}><td><span className="policy-icon">P</span><span className="mono">{str(p.name)}</span></td><td className="number">{integer(p.episodes ?? p.episodeCount ?? p.count)}</td><td><button className="text-link" onClick={() => { setCandidate(str(p.name)); document.getElementById("new-rollout")?.scrollIntoView({ behavior: "smooth" }); }}>Evaluate ↗</button></td></tr>)}</tbody></table>{!policies.filter(p => str(p.name).toLowerCase().includes(filter.toLowerCase())).length && <Empty>No policies match this search.</Empty>}</div>}
      </Panel>
      <div id="new-rollout"><Panel title="New rollout" eyebrow="START WITH A COMPARISON"><form className="panel-body form-stack" onSubmit={create}>
        <p className="subtle">Compare a candidate against your baseline using paired evaluation sessions.</p>
        <label>Baseline policy<select value={baseline} onChange={e => setBaseline(e.target.value)} required>{!policies.length && <option value={baseline}>{baseline}</option>}{policies.map(p => <option key={str(p.name)} value={str(p.name)}>{str(p.name)}</option>)}</select></label>
        <label>Candidate policy<select value={candidate} onChange={e => setCandidate(e.target.value)} required>{!policies.length && <option value={candidate}>{candidate}</option>}{policies.map(p => <option key={str(p.name)} value={str(p.name)}>{str(p.name)}</option>)}</select></label>
        <fieldset><legend>Release criterion</legend><div className="segmented">{[["superiority", "Superiority"], ["noninferiority", "Non-inferiority"]].map(([value, label]) => <label className={mode === value ? "selected" : ""} key={value}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}</div></fieldset>
        <div className="info-box"><span className="eyebrow">PAIRED EVIDENCE</span><p>{baseline === candidate ? "Select different policies to compare." : pairInfo ? `${integer(pairInfo.count ?? pairInfo.pairCount ?? pairInfo.pairs)} shared sessions · ${signed(pairInfo.mean ?? pairInfo.meanDiff)} mean difference` : pairError || "Checking shared sessions…"}</p><small>95% anytime-valid confidence · 0.02 margin</small></div>
        {formError && <ErrorNotice>{formError}</ErrorNotice>}
        <button className="button primary full-width" disabled={saving || !policies.length || baseline === candidate || (pairInfo !== null && num(pairInfo.count ?? pairInfo.pairCount ?? pairInfo.pairs) === 0)}>{saving ? "Creating rollout…" : "Create rollout →"}</button><p className="form-footnote">A rollout starts in draft. Replay evaluates historical sessions in chronological order.</p>
      </form></Panel></div>
    </div>
    <div id="rollouts"><Panel title="Rollouts" eyebrow="RELEASE ACTIVITY" action={<button className="text-link" onClick={() => void load()}>Refresh ↻</button>}>{rolloutError ? <div className="panel-body"><ErrorNotice>{rolloutError}</ErrorNotice></div> : loading ? <Empty>Loading rollouts…</Empty> : !rollouts.length ? <Empty>No rollouts yet. Create a comparison to start collecting evidence.</Empty> : <div className="table-wrap"><table><thead><tr><th>Rollout</th><th>Policy comparison</th><th>State</th><th className="number">Pairs replayed</th><th /></tr></thead><tbody>{rollouts.map(r => <tr key={str(r.id)}><td className="mono">#{str(r.id)}</td><td>{str(r.baseline ?? r.baselineName)} <span className="subtle">→</span> {str(r.candidate ?? r.candidateName)}</td><td><Badge value={str(r.state)} /></td><td className="number">{integer(r.cursor)}</td><td><Link className="text-link" href={`/rollouts/${str(r.id)}`}>Open ↗</Link></td></tr>)}</tbody></table></div>}</Panel></div>
  </>;
}
