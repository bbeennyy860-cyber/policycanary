import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { policies, trials } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const rows = await db.select({ id: policies.id, name: policies.name, episodes: count(trials.id) })
      .from(policies).leftJoin(trials, eq(trials.policyId, policies.id))
      .groupBy(policies.id, policies.name).orderBy(asc(policies.name));
    return Response.json({ policies: rows });
  } catch {
    return Response.json({ error: "Unable to load policies" }, { status: 503 });
  }
}
