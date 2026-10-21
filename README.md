# PolicyCanary · a release gate for robot AI policies

Decides when a new robot policy is safe to roll out, using real evaluation data and statistics that stay valid however often you check.

**Live:** https://comfy-cucurucho-5e70ed.netlify.app

## Why this exists

Robotics teams compare a new policy against the current one by running paired trials on real robots, and every trial costs robot-hours. People watch the running win rate and stop when it "looks better". Checking repeatedly like that inflates false promotions: on this dataset, a naive test that peeks every 10 pairs promotes a no-better policy about a third of the time. Free-text evaluator notes often explain *where* a policy fails, but nobody turns them into tested guardrails, and promotion decisions rarely leave an auditable trail.

## What it does

- **Sequential gate.** A rollout replays real paired trials and, after each one, updates an anytime-valid confidence sequence (Waudby-Smith & Ramdas betting CS) on the mean progress difference. It returns PROMOTE, ROLLBACK, HOLD or CONTINUE, and every peek is safe.
- **Staged rollout state machine.** DRAFT → EVALUATING → CANARY (10%) → EXPANDING (50%) → PROMOTED, with ROLLED_BACK, HOLD and ABANDONED. Illegal transitions are rejected (409). Optimistic concurrency uses `expectedCursor`.
- **AI Slice Miner, with statistics disposing.** An LLM reads evaluator notes from the *discovery* half only and proposes failure slices as regex patterns over task instructions. The engine tests each one on the held-out *confirmation* half with a one-sided test, a permutation p-value and Holm correction, and requires at least 15 confirmation pairs. A human then approves a confirmed slice as a guardrail. If the AI's idea fails the test, the UI says so.
- **Peeking simulation.** Shows the naive-peeking false-promotion rate against the CS rate on this rollout's own data.
- **Time to decision.** Robot-hours the gate needed against running every available pair. The oracle fixed-horizon size is shown for reference, labelled as needing the true effect in advance.
- **Site heterogeneity.** Per-site effects, Cochran's Q and I². A site is flagged as a regression only after Holm correction across sites.
- **Fleet leaderboard.** Bradley-Terry ratings with session-bootstrap intervals. Policies with fewer than 30 comparisons are listed unranked.
- **Hash-chained audit log.** Every create, replay, transition, override and slice run is appended with `prevHash → hash`. `GET /api/rollouts/:id/audit/verify` re-walks the chain.
- **Overrides** need an actor and a reason of at least 10 characters. Resuming from HOLD needs a larger trial budget and continues the stage the rollout stopped in. The actor is self-reported: the demo has no sign-in, so the audit chain proves the log wasn't edited, not who made each change.
- **Idempotent trial ingest:** `POST /api/trials` with `Idempotency-Key`. Same key and body returns the stored response; same key with a different body returns 409. A new trial is appended to every active rollout for those two policies and evaluated straight away; new rollouts are built from the bundled snapshot.

### Real output

Golden decisions (computed independently in Python before the build, reproduced by the TypeScript engine and checked end to end through the API):

```
pi0_droid → pi0_fast_droid                       PROMOTE   at pair 136   CS [0.006, 0.250]
paligemma_fast_droid → paligemma_binning_droid   ROLLBACK  at pair 55    CS [-0.628, -0.028]
pi0_fast_droid → paligemma_fast_specialist_droid HOLD      at pair 691   CS [-0.072, 0.010]   (unit-tested)
```

- **Peeking simulation** on pi0 → pi0_fast (400 replications, peek every 10 pairs): naive false-promotion rate **0.3375**; confidence-sequence rate **0.0075**.
- **Time to decision** on the same rollout: 26.4 robot-hours (19.5% of the 135.5 h for all 710 pairs).

### Calibration across all policy pairs

The three golden rollouts are examples; `npm run calibrate` checks the two headline claims on **every** pair of the 21 policies with at least 30 paired sessions (29 pairs, 15,560 observations) and writes [`docs/CALIBRATION.md`](docs/CALIBRATION.md). Seeds are fixed, so a re-run reproduces the file byte for byte.

- **No real difference, does it still declare a winner?** Each session's difference has its sign flipped at random (swapping which arm is baseline), so the true mean is 0. Naive peeking every 10 pairs declares a false winner **29.2%** of the time (95% CI 28.4–30.0%). The confidence sequence does so **0.94%** of the time (0.78–1.13%), against a 5% budget; no single pair exceeds 5%.
- **Is it faster than a fixed-sample test?** It depends on the effect, and the honest answer is a trade-off. Where the gate decided (13 of 29 pairs) it took a median of 61 pairs. A fixed test sized in advance for an effect of 0.05 needs a median 453 pairs; sized for 0.15 it needs 51 but finds a difference on only 12 of 28 pairs. The gate needs no effect size chosen in advance and stops early in either direction. It is conservative, so on small effects it holds where a large, well-sized fixed test would eventually detect them.
- **Not tested:** the guarantee assumes the mean difference does not drift over time (for example as evaluators or sites change). Sign flipping cannot check that.

The calibration uses its own seeds and the full 999-point grid, so its figure for pi0 → pi0_fast (34.8% naive, 1.5% CS) differs slightly from the in-app simulation above.

Refusals from the API:

```
POST /api/rollouts {"baseline":"pi0_droid","candidate":"pi0_droid"}      → 400 body: Baseline and candidate must differ
POST /api/rollouts/3/override {"reason":"short", ...}                    → 400 reason: Too small: expected string to have >=10 characters
POST /api/rollouts/3/replay {"batch":25,"expectedCursor":0}              → 409 Cursor mismatch: expected 0, current 136
```

In the local end-to-end run, the Slice Miner (gpt-4.1-mini) proposed six slices. None survived Holm correction or the minimum-sample rule on the confirmation half, and the UI reports that rather than tuning patterns until something passes.

## How it's built

- **Next.js 15 App Router, strict TypeScript, Tailwind, Recharts, zod.** Hosted on Netlify with **Netlify Database** (managed Postgres). Migrations in `netlify/database/migrations` are applied on deploy.
- **Data.** The RoboArena snapshot (3,882 sessions, 10,781 trials, 21 policies; MIT licence) is seeded by a generated SQL migration. Its free-text site labels (33 raw spellings, including 14 for Berkeley) are mapped to 17 sites through an explicit alias table. Fuzzy matching could silently merge two different labs.
- **Statistics are pure functions** in `lib/stats/`, unit-tested against golden values. `bettingCs` is an exact port of the Python reference used to compute those values. Decisions never depend on the LLM.
- **The LLM sees only the discovery half.** That's the guard against the model "finding" patterns in the same data used to confirm them. In production the miner calls gpt-4.1-mini through Netlify AI Gateway, using credentials the platform injects, and live runs are capped at 30 an hour. With no credentials, past the cap, or if the call fails, it falls back to hand-labelled reference proposals (written from one pair's discovery notes), so the demo never depends on API uptime. The UI says which source was used. Model-written regexes with repeated groups are rejected before they run.
- **Database writes run in transactions** with row locks for state changes. Driver errors are never echoed to clients, because they can contain connection strings or evaluator notes. A missing database or schema returns 503, not 500.
- **Audit integrity is checkable**, not asserted: the verify endpoint recomputes every hash.

## Run locally

```bash
npm install
npx netlify-cli@latest dev                          # Next.js + a local Netlify Database
npx netlify-cli@latest database migrations apply    # first run: create tables and seed RoboArena
```

Live slice mining works under `netlify dev` (it provides AI Gateway credentials) or with `OPENAI_API_KEY` set; otherwise the cached proposals are used.

Checks:

```bash
npx tsc --noEmit
npm test            # Vitest: stats golden values, state machine + replay, miner, site normalisation
npm run build
npm run calibrate   # ~20 s: rewrites docs/CALIBRATION.md; no diff means the numbers reproduce
```

## How this was built: AI-native, timed, and what went wrong

This was the AlgoSoup take-home: build and deploy a product in 60 minutes using AI coding agents. Here is exactly what happened, with commit timestamps (all times BST, 20 Oct 2026).

**Prepared before the clock (allowed prep: idea, spec, data):** `a0e7ea0` 21:14 and `9dbd6dc` 21:38. These cover the product idea, `SPEC.md` (contract, types, schema, statistics method, API, UI, demo script), `ADDENDUM.md` (the Netlify platform switch, because the Vercel account was suspended, plus the feature list), the RoboArena data snapshot, `data/golden.json` reference decisions computed in Python, and one brief per worker in `briefs/`.

**Clock started 21:38:57** (`logs/CLOCK.txt`).

1. **21:39–21:46: W0 scaffold** (Codex CLI) → `608de80` 21:45.
2. **21:46–21:49: five parallel Codex workers (W1–W5)** launched from their briefs. All five hit the Codex subscription usage limit within about 3 minutes (`turn.failed: You've hit your usage limit` in each `logs/W*.jsonl`). Their partial output was committed as `503f2c6` 21:57.
3. **21:58: re-routed** to two Claude subagents through the Hermes orchestrator: one backend, one frontend, each with a 25-minute time box (`logs/orchestrator/`). They produced `964d207` → `260cf24` (22:01–22:11): the stats engine with golden tests, the rollout service and all API routes, regenerated migrations, and the dashboard UI.
4. **22:12:48: the orchestrator process crashed** (Windows APPCRASH, stack overflow in the agent runtime), killing both subagents mid-task, about 34 minutes into the hour. Nothing more was committed before the clock ran out at 22:38:57.

**Finished after the clock (disclosed, not hidden):** every commit after `260cf24` was made after the hour ended. At the point of the crash, type-check, all tests and the production build were already passing. The post-clock work was:

- rebuilding the local database from the regenerated migrations;
- running the full flow end to end: create, replay to PROMOTE at 136, CANARY transition, audit verify, peeking, a live LLM slice run, refusals, and a ROLLBACK at 55;
- fixing two issues found in self-review:
  - the per-site panel split one lab into several rows because the raw labels were inconsistent;
  - the savings card compared against an oracle test, which made the headline rollout read "0 h saved";
- an independent code review pass;
- a calibration script over all 29 eligible policy pairs (`docs/CALIBRATION.md`), so the statistical claims are checked beyond the three demo rollouts;
- this README;
- pushing to GitHub and the first Netlify deploy;
- a fix found by smoke-testing that deploy: production slice runs were silently using the cached proposals, because a project-level `OPENAI_API_KEY` stops Netlify injecting its gateway credentials. The miner now uses the always-injected `NETLIFY_AI_GATEWAY_*` pair, and the fallback logs the HTTP status and endpoint path.
- fixes from the independent review (13 findings, 1 high):
  - high: live ingest and resume-from-HOLD went straight to HOLD, because reaching the end of the stream counted as "data exhausted". Historical replay keeps that rule; live ingest doesn't, and a caught-up replay now records nothing;
  - a HOLD in CANARY resumed into EVAL; it now resumes in the stage it stopped in;
  - the detail page showed the time-to-decision and per-site results before Replay was pressed;
  - leaderboard ranks for policies with too little data, per-site flags without multiplicity correction, a percentage display bug, fallback proposals labelled as AI output, and smaller items (zero-pair rollouts, guardrails on finished rollouts, dead code).

The raw worker logs in `logs/` are unedited.

**What I'd judge from this:** the spec-first, golden-value approach held up. Two separate agent stacks, Codex and then Claude subagents, built against one contract, and the engine still reproduced decisions computed independently in Python. The weak point was operational: one subscription quota and one orchestrator process were single points of failure. Next time, workers would be spread across providers from the start, and the orchestrator would run supervised.
