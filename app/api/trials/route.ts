import { body, errorResponse, HttpError } from "@/lib/rollout/http";
import { ingestTrials } from "@/lib/rollout/service";
import { trialSchema } from "@/lib/rollout/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 200) throw new HttpError(400, "Idempotency-Key header is required (max 200 chars)");
    const input = trialSchema.parse(await body(request));
    const result = await ingestTrials(key, input);
    return Response.json(result.body, { status: result.status, headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined });
  } catch (error) {
    return errorResponse(error);
  }
}
