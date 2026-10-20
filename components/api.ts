export type JsonRecord = Record<string, unknown>;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
export function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
export function str(value: unknown, fallback = "—"): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
export function maybeNum(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
/** First defined value among several candidate keys (backend field names may vary). */
export function pick(obj: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
}
export function fixed(value: unknown, digits = 3): string {
  const n = maybeNum(value);
  return n === null ? "—" : n.toFixed(digits);
}
export function signed(value: unknown, digits = 3): string {
  const n = maybeNum(value);
  return n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
}
export function integer(value: unknown): string {
  const n = maybeNum(value);
  return n === null ? "—" : Math.round(n).toLocaleString("en-GB");
}
export function pct(value: unknown, digits = 1): string {
  const n = maybeNum(value);
  if (n === null) return "—";
  return `${(n <= 1 ? n * 100 : n).toFixed(digits)}%`;
}
export function pval(value: unknown): string {
  const n = maybeNum(value);
  if (n === null) return "—";
  return n < 0.0001 ? "<0.0001" : n.toFixed(4);
}
export function time(value: unknown): string {
  if (!value) return "—";
  const date = new Date(str(value, ""));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function api(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "Network error: the API could not be reached.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 503
      ? "The database is temporarily unavailable (503). Retry in a moment."
      : response.status === 404 ? "Not found (404)." : `Request failed (${response.status}).`;
    throw new ApiError(response.status, str(record(payload).error, fallback));
  }
  if (payload === null) throw new ApiError(response.status, "The server returned an unreadable response.");
  return payload;
}
