import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const [counts] = await db.select({
      sessions: sql<number>`(SELECT count(*)::int FROM sessions)`,
      trials: sql<number>`(SELECT count(*)::int FROM trials)`,
      policies: sql<number>`(SELECT count(*)::int FROM policies)`,
      sites: sql<number>`(SELECT count(*)::int FROM sites)`,
    }).from(sql`(SELECT 1) AS health_check`);
    return Response.json({ ok: true, db: true, ...counts });
  } catch {
    return Response.json({ error: "Database unavailable", ok: false, db: false }, { status: 503 });
  }
}
