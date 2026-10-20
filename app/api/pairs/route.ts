import { z } from "zod";
import { getPairsFromData, policyNames } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const querySchema = z.object({ base: z.string().trim().min(1).max(200), cand: z.string().trim().min(1).max(200) })
  .refine(q => q.base !== q.cand);

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ base: params.get("base"), cand: params.get("cand") });
  if (!parsed.success) return Response.json({ error: "Provide two distinct policy names: base and cand" }, { status: 400 });
  const { base, cand } = parsed.data;
  const names = policyNames();
  if (!names.has(base) || !names.has(cand)) return Response.json({ error: "Unknown policy" }, { status: 404 });
  const pairs = getPairsFromData(base, cand);
  return Response.json({ base, cand, count: pairs.length, mean: pairs.length ? pairs.reduce((s, p) => s + p.d, 0) / pairs.length : null });
}
