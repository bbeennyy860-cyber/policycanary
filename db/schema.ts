import { sql } from "drizzle-orm";
import { check, doublePrecision, integer, jsonb, pgTable, real, serial, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Reference data (seeded by netlify/database/migrations/*_seed_roboarena). Reads are served from
// data/roboarena_sessions.json in memory (lib/data.ts); these tables are the durable ingest record.
export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  siteId: integer("site_id").references(() => sites.id),
  instruction: text("instruction").notNull(),
  notes: text("notes").notNull().default(""),
});

export const trials = pgTable("trials", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").references(() => sessions.id),
  policyId: integer("policy_id").references(() => policies.id),
  success: smallint("success").notNull(),
  progress: real("progress").notNull(),
  durationS: integer("duration_s"),
}, (table) => [
  unique("trials_session_policy_unique").on(table.sessionId, table.policyId),
  check("trials_progress_range", sql`${table.progress} >= 0 AND ${table.progress} <= 1`),
]);

// Rollouts reference policies by name so the gate works from the JSON snapshot without joins.
export const rollouts = pgTable("rollouts", {
  id: serial("id").primaryKey(),
  baseline: text("baseline").notNull(),
  candidate: text("candidate").notNull(),
  alpha: doublePrecision("alpha").notNull(),
  margin: doublePrecision("margin").notNull(),
  maxTrials: integer("max_trials").notNull(),
  mode: text("mode").notNull(),
  state: text("state").notNull().default("DRAFT"),
  cursor: integer("cursor").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("rollouts_different_policies", sql`${table.baseline} <> ${table.candidate}`),
]);

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").notNull().references(() => rollouts.id),
  stage: text("stage").notNull(),
  nPairs: integer("n_pairs").notNull(),
  meanDiff: doublePrecision("mean_diff").notNull(),
  lcb: doublePrecision("lcb").notNull(),
  ucb: doublePrecision("ucb").notNull(),
  verdict: text("verdict").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const overrides = pgTable("overrides", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").notNull().references(() => rollouts.id),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("overrides_reason_length", sql`length(${table.reason}) >= 10`)]);

export const sliceRuns = pgTable("slice_runs", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").notNull().references(() => rollouts.id),
  source: text("source").notNull(),
  model: text("model"),
  splitIndex: integer("split_index").notNull().default(0),
  proposals: jsonb("proposals").notNull(),
  results: jsonb("results").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("slice_runs_source", sql`${table.source} IN ('llm', 'fallback')`)]);

export const guardrails = pgTable("guardrails", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").notNull().references(() => rollouts.id),
  sliceName: text("slice_name").notNull(),
  pattern: text("pattern").notNull(),
  approvedBy: text("approved_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// audit_log.payload is an envelope {payload, prevHash, hash}; hash = sha256(prevHash || canonical_json(payload)).
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// W3 tables
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  status: integer("status").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Snapshot of the rollout's pair stream (historical pairs at creation + live-ingested pairs appended).
export const rolloutRuntime = pgTable("rollout_runtime", {
  rolloutId: integer("rollout_id").primaryKey().references(() => rollouts.id),
  stage: text("stage").notNull().default("EVAL"),
  stageStart: integer("stage_start").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  pairs: jsonb("pairs").notNull().default([]),
});
