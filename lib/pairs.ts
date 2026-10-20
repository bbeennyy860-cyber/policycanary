import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { policies, sessions, sites, trials } from "@/db/schema";
import type { PairObs } from "@/lib/contract";

export async function getPairs(base: string, cand: string): Promise<PairObs[]> {
  const bt = alias(trials, "base_trial");
  const ct = alias(trials, "cand_trial");
  const bp = alias(policies, "base_policy");
  const cp = alias(policies, "cand_policy");
  const rows = await db.select({
    sessionId: sessions.id, t: sessions.occurredAt, site: sites.name,
    instr: sessions.instruction, notes: sessions.notes, base: bt.progress, cand: ct.progress,
  }).from(sessions)
    .innerJoin(bt, eq(bt.sessionId, sessions.id))
    .innerJoin(ct, eq(ct.sessionId, sessions.id))
    .innerJoin(bp, and(eq(bp.id, bt.policyId), eq(bp.name, base)))
    .innerJoin(cp, and(eq(cp.id, ct.policyId), eq(cp.name, cand)))
    .leftJoin(sites, eq(sites.id, sessions.siteId))
    .orderBy(asc(sessions.occurredAt), asc(sessions.id));
  return rows.map(row => ({ ...row, t: row.t.toISOString(), site: row.site ?? "", d: row.cand - row.base }));
}
