import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, real, serial, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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

export const rollouts = pgTable("rollouts", {
  id: serial("id").primaryKey(),
  baselinePolicyId: integer("baseline_policy_id").references(() => policies.id),
  candidatePolicyId: integer("candidate_policy_id").references(() => policies.id),
  alpha: real("alpha"),
  margin: real("margin"),
  maxTrials: integer("max_trials"),
  mode: text("mode"),
  state: text("state").notNull().default("DRAFT"),
  cursor: integer("cursor").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  check("rollouts_different_policies", sql`${table.baselinePolicyId} <> ${table.candidatePolicyId}`),
]);

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").references(() => rollouts.id),
  stage: text("stage"),
  nPairs: integer("n_pairs"),
  meanDiff: real("mean_diff"),
  lcb: real("lcb"),
  ucb: real("ucb"),
  verdict: text("verdict"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const overrides = pgTable("overrides", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").references(() => rollouts.id),
  fromState: text("from_state"),
  toState: text("to_state"),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [check("overrides_reason_length", sql`length(${table.reason}) >= 10`)]);

export const sliceRuns = pgTable("slice_runs", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").references(() => rollouts.id),
  source: text("source"),
  model: text("model"),
  proposals: jsonb("proposals"),
  results: jsonb("results"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [check("slice_runs_source", sql`${table.source} IN ('llm', 'fallback')`)]);

export const guardrails = pgTable("guardrails", {
  id: serial("id").primaryKey(),
  rolloutId: integer("rollout_id").references(() => rollouts.id),
  sliceName: text("slice_name"),
  pattern: text("pattern"),
  approvedBy: text("approved_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entity: text("entity"),
  entityId: integer("entity_id"),
  action: text("action"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// W3 tables
