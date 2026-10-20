# W4 - Dashboard UI
Read SPEC.md then ADDENDUM.md in the repo root first; together they are the contract (ADDENDUM wins on conflict, incl. the GOLD features you own). Do not edit files you do not own (listed below).
Do not touch package.json or lockfiles (W0 installed everything). If you truly need a dependency, stop and say so in your final message.
TypeScript strict, no `any` on public surfaces. Commit only your own files with `git add <your paths>` and a clear message; never `git add -A`.
Never print or commit secrets. Run your acceptance checks and paste their real output in your final message. If a check fails, fix it before finishing.

Owns: app/page.tsx, app/layout.tsx, app/globals.css, app/rollouts/**, components/**.
Build per SPEC "UI". Quality bar: looks like a real B2B ops tool (dark slate, one accent colour, tabular numbers, no emoji, no lorem).
- Overview: hero line "Release gate for robot AI policies", stat cards (policies, sites, episodes, sessions with notes), policy table, New Rollout form (two selects + mode).
- Rollout page: state badge, stage timeline, Recharts band chart (mean line, L/U area, y=0, y=+/-margin), Replay button that loops POST /replay (batch 25) until terminal or HOLD, decisions table, Slice Miner panel (proposals with rationale; confirmed in green, rejected with reason/p/threshold; "Approve as guardrail" button), override form with validation errors shown, audit log.
- Honest copy: "Replay of real RoboArena evaluation sessions (MIT licence)"; slice panel: "AI saw only the first half of the timeline; results tested on the second half".
- Until W3 routes exist, use the response shapes from SPEC; handle loading/error states.
Acceptance: `npm run build` passes; with dev server + W3 routes, opening /rollouts/<id> for pi0_fast and pressing Replay reaches CANARY and renders the band; paste build output.
