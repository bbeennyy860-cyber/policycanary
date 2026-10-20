import { z } from "zod";
import { DatabaseUnavailable } from "./db";
import { IllegalTransition } from "./machine";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface RouteContext { params: Promise<{ id: string }> }
export async function rolloutId(context: RouteContext): Promise<number> {
  const { id } = await context.params;
  const parsed = z.coerce.number().int().positive().max(2147483647).safeParse(id);
  if (!parsed.success) throw new HttpError(400, "Invalid rollout id");
  return parsed.data;
}

export async function body(request: Request, emptyAllowed = false): Promise<unknown> {
  const text = await request.text();
  if (emptyAllowed && !text.trim()) return {};
  try { return JSON.parse(text) as unknown; }
  catch { throw new HttpError(400, "Invalid JSON body"); }
}

const UNAVAILABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "57P01", "57P03", "08000", "08001", "08003", "08006", "42P01", "3D000", "28P01"]);

export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, { status: 400 });
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof IllegalTransition) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof DatabaseUnavailable) return Response.json({ error: error.message }, { status: 503 });
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "23505") return Response.json({ error: "Duplicate record or conflicting write" }, { status: 409 });
    if (code === "40001" || code === "40P01") return Response.json({ error: "Concurrent write; retry the request" }, { status: 409 });
    if (UNAVAILABLE_CODES.has(code)) return Response.json({ error: code === "42P01" ? "Database unavailable: schema not migrated" : "Database unavailable" }, { status: 503 });
  }
  // Driver errors may contain connection strings or submitted evaluator notes: never echo them.
  console.error("[api] unexpected error", error instanceof Error ? error.name : typeof error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function handle(work: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const result = await work();
    return result instanceof Response ? result : Response.json(result, { status });
  } catch (error) {
    return errorResponse(error);
  }
}
