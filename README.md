# PolicyCanary

Release gate for robot AI policies, using real RoboArena evaluation sessions (MIT licence).

This is the W0 scaffold: Next.js 15 App Router, strict TypeScript, Tailwind, Drizzle, and Netlify Database. Statistics, rollout transitions, and Slice Miner exports are typed stubs that throw `not implemented` until their owning workers implement them.

## Development

- `npm run dev`: start Next.js.
- `npx netlify-cli@latest dev`: run with the local Netlify Database environment.
- `npm run build`: production build.
- `npx tsc --noEmit`: TypeScript check.
- `npm test`: run Vitest tests once workers add them.
- `npm run db:generate`: generate migrations in `netlify/database/migrations`.
- `npm run gen-seed`: run `scripts/gen-seed.ts` once W1 supplies it.

Netlify provides the database connection automatically; no `DATABASE_URL` is required. Keep credentials out of source control.

## Worker handoff

`SPEC.md` is the shared contract; `ADDENDUM.md` overrides it for Netlify and the additional product features. Worker ownership is listed in `briefs/` and the addendum. `lib/contract.ts` matches the shared types and must remain unchanged.

W2 exports `wilson`, `bettingCs`, `decide`, `runGate` (from `lib/stats/decide.ts`), and `testSlices`. W3 implements `transition` and `IllegalTransition` in `lib/rollout/machine.ts`. W5 implements `mineSlices` in `lib/slices/miner.ts`. The schema reserves a final `// W3 tables` block for W3's additions.
