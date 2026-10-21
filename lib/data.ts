import raw from "../data/roboarena_sessions.json";
import type { PairObs } from "./contract";

export interface Arm { name: string; success: number; progress: number; duration: number | null }
export interface SessionRecord { id: string; t: string; site: string; instr: string; pref?: string; notes: string; policies: Record<string, Arm> }

// RoboArena site labels are free text: 15 spellings of Berkeley and 2 typos of Washington.
// An explicit alias table (not fuzzy matching) keeps the mapping auditable and cannot merge distinct labs.
const SITE_ALIASES: Record<string, string> = Object.fromEntries([
  ...["berkeley", "berkeleu", "berkeleuy", "berkley", "berkele", "berkeleyy", "betkeley", "berkelehy", "berkeleyu",
    "berkely", "berkeeley", "berkekey", "berkreley"].map(k => [k, "Berkeley"]),
  ["unversity of washington", "University of Washington"],
  ["university of washginton", "University of Washington"],
]);

/** Canonical display name for a raw site label; unknown labels pass through trimmed. */
export function canonicalSite(raw: string): string {
  const label = raw.trim().replace(/\s+/g, " ");
  return SITE_ALIASES[label.toLowerCase()] ?? label;
}

let cache: SessionRecord[] | undefined;
/** Loaded once per server instance; ordered by timestamp then id. Site labels are canonicalised. */
export function sessions(): SessionRecord[] {
  if (!cache) {
    cache = (raw as unknown as SessionRecord[]).map(s => ({ ...s, site: canonicalSite(s.site) }))
      .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return cache;
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
