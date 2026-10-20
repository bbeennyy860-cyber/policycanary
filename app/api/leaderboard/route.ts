import { leaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(leaderboard());
}
