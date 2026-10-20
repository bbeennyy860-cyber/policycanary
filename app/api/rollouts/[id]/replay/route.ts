import { body, handle, rolloutId, type RouteContext } from "@/lib/rollout/http";
import { replayRollout } from "@/lib/rollout/service";
import { replaySchema } from "@/lib/rollout/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(async () => {
    const id = await rolloutId(context);
    const input = replaySchema.parse(await body(request, true));
    return replayRollout(id, input.batch, input.expectedCursor);
  });
}
