import { body, handle, rolloutId, type RouteContext } from "@/lib/rollout/http";
import { overrideRollout } from "@/lib/rollout/service";
import { overrideSchema } from "@/lib/rollout/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(async () => {
    const id = await rolloutId(context);
    return overrideRollout(id, overrideSchema.parse(await body(request)));
  });
}
