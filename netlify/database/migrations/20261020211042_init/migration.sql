CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY,
	"entity" text NOT NULL,
	"entity_id" integer NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer NOT NULL,
	"stage" text NOT NULL,
	"n_pairs" integer NOT NULL,
	"mean_diff" double precision NOT NULL,
	"lcb" double precision NOT NULL,
	"ucb" double precision NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardrails" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer NOT NULL,
	"slice_name" text NOT NULL,
	"pattern" text NOT NULL,
	"approved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overrides_reason_length" CHECK (length("reason") >= 10)
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "rollout_runtime" (
	"rollout_id" integer PRIMARY KEY,
	"stage" text DEFAULT 'EVAL' NOT NULL,
	"stage_start" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"pairs" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollouts" (
	"id" serial PRIMARY KEY,
	"baseline" text NOT NULL,
	"candidate" text NOT NULL,
	"alpha" double precision NOT NULL,
	"margin" double precision NOT NULL,
	"max_trials" integer NOT NULL,
	"mode" text NOT NULL,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rollouts_different_policies" CHECK ("baseline" <> "candidate")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY,
	"occurred_at" timestamp with time zone NOT NULL,
	"site_id" integer,
	"instruction" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "slice_runs" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"split_index" integer DEFAULT 0 NOT NULL,
	"proposals" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slice_runs_source" CHECK ("source" IN ('llm', 'fallback'))
);
--> statement-breakpoint
CREATE TABLE "trials" (
	"id" serial PRIMARY KEY,
	"session_id" uuid,
	"policy_id" integer,
	"success" smallint NOT NULL,
	"progress" real NOT NULL,
	"duration_s" integer,
	CONSTRAINT "trials_session_policy_unique" UNIQUE("session_id","policy_id"),
	CONSTRAINT "trials_progress_range" CHECK ("progress" >= 0 AND "progress" <= 1)
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "rollout_runtime" ADD CONSTRAINT "rollout_runtime_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_site_id_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id");--> statement-breakpoint
ALTER TABLE "slice_runs" ADD CONSTRAINT "slice_runs_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id");--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_policy_id_policies_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id");