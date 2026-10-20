import { summary } from "@/lib/data";
import { pingDatabase } from "@/lib/rollout/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { totals } = summary();
  const db = await pingDatabase();
  return Response.json({ ok: true, db, dataSource: "json", sessions: totals.sessions, trials: totals.episodes,
    policies: totals.policies, sites: totals.sites }, { status: 200 });
}
