CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY,
	"entity" text,
	"entity_id" integer,
	"action" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer,
	"stage" text,
	"n_pairs" integer,
	"mean_diff" real,
	"lcb" real,
	"ucb" real,
	"verdict" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardrails" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer,
	"slice_name" text,
	"pattern" text,
	"approved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" serial PRIMARY KEY,
	"rollout_id" integer,
	"from_state" text,
	"to_state" text,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "overrides_reason_length" CHECK (length("reason") >= 10)
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "rollouts" (
	"id" serial PRIMARY KEY,
	"baseline_policy_id" integer,
	"candidate_policy_id" integer,
	"alpha" real,
	"margin" real,
	"max_trials" integer,
	"mode" text,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "rollouts_different_policies" CHECK ("baseline_policy_id" <> "candidate_policy_id")
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
	"rollout_id" integer,
	"source" text,
	"model" text,
	"proposals" jsonb,
	"results" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
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
ALTER TABLE "rollouts" ADD CONSTRAINT "rollouts_baseline_policy_id_policies_id_fkey" FOREIGN KEY ("baseline_policy_id") REFERENCES "policies"("id");--> statement-breakpoint
ALTER TABLE "rollouts" ADD CONSTRAINT "rollouts_candidate_policy_id_policies_id_fkey" FOREIGN KEY ("candidate_policy_id") REFERENCES "policies"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_site_id_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id");--> statement-breakpoint
ALTER TABLE "slice_runs" ADD CONSTRAINT "slice_runs_rollout_id_rollouts_id_fkey" FOREIGN KEY ("rollout_id") REFERENCES "rollouts"("id");--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id");--> statement-breakpoint
ALTER TABLE "trials" ADD CONSTRAINT "trials_policy_id_policies_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id");