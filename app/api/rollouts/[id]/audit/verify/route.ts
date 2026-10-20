import { handle, rolloutId, type RouteContext } from "@/lib/rollout/http";
import { verifyRolloutAudit } from "@/lib/rollout/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return handle(async () => verifyRolloutAudit(await rolloutId(context)));
}
