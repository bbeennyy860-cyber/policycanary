# W3 - Rollout state machine + API
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Owns: lib/rollout/**, app/api/rollouts/**, app/api/trials/route.ts, lib/rollout/__tests__/**.
Use lib/stats (W2) and lib/pairs (W1) through their exported signatures only; if they are still stubs, code against the signatures and test the machine with fake pairs.
Implement the state machine and every route in SPEC "Rollout state machine" and "API". Key rules:
- transition(state, event) is a pure function; illegal -> throws IllegalTransition -> route returns 409.
- replay uses optimistic lock on cursor (UPDATE ... WHERE id=$1 AND cursor=$2); lost race -> 409.
- every transition and override writes audit_log in the same transaction as the state change.
- override reason < 10 chars -> 400; trial duplicate (session, policy) -> 409; progress outside [0,1] -> 400.
- stage progression: EVAL -> CANARY_10 -> EXPAND_50 -> FULL; CS restarts on remaining stream at each stage.
- /slices calls `mineSlices` from lib/slices/miner.ts (W5) with ONLY discovery-half pairs, then testSlices; stores slice_runs.
- /guardrails accepts only a slice confirmed in the latest run (else 409), then transitions to ROLLED_BACK with reason.
Tests: pure machine table test (all legal + several illegal transitions); route-level tests for 400/404/409 cases with a mocked db are fine.
Acceptance: `npm test -- lib/rollout` green; against local dev + seeded DB, curl sequence: create pi0_droid->pi0_fast_droid, replay until stop -> state CANARY with a PROMOTE decision at n=136; duplicate trial -> 409; empty override reason -> 400. Paste outputs.
