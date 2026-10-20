# W5 - AI Slice Miner + integration check
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Owns: lib/slices/**, data/slice_cache.json, scripts/smoke.ts.
1. lib/slices/miner.ts `mineSlices(discoveryPairs: PairObs[], ctx: {base, cand}): Promise<{source:'llm'|'fallback', model?:string, proposals: SliceProposal[]}>`.
   - Build a compact prompt: for discovery pairs, aggregate per-instruction mean d and sample up to 120 evaluator notes from the worst pairs (truncate each to 240 chars). Ask the model to propose 4-8 failure slices as {name, pattern (JS regex over task instruction, case-insensitive), rationale citing note themes}.
   - Use Vercel AI SDK generateObject with a zod schema (max 8 items, pattern must compile - validate after, drop invalid with a note). Model: openai('gpt-4.1-mini') via OPENAI_API_KEY; 20 s timeout.
   - The model must never receive confirmation-half rows; assert that in code (pass only what you were given) and in a unit test.
   - Fallback when no key / error / timeout: return cached proposals from data/slice_cache.json (generate this file now by running the real LLM once on the specialist rollout's discovery half; if no key available, write a hand-labelled 6-slice file and mark source 'fallback').
2. scripts/smoke.ts: hits BASE_URL (default http://localhost:3000): health counts; create the 3 golden rollouts; replay to stop; assert PROMOTE@136 / ROLLBACK@55 / HOLD; run slices on specialist; approve deformable if confirmed -> state ROLLED_BACK; duplicate trial 409; empty override 400. Print PASS/FAIL per check, exit non-zero on any FAIL.
Acceptance: unit test for miner (fallback path + no-confirmation-leak) green; smoke.ts passes against local dev, then against the live URL. Paste outputs.
