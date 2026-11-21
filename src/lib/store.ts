// Server only. In-memory fallback so demo mode works without Tiger Data (no DATABASE_URL).
// Resets on server restart. Good enough for the demo.
import type { CheckinDoc, LeaderboardRow, UserDoc } from "./types";

const g = globalThis as unknown as {
  __store?: { users: Map<string, UserDoc>; checkins: CheckinDoc[] };
};
export const mem = (g.__store ??= {
  users: new Map<string, UserDoc>(),
  checkins: [] as CheckinDoc[],
});

export function memLeaderboard(): LeaderboardRow[] {
  return [...mem.users.entries()]
    .map(([id, u]) => ({ id, name: u.displayName, college: u.college, points: u.points }))
    .sort((a, b) => b.points - a.points);
}
