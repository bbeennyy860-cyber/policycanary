"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, integer, message, num, pick, record, rows, signed, str, time, type JsonRecord } from "./api";
import { Badge, Card, Empty, ErrorNotice, Skeleton, Stat } from "./ui";

const DEMOS = [
  { base: "pi0_droid", cand: "pi0_fast_droid", expect: "PROMOTE", note: "Candidate clearly better" },
  { base: "paligemma_fast_droid", cand: "paligemma_binning_droid", expect: "ROLLBACK", note: "Early regression caught" },
  { base: "pi0_fast_droid", cand: "paligemma_fast_specialist_droid", expect: "HOLD", note: "No overall difference; mine slices" },
] as const;

// Published counts of the bundled RoboArena snapshot (SPEC.md); live counts replace them when the API answers.
const SNAPSHOT = { policies: 21, sites: 17, episodes: 10781, sessions: 3882, notes: 3878 };

type Mode = "superiority" | "noninferiority";

export function Overview() {
  const router = useRouter();
  const [policies, setPolicies] = useState<JsonRecord[]>([]);
  const [rollouts, setRollouts] = useState<JsonRecord[]>([]);
  const [health, setHealth] = useState<JsonRecord | null>(null);
  const [totals, setTotals] = useState<JsonRecord>({});
  const [loading, setLoading] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [rolloutError, setRolloutError] = useState("");
  const [baseline, setBaseline] = useState("pi0_droid");
  const [candidate, setCandidate] = useState("pi0_fast_droid");
  const [mode, setMode] = useState<Mode>("superiority");
  const [pairInfo, setPairInfo] = useState<JsonRecord | null>(null);
  const [pairError, setPairError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setPolicyError(""); setRolloutError("");
    const [p, r, h] = await Promise.allSettled([api("/api/policies"), api("/api/rollouts"), api("/api/health")]);
    if (p.status === "fulfilled") { setPolicies(rows(Array.isArray(p.value) ? p.value : record(p.value).policies)); setTotals(record(record(p.value).totals)); }
    else setPolicyError(message(p.reason));
    if (r.status === "fulfilled") setRollouts(rows(Array.isArray(r.value) ? r.value : record(r.value).rollouts));
    else setRolloutError(message(r.reason));
    setHealth(h.status === "fulfilled" ? record(h.value) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const base = q.get("base"); const cand = q.get("cand");
    if (base) setBaseline(base);
    if (cand) setCandidate(cand);
    if (base || cand) setTimeout(() => document.getElementById("new-rollout")?.scrollIntoView({ behavior: "smooth" }), 150);
    void load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setPairInfo(null); setPairError("");
    if (baseline && candidate && baseline !== candidate) {
      api(`/api/pairs?base=${encodeURIComponent(baseline)}&cand=${encodeURIComponent(candidate)}`, undefined, controller.signal)
        .then(v => setPairInfo(record(v)))
        .catch(e => { if (!controller.signal.aborted) setPairError(message(e)); });
    }
    return () => controller.abort();
  }, [baseline, candidate]);

  async function createRollout(base: string, cand: string, m: Mode, key: string) {
    setFormError(""); setSaving(key);
    try {
      const res = record(await api("/api/rollouts", { baseline: base, candidate: cand, mode: m }));
      const id = pick(res, "id") ?? record(res.rollout).id;
      if (id === undefined) throw new Error("The server did not return a rollout id.");
      router.push(`/rollouts/${encodeURIComponent(str(id))}`);
    } catch (e) { setFormError(message(e)); setSaving(null); }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!baseline || !candidate || baseline === candidate) { setFormError("Choose two different policies."); return; }
    void createRollout(baseline, candidate, mode, "form");
  }

  const sorted = useMemo(() => [...policies].sort((a, b) => num(pick(b, "episodes", "episodeCount", "count")) - num(pick(a, "episodes", "episodeCount", "count"))), [policies]);
  const liveEpisodes = policies.length ? policies.reduce((s, p) => s + num(pick(p, "episodes", "episodeCount", "count")), 0) : null;
  const names = policies.length ? policies.map(p => str(p.name)) : Array.from(new Set(DEMOS.flatMap(d => [d.base, d.cand])));
  const pairCount = pairInfo ? num(pick(pairInfo, "count", "pairCount", "pairs")) : null;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <div className="label text-accent">Robot policy release gate</div>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-tight text-ink">Release gate for robot AI policies</h1>
          <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted">
            PolicyCanary compares a candidate policy against your baseline one paired evaluation at a time, and stops the moment an
            anytime-valid confidence sequence can call PROMOTE or ROLLBACK, so peeking at results never inflates the error rate.
          </p>
        </div>
        <div className="card p-4 text-[12.5px] leading-relaxed text-muted">
          <div className="label mb-1.5">Data source</div>
          Every number on this dashboard comes from replaying real RoboArena evaluation sessions in chronological order
          (Hugging Face DataDump, MIT licence). It is a replay, not live fleet telemetry.
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Policies" value={integer(num(totals.policies, policies.length || SNAPSHOT.policies))} hint="Registered in the snapshot" />
        <Stat label="Evaluation sites" value={integer(num(totals.sites, num(health?.sites, SNAPSHOT.sites)))} hint="Universities and labs" />
        <Stat label="Real episodes" value={integer(num(totals.episodes, liveEpisodes ?? num(health?.trials, SNAPSHOT.episodes)))} hint="Scored policy executions" />
        <Stat label="Sessions with notes" value={integer(num(totals.sessionsWithNotes, SNAPSHOT.notes))} hint={`Of ${integer(num(totals.sessions, num(health?.sessions, SNAPSHOT.sessions)))} sessions; evaluator free text`} />
      </section>

      <Card title="Quick start" subtitle="The three reference rollouts from the demo script. Each creates a fresh rollout and opens it.">
        <div className="grid gap-3 md:grid-cols-3">
          {DEMOS.map(d => {
            const key = `${d.base}>${d.cand}`;
            return (
              <button key={key} type="button" disabled={saving !== null} onClick={() => void createRollout(d.base, d.cand, "superiority", key)}
                className="group rounded-lg border border-line bg-surface-2/60 p-4 text-left transition-colors hover:border-accent/50 disabled:opacity-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-dim">Expected verdict</span>
                  <Badge value={d.expect} />
                </div>
                <div className="mt-3 font-mono text-[12.5px] leading-snug text-ink">{d.base}</div>
                <div className="font-mono text-[12.5px] leading-snug text-muted">→ {d.cand}</div>
                <div className="mt-3 flex items-center justify-between text-[12px]">
                  <span className="text-muted">{d.note}</span>
                  <span className="text-accent group-hover:underline">{saving === key ? "Creating…" : "Run"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Policy registry" subtitle="Episodes observed per policy in the snapshot" bodyClass="">
          {policyError ? <div className="p-5"><ErrorNotice onRetry={() => void load()}>{policyError}</ErrorNotice></div>
            : loading ? <Skeleton rows={6} />
            : !sorted.length ? <Empty>No policies loaded. Seed the database to populate the registry.</Empty>
            : (
              <div className="max-h-[440px] overflow-auto">
                <table className="tbl">
                  <thead className="sticky top-0 bg-surface"><tr><th>Policy</th><th className="r">Episodes</th><th className="r" /></tr></thead>
                  <tbody>
                    {sorted.map(p => (
                      <tr key={str(p.name)}>
                        <td className="font-mono text-[12.5px]">{str(p.name)}</td>
                        <td className="r">{integer(pick(p, "episodes", "episodeCount", "count"))}</td>
                        <td className="r">
                          <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => { setCandidate(str(p.name)); document.getElementById("new-rollout")?.scrollIntoView({ behavior: "smooth" }); }}>Set as candidate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>

        <div id="new-rollout" className="scroll-mt-20">
          <Card title="New rollout" subtitle="Gate a candidate against a baseline on shared sessions">
            <form className="space-y-4" onSubmit={submit}>
              <label className="field">Baseline
                <select className="input font-mono" value={baseline} onChange={e => setBaseline(e.target.value)}>
                  {!names.includes(baseline) && <option value={baseline}>{baseline}</option>}
                  {names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="field">Candidate
                <select className="input font-mono" value={candidate} onChange={e => setCandidate(e.target.value)}>
                  {!names.includes(candidate) && <option value={candidate}>{candidate}</option>}
                  {names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <fieldset className="field">
                <legend className="mb-1.5">Mode</legend>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-line-strong bg-[#0d1626] p-1">
                  {([["superiority", "Superiority"], ["noninferiority", "Non-inferiority"]] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setMode(v)}
                      className={`h-7 rounded-md text-[12.5px] transition-colors ${mode === v ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--border-strong)]" : "text-muted hover:text-ink"}`}>{l}</button>
                  ))}
                </div>
                <span className="text-[11.5px] text-dim">{mode === "superiority" ? "Promote only if the candidate is better (L > 0)." : "Promote if the candidate is no worse than the margin (L > −0.02)."}</span>
              </fieldset>
              <div className="rounded-md border border-line bg-bg/60 px-3 py-2.5 text-[12.5px]">
                <div className="label mb-1">Paired evidence</div>
                {baseline === candidate ? <span className="text-warn">Select two different policies.</span>
                  : pairInfo ? <span className="num text-ink">{integer(pairCount)} shared sessions <span className="text-dim">·</span> mean Δ progress {signed(pick(pairInfo, "mean", "meanDiff"))}</span>
                  : pairError ? <span className="text-bad">{pairError}</span>
                  : <span className="text-muted">Counting shared sessions…</span>}
                <div className="mt-1 text-[11.5px] text-dim">α = 0.05, margin 0.02, betting confidence sequence</div>
              </div>
              {formError && <ErrorNotice>{formError}</ErrorNotice>}
              <button className="btn btn-primary w-full" disabled={saving !== null || baseline === candidate || pairCount === 0}>
                {saving === "form" ? "Creating rollout…" : "Create rollout"}
              </button>
            </form>
          </Card>
        </div>
      </div>

      <div id="rollouts" className="scroll-mt-20">
        <Card title="Rollouts" subtitle="Newest first" bodyClass="" action={<button type="button" className="btn btn-sm" onClick={() => void load()}>Refresh</button>}>
          {rolloutError ? <div className="p-5"><ErrorNotice onRetry={() => void load()}>{rolloutError}</ErrorNotice></div>
            : loading ? <Skeleton rows={3} />
            : !rollouts.length ? <Empty>No rollouts yet. Start one from the quick-start cards or the form above.</Empty>
            : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>ID</th><th>Baseline → candidate</th><th>Mode</th><th>State</th><th>Stage</th><th className="r">Pairs replayed</th><th>Created</th><th /></tr></thead>
                  <tbody>
                    {rollouts.map(r => {
                      const id = str(r.id);
                      return (
                        <tr key={id} className="cursor-pointer" onClick={() => router.push(`/rollouts/${id}`)}>
                          <td className="text-muted">#{id}</td>
                          <td className="font-mono text-[12.5px]">{str(pick(r, "baseline", "baselineName"))} <span className="text-dim">→</span> {str(pick(r, "candidate", "candidateName"))}</td>
                          <td className="text-muted">{str(r.mode)}</td>
                          <td><Badge value={str(r.state)} /></td>
                          <td className="font-mono text-[12px] text-muted">{str(r.stage)}</td>
                          <td className="r">{integer(r.cursor)}{r.pairCount !== undefined && <span className="text-dim"> / {integer(r.pairCount)}</span>}</td>
                          <td className="text-muted">{time(pick(r, "createdAt", "created_at"))}</td>
                          <td className="r"><Link href={`/rollouts/${id}`} className="text-[12px] text-accent hover:underline" onClick={e => e.stopPropagation()}>Open</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}
