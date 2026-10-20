import { createHash } from "node:crypto";
import type { Queryable } from "./db";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface AuditEnvelope {
  payload: { [key: string]: Json };
  prevHash: string;
  hash: string;
}
export interface AuditRow extends Record<string, unknown> {
  id: number;
  entity: string;
  entity_id: number;
  action: string;
  payload: AuditEnvelope;
}

/** Stable across JS insertion order and PostgreSQL jsonb key reordering. */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Non-finite audit value");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function auditHash(prevHash: string, payload: Json): string {
  return createHash("sha256").update(prevHash + canonicalJson(payload)).digest("hex");
}

/** Hashes live in the audit_log JSON envelope, so the W1 table stays unchanged. */
export async function appendAudit(
  db: Queryable, entity: string, entityId: number, action: string, details: { [key: string]: Json },
): Promise<void> {
  // Serialize each entity's chain, including its first insert; released at COMMIT.
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1), $2)", [`audit:${entity}`, entityId]);
  const previous = await db.query<AuditRow>(
    "SELECT * FROM audit_log WHERE entity = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1", [entity, entityId],
  );
  const prevHash = previous.rows[0]?.payload.hash ?? "";
  const payload = { ...details, entity, entityId, action };
  const envelope: AuditEnvelope = { payload, prevHash, hash: auditHash(prevHash, payload) };
  await db.query("INSERT INTO audit_log (entity, entity_id, action, payload) VALUES ($1, $2, $3, $4::jsonb)",
    [entity, entityId, action, JSON.stringify(envelope)]);
}

export function verifyAudit(rows: AuditRow[]): { valid: boolean; length: number; firstBrokenId: number | null } {
  let previous = "";
  for (const row of rows) {
    const envelope = row.payload;
    if (!envelope || !envelope.payload || envelope.prevHash !== previous ||
      envelope.payload.entity !== row.entity || envelope.payload.entityId !== row.entity_id ||
      envelope.payload.action !== row.action || envelope.hash !== auditHash(previous, envelope.payload)) {
      return { valid: false, length: rows.length, firstBrokenId: row.id };
    }
    previous = envelope.hash;
  }
  return { valid: true, length: rows.length, firstBrokenId: null };
}
