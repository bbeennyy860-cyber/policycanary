import { z } from "zod";
import { IllegalTransition } from "./machine";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface RouteContext { params: Promise<{ id: string }> }
export async function rolloutId(context: RouteContext): Promise<number> {
  const { id } = await context.params;
  return z.coerce.number().int().positive().max(2147483647).parse(id);
}

export async function body(request: Request, emptyAllowed = false): Promise<unknown> {
  const text = await request.text();
  if (emptyAllowed && !text.trim()) return {};
  try { return JSON.parse(text) as unknown; }
  catch { throw new HttpError(400, "Invalid JSON body"); }
}

export async function handle(work: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const result = await work();
    return result instanceof Response ? result : Response.json(result, { status });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(issue => issue.message).join("; ") }, { status: 400 });
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof IllegalTransition) return Response.json({ error: error.message }, { status: 409 });
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "23505") return Response.json({ error: "Duplicate session/policy or conflicting write" }, { status: 409 });
      if (error.code === "40001" || error.code === "40P01") return Response.json({ error: "Concurrent write; retry the request" }, { status: 409 });
    }
    // Driver errors may contain connection strings or submitted evaluator notes.
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
