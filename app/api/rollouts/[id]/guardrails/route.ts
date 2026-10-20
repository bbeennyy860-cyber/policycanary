import { body, handle, rolloutId, type RouteContext } from "@/lib/rollout/http";
import { approveGuardrail } from "@/lib/rollout/service";
import { guardrailSchema } from "@/lib/rollout/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(async () => {
    const id = await rolloutId(context);
    const input = guardrailSchema.parse(await body(request));
    return approveGuardrail(id, input.sliceName, input.approvedBy);
  }, 201);
}
