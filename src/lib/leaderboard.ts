// Server only. Leaderboards from Tiger Data, in-memory fallback in demo mode.
import { getPool } from "./db";
import { memLeaderboard } from "./store";
import type { LeaderboardRow } from "./types";

export async function citywide(limit = 50): Promise<LeaderboardRow[]> {
  const pool = getPool();
  if (!pool) return memLeaderboard().slice(0, limit);
  const { rows } = await pool.query(
    "SELECT uid AS id, display_name AS name, college, points FROM users ORDER BY points DESC LIMIT $1",
    [limit],
  );
  return rows;
}

export async function byCollege(college: string, limit = 50): Promise<LeaderboardRow[]> {
  const pool = getPool();
  if (!pool) return memLeaderboard().filter((r) => r.college === college).slice(0, limit);
  const { rows } = await pool.query(
    "SELECT uid AS id, display_name AS name, college, points FROM users WHERE college = $1 ORDER BY points DESC LIMIT $2",
    [college, limit],
  );
  return rows;
}

/** Ranked by distinct restaurants checked into in this neighborhood. */
export async function byNeighborhood(neighborhood: string, limit = 50): Promise<LeaderboardRow[]> {
  const pool = getPool();
  // TODO(Raed): in-memory path. Filter mem.checkins by neighborhood, count distinct
  // restaurantId per uid, join names from mem.users, sort desc, slice(0, limit).
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT u.uid AS id, u.display_name AS name, u.college, COUNT(DISTINCT c.restaurant_id)::int AS points
       FROM checkins c JOIN users u USING (uid)
      WHERE c.neighborhood = $1 AND c.verified
      GROUP BY u.uid, u.display_name, u.college
      ORDER BY points DESC LIMIT $2`,
    [neighborhood, limit],
  );
  return rows;
}
