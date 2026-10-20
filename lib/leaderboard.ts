import type { LeaderboardResponse } from "./api-types";
import { sessions } from "./data";
import { bradleyTerry } from "./stats/bradleyTerry";

let cached: LeaderboardResponse | undefined;
/** G3: Bradley-Terry over every session with >= 2 arms (ties = half win), 200 seeded bootstrap resamples. Cached per instance. */
export function leaderboard(): LeaderboardResponse {
  cached ??= bradleyTerry(sessions().map(s => ({ arms: Object.values(s.policies).map(a => ({ name: a.name, progress: a.progress })) })),
    { resamples: 200, seed: 7, minComparisons: 30 });
  return cached;
}
