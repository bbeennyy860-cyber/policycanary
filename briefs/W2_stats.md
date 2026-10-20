# W2 - Statistics engine (pure functions)
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Owns: lib/stats/** and lib/stats/__tests__/**.
Implement exactly per SPEC "Statistics": wilson, bettingCs, decide, testSlices (+ holm helper, erfc-based normal CDF).
Performance: bettingCs over 710 points with a 999-point grid must run < 300 ms (use Float64Array; keep alive-set bounds monotone).
Also export `runGate(ds, cfg)` returning {series: CsPoint[], decision: Decision, decidedAt: number} - first crossing wins.
Tests (vitest) must load data/roboarena_sessions.json directly, build pairs in-test (same pairing rule), and assert data/golden.json:
- PROMOTE at 136 for pi0_droid->pi0_fast_droid, CS at decision [0.006, 0.250] (+/-0.002)
- ROLLBACK at 55 for paligemma_fast_droid->paligemma_binning_droid, CS [-0.628,-0.028]
- HOLD for pi0_fast_droid->paligemma_fast_specialist_droid, final CS [-0.072, 0.010]
- wilson(7,10) ~ [0.397, 0.892]
- testSlices on the specialist rollout with proposals deformable, cup|mug|bowl, drawer|open|close, stack|on top, invalid "([": deformable confirmed (conf n=32, mean -0.170, p~0.0054); drawer rejected; invalid pattern rejected with reason.
Acceptance: `npm test -- lib/stats` all green; paste output.
