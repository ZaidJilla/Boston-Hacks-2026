// Server only. Leaderboards are SQL on Tiger Data, with the in-memory store when there's no
// database. Never throws.
import { DEMO_MODE } from "./config";
import { getPool } from "./db";
import { rankFor } from "./scoring";
import { ensureMemSeeded, mem, memLeaderboard } from "./store";
import type { LeaderboardRow } from "./types";

async function withFallback(label: string, sql: () => Promise<LeaderboardRow[]>, memory: () => LeaderboardRow[]) {
  if (!getPool()) return memory();
  try {
    return await sql();
  } catch (err) {
    // In demo mode, keep the stage demo alive with the in-memory board. Outside demo mode,
    // showing invented seed players as if they were real would be worse than an empty board.
    console.error(`leaderboard ${label} failed${DEMO_MODE ? ", using memory" : ""}`, err);
    return DEMO_MODE ? memory() : [];
  }
}

export async function citywide(limit = 50): Promise<LeaderboardRow[]> {
  return withFallback(
    "citywide",
    async () =>
      (
        await getPool()!.query<LeaderboardRow>(
          `SELECT uid AS id, display_name AS name, college, points
             FROM users ORDER BY points DESC, display_name LIMIT $1`,
          [limit],
        )
      ).rows,
    () => memLeaderboard().slice(0, limit),
  );
}

export async function byCollege(college: string, limit = 50): Promise<LeaderboardRow[]> {
  return withFallback(
    "byCollege",
    async () =>
      (
        await getPool()!.query<LeaderboardRow>(
          `SELECT uid AS id, display_name AS name, college, points
             FROM users WHERE college = $1 ORDER BY points DESC, display_name LIMIT $2`,
          [college, limit],
        )
      ).rows,
    () => memLeaderboard().filter((r) => r.college === college).slice(0, limit),
  );
}

/** Colleges ranked by total points (for the College tab header). id = college name. */
export async function collegeStandings(): Promise<LeaderboardRow[]> {
  return withFallback(
    "collegeStandings",
    async () =>
      (
        await getPool()!.query<LeaderboardRow>(
          `SELECT college AS id, college AS name, SUM(points)::int AS points
             FROM users GROUP BY college ORDER BY points DESC`,
        )
      ).rows,
    () => {
      const totals = new Map<string, number>();
      for (const r of memLeaderboard()) totals.set(r.college ?? "Other", (totals.get(r.college ?? "Other") ?? 0) + r.points);
      return [...totals.entries()]
        .map(([c, points]) => ({ id: c, name: c, points }))
        .sort((a, b) => b.points - a.points);
    },
  );
}

/**
 * Ranked by distinct restaurants checked into in this neighborhood (`points` = that count).
 * Reads the `checkins_daily` continuous aggregate. A checkin row is only ever written on a
 * first visit (first_visits PK), so summing daily counts = distinct restaurants.
 */
export async function byNeighborhood(neighborhood: string, limit = 50): Promise<LeaderboardRow[]> {
  return withFallback(
    "byNeighborhood",
    async () => {
      const pool = getPool()!;
      try {
        return (
          await pool.query<LeaderboardRow>(
            `SELECT u.uid AS id, u.display_name AS name, u.college, SUM(d.checkins)::int AS points
               FROM checkins_daily d JOIN users u USING (uid)
              WHERE d.neighborhood = $1
              GROUP BY u.uid, u.display_name, u.college
              ORDER BY points DESC, MAX(d.day), name LIMIT $2`, // ties: whoever got there first
            [neighborhood, limit],
          )
        ).rows;
      } catch {
        // Aggregate not migrated yet: same answer straight from the hypertable.
        return (
          await pool.query<LeaderboardRow>(
            `SELECT u.uid AS id, u.display_name AS name, u.college, COUNT(DISTINCT c.restaurant_id)::int AS points
               FROM checkins c JOIN users u USING (uid)
              WHERE c.neighborhood = $1 AND c.verified
              GROUP BY u.uid, u.display_name, u.college
              ORDER BY points DESC, MAX(c.created_at), name LIMIT $2`,
            [neighborhood, limit],
          )
        ).rows;
      }
    },
    () => {
      ensureMemSeeded();
      const perUser = new Map<string, Set<string>>();
      const lastAt = new Map<string, number>(); // when they reached their current count
      for (const c of mem.checkins) {
        if (c.neighborhood !== neighborhood || !c.verified) continue;
        perUser.set(c.uid, (perUser.get(c.uid) ?? new Set()).add(c.restaurantId));
        lastAt.set(c.uid, Math.max(lastAt.get(c.uid) ?? 0, c.createdAt));
      }
      return [...perUser.entries()]
        .map(([uid, rs]) => {
          const u = mem.users.get(uid);
          return { id: uid, name: u?.displayName ?? "Player", college: u?.college, points: rs.size };
        })
        .sort((a, b) => b.points - a.points || (lastAt.get(a.id) ?? 0) - (lastAt.get(b.id) ?? 0) || a.name.localeCompare(b.name))
        .slice(0, limit);
    },
  );
}

/** Adds each player's overall rank, from their total points (a neighborhood board's own number is spots, not points). */
export async function withRanks(rows: LeaderboardRow[]): Promise<LeaderboardRow[]> {
  if (rows.length === 0) return rows;
  const totals = new Map<string, number>();
  const pool = getPool();
  if (pool) {
    try {
      const res = await pool.query<{ uid: string; points: number }>(`SELECT uid, points FROM users WHERE uid = ANY($1)`, [rows.map((r) => r.id)]);
      for (const r of res.rows) totals.set(r.uid, r.points);
    } catch (err) {
      console.error("leaderboard ranks failed", err); // rows just show without a rank
      return rows;
    }
  } else {
    ensureMemSeeded();
    for (const r of rows) totals.set(r.id, mem.users.get(r.id)?.points ?? 0);
  }
  return rows.map((r) => ({ ...r, rank: rankFor(totals.get(r.id) ?? 0).id }));
}
