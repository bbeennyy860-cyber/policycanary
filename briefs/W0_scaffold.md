# W0 - Scaffold (runs alone first, target <=8 min)
Read SPEC.md in the repo root first; it is the contract. Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Goal: create the skeleton every other worker builds on.
0. Read ADDENDUM.md too (Netlify + Netlify Database override Vercel/Neon).
1. create-next-app refuses a non-empty folder: run `npx create-next-app@15 _app --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes --skip-install`, then move everything from `_app/` into the repo root (merge .gitignore, keep SPEC.md, ADDENDUM.md, data/, briefs/, ref/, logs/, .netlify/), delete `_app`, then `npm install`.
2. Install: @netlify/database drizzle-orm@beta zod ai @ai-sdk/openai recharts ; dev: drizzle-kit@beta vitest tsx @types/node @netlify/plugin-nextjs.
3. Create `lib/contract.ts` exactly as in SPEC.md "Shared types". Create `db/schema.ts` (Drizzle) exactly per SPEC "Postgres schema", `db/index.ts` (drizzle-orm/netlify-db adapter), `drizzle.config.ts` with out: netlify/database/migrations, `netlify.toml` (build command npm run build, publish .next).
4. Create empty stubs that export the right signatures (throw "not implemented") for: lib/stats/{wilson,cs,decide,slices}.ts, lib/rollout/machine.ts, lib/slices/miner.ts.
5. package.json scripts: dev, build, test (vitest run), db:generate (drizzle-kit generate), gen-seed (tsx scripts/gen-seed.ts).
6. `git init`, .gitignore includes .env*, commit "scaffold".
Acceptance: `npm run build` succeeds; `npx tsc --noEmit` clean.
Owns: everything created in this step. After it finishes, ownership passes to W1-W5 as listed in their briefs.
