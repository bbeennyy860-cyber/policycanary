# PolicyCanary — 60-minute runbook

## Before the clock (allowed prep: idea, spec, data snapshot; disclose all of it in README)
- [ ] Ben approves: create GitHub repo `policycanary` (public) + Vercel project + Neon Postgres via Vercel Marketplace.
- [ ] `mkdir policycanary && cd policycanary`; copy `kit/SPEC.md`, `kit/data/`, `kit/briefs/` in. (`data/roboarena_sessions.json` 3.07 MB, `golden.json`.)
- [ ] `vercel link`, add Neon integration, `vercel env pull .env.local` (DATABASE_URL), add OPENAI_API_KEY to Vercel env via dashboard (never in chat).
- [ ] `mkdir logs` — every worker writes raw JSONL there. These are the unedited agent logs submitted.

## T+0 → T+8: W0 alone
codex exec --json -m gpt-6-astra -c model_reasoning_effort=high -C . "$(cat briefs/W0_scaffold.md)" > logs/W0.jsonl

## T+8 → T+40: W1–W5 in parallel (separate terminals, same repo, disjoint file ownership)
for w in W1_data_deploy W2_stats W3_api_machine W4_ui W5_slice_miner; do
  codex exec --json -m gpt-6-astra -c model_reasoning_effort=high -C . "$(cat briefs/$w.md)" > logs/$w.jsonl &
done; wait
(Git: workers commit only their paths. If two commits race, the later worker re-runs `git commit`; no rebases of others' files.)

## T+40 → T+55: integrate (one Codex integrator, still no manual code)
codex exec --json -m gpt-6-astra -c model_reasoning_effort=high -C . "Run npm run build, npm test, npm run seed, then scripts/smoke.ts against local dev. Fix failures without changing SPEC golden values. Then vercel --prod and run smoke.ts against the live URL. Paste outputs." > logs/W6_integrate.jsonl

## T+55 → T+60: submit
- `git push`; confirm live URL smoke PASS; zip `logs/` raw (no edits) + Ben's orchestration prompts.
- Email Alex: repo URL, live URL, logs.

## Fallbacks
- Neon slow/broken → W1 switches db/client to Vercel Postgres-compatible `postgres` driver; or ship stats/replay from the JSON file with DB only for rollouts/audit.
- LLM down → slice_cache.json (source label shown honestly).
- Stage logic running late → cut EXPAND/FULL; keep EVAL→CANARY + ROLLBACK + HOLD + guardrail.
- Cut order if behind: per-site table → stage timeline polish → /api/trials ingest. Never cut: golden decisions, slice confirmation, audit log, live deploy.
