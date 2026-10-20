# W1 - Data, seed, deploy
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Owns: db/**, drizzle.config.ts, scripts/seed.ts, app/api/health/route.ts, app/api/policies/route.ts, app/api/pairs/route.ts, lib/pairs.ts, README.md, vercel config.
1. `npm run db:push` against DATABASE_URL (in .env.local, already provisioned).
2. scripts/seed.ts: load data/roboarena_sessions.json; upsert policies, sites, sessions, trials in batches (ON CONFLICT DO NOTHING) so re-running is idempotent. Skip arms with null progress.
3. lib/pairs.ts: `getPairs(base, cand): Promise<PairObs[]>` - one SQL query joining trials for both policies on session_id, ordered by sessions.occurred_at, id. Pairing rule per SPEC.
4. Routes: /api/health, /api/policies, /api/pairs per SPEC.
5. README: what it is, why, data source + MIT licence, architecture, how stats work (plain English), how to run, honest limits (replay of evaluation data, not live fleet telemetry), AI workflow section (Codex workers, file ownership).
6. Deploy: `vercel --prod` (project already linked); confirm env vars exist on Vercel (do not print values).
Acceptance (paste output): seed twice -> counts identical: sessions 3882, trials 10781, policies 21, sites 33. getPairs('pi0_droid','pi0_fast_droid').length === 710 with mean d 0.1159 (+/-0.0005); binning pair 677; specialist pair 691. Live /api/health returns 200 with those counts.
