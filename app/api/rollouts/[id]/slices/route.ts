import { handle, rolloutId, type RouteContext } from "@/lib/rollout/http";
import { runSlices } from "@/lib/rollout/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  return handle(async () => runSlices(await rolloutId(context)));
}
