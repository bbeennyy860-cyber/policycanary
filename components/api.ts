export type JsonRecord = Record<string, unknown>;
export function record(value: unknown): JsonRecord { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
export function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
export function str(value: unknown, fallback = "—"): string { return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback; }
export function num(value: unknown, fallback = 0): number { const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(n) ? n : fallback; }
export function fixed(value: unknown, digits = 3): string { return value === null || value === undefined ? "—" : num(value).toFixed(digits); }
export function signed(value: unknown): string { return value === null || value === undefined ? "—" : `${num(value) > 0 ? "+" : ""}${fixed(value)}`; }
export function integer(value: unknown): string { return value === null || value === undefined ? "—" : num(value).toLocaleString("en-GB"); }
export function time(value: unknown): string { if (!value) return "—"; const date = new Date(str(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
export function message(error: unknown): string { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
export async function api(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(str(record(payload).error, `Request failed (${response.status}). ${response.status === 404 ? "This API is not available yet." : "Please retry."}`));
  if (payload === null) throw new Error("The server returned an unreadable response.");
  return payload;
}
