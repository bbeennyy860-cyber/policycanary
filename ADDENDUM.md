# ADDENDUM — overrides SPEC.md where they conflict (read after SPEC.md)

## Platform: Netlify, not Vercel (Vercel account suspended)
- Hosting: Netlify site `comfy-cucurucho-5e70ed` (already linked in `.netlify/`). Next.js 15 App Router deploys natively on Netlify.
- Database: **Netlify Database** (managed Postgres). Packages: `@netlify/database` and `drizzle-orm@beta` / `drizzle-kit@beta` (beta REQUIRED for the `drizzle-orm/netlify-db` adapter).
  - `db/index.ts`: `import { drizzle } from "drizzle-orm/netlify-db"; export const db = drizzle({ schema });`
  - Raw SQL / transactions: `import { getDatabase } from "@netlify/database"; const { sql, pool } = getDatabase();` (pool = pg.Pool; BEGIN/COMMIT on one client).
  - `drizzle.config.ts` MUST set `out: "netlify/database/migrations"`. Migrations there are applied automatically on every Netlify deploy.
  - Local dev: `npx netlify-cli@latest dev` provides a local database; `npx netlify-cli@latest database status|connect --query "..."`.
- **Seeding**: generate `netlify/database/migrations/<ts>_seed_roboarena/migration.sql` from `data/roboarena_sessions.json` with a script (`scripts/gen-seed.ts`), using multi-row INSERTs with ON CONFLICT DO NOTHING, so production is seeded by the deploy itself. Escape strings correctly (notes contain quotes/newlines).
- No `DATABASE_URL`; the connection is automatic. `OPENAI_API_KEY` is already set as a Netlify secret env var (never print it).
- Deploy: `npx netlify-cli@latest deploy --build --prod`. Use `npx netlify-cli@latest`, NOT the global `netlify` (v23 is outdated).

## GOLD features (in addition to SPEC; these are what make it a product, not a demo)
G1. **Peeking simulator (proves why the engine exists)** — W2 `lib/stats/peeking.ts` + W4 panel.
    Under the null (sign-flip the real paired diffs of the chosen rollout so true mean = 0), run R=400 seeded Monte Carlo
    replays. For each replay, compare (a) naive "peek after every 10 pairs, promote if t-test p<0.05" vs (b) the betting CS.
    Report false-decision rate for each (naive is expected ≫5%, CS ≤5%). Deterministic seed (mulberry32). Run server-side
    in < 2 s (use a coarser 199-point grid for the simulator only, documented). UI: "If you peeked naively you'd ship a
    worse robot X% of the time. PolicyCanary: Y%."
G2. **Robot-hours saved ledger** — W2 `lib/stats/savings.ts`. Using episode `duration` (seconds), compute robot-time spent
    up to the sequential decision vs a fixed-horizon test sized by the classic power formula
    n = ((z_{1-α/2}+z_{0.8})·σ/δ)² with δ = |final mean| and σ = sample sd (cap at available pairs, label "≥" when capped).
    Show pairs saved, robot-hours saved, % saved. Per rollout.
G3. **Fleet leaderboard (Bradley–Terry)** — W2 `lib/stats/bradleyTerry.ts`, W1 route `/api/leaderboard`, W4 page `/leaderboard`.
    From every session with ≥2 arms, derive pairwise wins by partial_success (ties = half win each). Fit BT strengths by
    MM iterations (Hunter 2004) to tolerance 1e-8, report log-strength, 95% CI via 200 seeded bootstrap resamples of
    sessions, and the number of comparisons. Policies with <30 comparisons flagged "insufficient data". Click a pair →
    prefill New Rollout.
G4. **Per-site heterogeneity** — W2 `lib/stats/sites.ts`: per-site mean diff + Wilson-style CI on win rate, and Cochran's Q
    + I² across sites (sites with n ≥ 10). W4 table on rollout page: "Regression concentrated at: <sites>".
G5. **Live ingest with idempotency + audit hash chain** — W3: every audit_log row stores
    `hash = sha256(prev_hash || canonical_json(payload))`; `GET /api/rollouts/:id/audit/verify` recomputes the chain and
    returns {valid, length, firstBrokenId}. UI shows a "chain verified" badge. Ingest `POST /api/trials` requires an
    `Idempotency-Key` header; replaying the same key returns the original response (store in `idempotency_keys` table).
G6. **Slice Miner rigour** — W5/W2: the LLM sees ONLY discovery-half data; the engine reports for every proposal: n, mean,
    p, Holm threshold, decision, and **a permutation p-value** (2,000 seeded label shuffles within the confirmation half) as
    a non-parametric cross-check. UI shows rejected proposals prominently ("the AI's idea didn't survive").
    LLM call: OpenAI `gpt-4.1-mini` through Vercel AI SDK `generateObject` (works on any host), cached fallback.

## Cut order if behind (never cut: golden decisions, slice confirmation, audit chain, live deploy)
G3 bootstrap CIs → G4 Cochran's Q → G1 UI polish → stage EXPAND/FULL.

## Ownership additions
W1: scripts/gen-seed.ts, netlify/database/migrations/**, app/api/leaderboard/route.ts, netlify.toml.
W2: lib/stats/{peeking,savings,bradleyTerry,sites,permutation}.ts + tests.
W3: audit hash chain, idempotency_keys table (coordinate: W3 adds tables by editing db/schema.ts ONLY in a clearly marked
    `// W3 tables` block at the end; W1 regenerates migrations at integration).
W4: app/leaderboard/**, peeking/savings/site panels.
