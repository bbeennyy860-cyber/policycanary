import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { getPairs } from "@/lib/pairs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const querySchema = z.object({ base: z.string().trim().min(1).max(200), cand: z.string().trim().min(1).max(200) })
  .refine(q => q.base !== q.cand);

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ base: params.get("base"), cand: params.get("cand") });
  if (!parsed.success) return Response.json({ error: "Provide two distinct policy names: base and cand" }, { status: 400 });
  const { base, cand } = parsed.data;
  try {
    const known = await db.select({ name: policies.name }).from(policies).where(inArray(policies.name, [base, cand]));
    if (known.length !== 2) return Response.json({ error: "Unknown policy" }, { status: 404 });
    const pairs = await getPairs(base, cand);
    return Response.json({ base, cand, count: pairs.length, mean: pairs.length ? pairs.reduce((sum, p) => sum + p.d, 0) / pairs.length : null });
  } catch {
    return Response.json({ error: "Unable to load pairs" }, { status: 503 });
  }
}
