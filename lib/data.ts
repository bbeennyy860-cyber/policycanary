import raw from "../data/roboarena_sessions.json";
import type { PairObs } from "./contract";

export interface Arm { name: string; success: number; progress: number; duration: number | null }
export interface SessionRecord { id: string; t: string; site: string; instr: string; pref?: string; notes: string; policies: Record<string, Arm> }

let cache: SessionRecord[] | undefined;
/** Loaded once per server instance; ordered by timestamp then id. */
export function sessions(): SessionRecord[] {
  if (!cache) {
    cache = (raw as unknown as SessionRecord[]).slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return cache;
}

/** Ingested sessions are appended in memory (the DB remains the durable record). */
export function addSession(record: SessionRecord): void {
  const all = sessions();
  all.push(record);
  all.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function findSession(id: string): SessionRecord | undefined {
  return sessions().find(s => s.id === id);
}

function arm(s: SessionRecord, name: string): Arm | undefined {
  for (const a of Object.values(s.policies)) if (a.name === name) return a;
  return undefined;
}

export function pairsFrom(all: SessionRecord[], base: string, cand: string): PairObs[] {
  const out: PairObs[] = [];
  for (const s of all) {
    const b = arm(s, base), c = arm(s, cand);
    if (b && c) out.push({ sessionId: s.id, t: s.t, site: s.site, instr: s.instr, notes: s.notes, base: b.progress, cand: c.progress, d: c.progress - b.progress });
  }
  return out;
}

export function getPairsFromData(base: string, cand: string): PairObs[] {
  return pairsFrom(sessions(), base, cand);
}

/** Robot seconds spent on a pair = both arms' episode durations. */
export function pairDurations(pairs: PairObs[], base: string, cand: string): number[] {
  const byId = new Map(sessions().map(s => [s.id, s]));
  return pairs.map(p => {
    const s = byId.get(p.sessionId);
    if (!s) return 0;
    return (arm(s, base)?.duration ?? 0) + (arm(s, cand)?.duration ?? 0);
  });
}

export function policyNames(): Set<string> {
  const names = new Set<string>();
  for (const s of sessions()) for (const a of Object.values(s.policies)) names.add(a.name);
  return names;
}

export function summary() {
  const all = sessions();
  const stats = new Map<string, { episodes: number; sessions: number; success: number; progress: number }>();
  const sites = new Set<string>();
  let episodes = 0, withNotes = 0;
  for (const s of all) {
    sites.add(s.site);
    if (s.notes.trim()) withNotes++;
    for (const a of Object.values(s.policies)) {
      episodes++;
      const st = stats.get(a.name) ?? { episodes: 0, sessions: 0, success: 0, progress: 0 };
      st.episodes++; st.sessions++; st.success += a.success; st.progress += a.progress;
      stats.set(a.name, st);
    }
  }
  const policies = [...stats].map(([name, st]) => ({ name, episodes: st.episodes, sessions: st.sessions,
    successRate: st.success / st.episodes, meanProgress: st.progress / st.episodes }))
    .sort((a, b) => b.episodes - a.episodes || a.name.localeCompare(b.name));
  return { policies, totals: { sessions: all.length, episodes, policies: policies.length, sites: sites.size, sessionsWithNotes: withNotes } };
}
