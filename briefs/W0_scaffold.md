# W0 - Scaffold (runs alone first, target <=8 min)
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Goal: create the skeleton every other worker builds on.
1. In the current directory (already contains SPEC.md and data/): `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes` (keep SPEC.md, data/).
2. Install: drizzle-orm @neondatabase/serverless zod ai @ai-sdk/openai recharts ; dev: drizzle-kit vitest tsx @types/node.
3. Create `lib/contract.ts` exactly as in SPEC.md "Shared types". Create `db/schema.ts` (Drizzle) exactly per SPEC "Postgres schema", `db/client.ts` (neon http driver from DATABASE_URL), `drizzle.config.ts`.
4. Create empty stubs that export the right signatures (throw "not implemented") for: lib/stats/{wilson,cs,decide,slices}.ts, lib/rollout/machine.ts, lib/slices/miner.ts.
5. package.json scripts: dev, build, test (vitest run), db:push (drizzle-kit push), seed (tsx scripts/seed.ts).
6. `git init`, .gitignore includes .env*, commit "scaffold".
Acceptance: `npm run build` succeeds; `npx tsc --noEmit` clean.
Owns: everything created in this step. After it finishes, ownership passes to W1-W5 as listed in their briefs.
