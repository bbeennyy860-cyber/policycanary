import { body, handle } from "@/lib/rollout/http";
import { createRollout, listRollouts } from "@/lib/rollout/service";
import { createSchema } from "@/lib/rollout/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handle(() => listRollouts());
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => createRollout(createSchema.parse(await body(request))), 201);
}
