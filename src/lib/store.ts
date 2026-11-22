// Server only. One GameStore interface, two backends:
//   - pgStore:  Tiger Data (Postgres + TimescaleDB), used when DATABASE_URL is set.
//   - memStore: in-memory fallback for demo mode. Resets on server restart.
// The check-in route only talks to getStore(), never to a backend directly.
import neighborhoodsJson from "../../data/neighborhoods.json";
import { DEFAULT_ORIGIN, DEMO_MODE, LINE_COLORS } from "./config";
import { getStation, lines as allLines } from "./data";
import { getPool, withTransaction } from "./db";
import { distanceKm } from "./geo";
import { LINE_QUEST_STOPS, UNLOCK_THRESHOLD, co2SavedKg, isUnlocked, scoreCheckin, type PointsBreakdown } from "./scoring";
import { buildSeedPlayers } from "./seedData";
import type { CheckinDoc, LeaderboardRow, LineId, Profile, Restaurant, UserDoc } from "./types";

// ---------- Contract ----------

export interface StoreUser {
  uid: string;
  displayName: string;
  email: string;
  college: string;
}

export interface RecordCheckinInput {
  user: StoreUser;
  restaurant: Restaurant;
  /** Subway lines serving restaurant.nearestStopId (for line quests). */
  lines: LineId[];
  /** Where the user actually stood (restaurant coords when simulated). */
  lat: number;
  lng: number;
  co2SavedKg: number;
  /** How far this place is from the player's home, for the distance multiplier. Default: unknown. */
  distance?: { stopsFromHome: number | null; inHomeNeighborhood: boolean };
  /** Defaults to now. The seed script backdates check-ins to build history. */
  createdAt?: Date;
}

export type RecordCheckinOutcome =
  | {
      ok: true;
      checkinId: string;
      pointsEarned: number;
      /** Every line of how pointsEarned was made. */
      breakdown: PointsBreakdown;
      totalPoints: number;
      unlockedNeighborhood?: string;
      questCompleted?: LineId;
    }
  | { ok: false; reason: "already_checked_in" };

export interface GameStore {
  /** Everything in one atomic step: first visit, checkin row, unlock, quests, points. */
  recordCheckin(input: RecordCheckinInput): Promise<RecordCheckinOutcome>;
  /** Progress for the profile page. Works for players with no check-ins yet. */
  getProfile(user: StoreUser): Promise<Profile>;
  /** Cheap pre-check so duplicates don't cost a Gemini call. recordCheckin still enforces it. */
  hasVisited(uid: string, restaurantId: string): Promise<boolean>;
}

export function getStore(): GameStore {
  return getPool() ? pgStore : memStore;
}

// ---------- Profile (shared by both backends) ----------

interface ProfileFacts {
  /** Stored name/college, if the player exists. Wins over the request's identity. */
  stored?: { displayName: string; college: string };
  points: number;
  co2SavedKg: number;
  rank: number | null;
  totalPlayers: number;
  hoodCounts: Map<string, number>; // neighborhood -> distinct restaurants
  unlocks: Set<string>; // unlocked neighborhoods
  quests: Map<string, { stops: number; completed: boolean }>; // line -> progress
  visited: string[];
}

const HOOD_NAMES = new Map(
  (neighborhoodsJson as { features: { properties: { id: string; name: string } }[] }).features.map((f) => [
    f.properties.id,
    f.properties.name,
  ]),
);

function buildProfile(user: StoreUser, f: ProfileFacts): Profile {
  const hoodIds = new Set([...HOOD_NAMES.keys(), ...f.hoodCounts.keys()]);
  const neighborhoods = [...hoodIds]
    .map((id) => ({
      id,
      name: HOOD_NAMES.get(id) ?? id,
      visited: Math.min(f.hoodCounts.get(id) ?? 0, UNLOCK_THRESHOLD),
      spots: f.hoodCounts.get(id) ?? 0,
      needed: UNLOCK_THRESHOLD,
      unlocked: f.unlocks.has(id),
    }))
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.visited - a.visited || a.name.localeCompare(b.name));

  const quests = allLines.map((l) => {
    const q = f.quests.get(l.id);
    return {
      line: l.id,
      name: l.name,
      color: LINE_COLORS[l.id],
      stops: Math.min(q?.stops ?? 0, LINE_QUEST_STOPS),
      needed: LINE_QUEST_STOPS,
      completed: q?.completed ?? false,
    };
  });

  return {
    uid: user.uid,
    displayName: f.stored?.displayName ?? user.displayName,
    college: f.stored?.college ?? user.college,
    points: f.points,
    co2SavedKg: f.co2SavedKg,
    checkins: f.visited.length,
    rank: f.rank,
    totalPlayers: f.totalPlayers,
    neighborhoods,
    quests,
    visitedRestaurantIds: [...f.visited].sort(),
  };
}

/** Facts about a restaurant that every check-in needs: its T lines and the CO2 saved getting there. */
export function checkinFacts(r: Restaurant): { lines: LineId[]; co2SavedKg: number } {
  // TODO: measure from the user's real origin (campus or last check-in), not a fixed point.
  const km = distanceKm(DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng, r.lat, r.lng);
  return { lines: getStation(r.nearestStopId)?.lines ?? [], co2SavedKg: co2SavedKg(km, "transit") };
}

// ---------- In-memory backend (demo mode) ----------

type MemCheckin = CheckinDoc & { id: string };
interface MemQuest {
  stopIds: Set<string>;
  completed: boolean;
}

// Bump the version when the shape changes, so a dev hot reload never reuses an old-shaped store.
const g = globalThis as unknown as {
  __storeV2?: {
    users: Map<string, UserDoc>;
    checkins: MemCheckin[];
    quests: Map<string, MemQuest>; // key: `${uid}:${line}`
    nextId: number;
    seeded: boolean;
  };
};
export const mem = (g.__storeV2 ??= {
  users: new Map(),
  checkins: [] as MemCheckin[],
  quests: new Map(),
  nextId: 1,
  seeded: false,
});

/** Replay the seed players through the normal rules once, so demo leaderboards aren't empty. */
export function ensureMemSeeded(): void {
  if (mem.seeded) return;
  mem.seeded = true;
  if (!DEMO_MODE) return; // fake players only ever appear in demo mode
  for (const { user, visits } of buildSeedPlayers()) {
    for (const { restaurant: r, at } of visits) {
      memRecord({ user, restaurant: r, lat: r.lat, lng: r.lng, createdAt: at, ...checkinFacts(r) });
    }
  }
}

export function memLeaderboard(): LeaderboardRow[] {
  ensureMemSeeded();
  return [...mem.users.entries()]
    .map(([id, u]) => ({ id, name: u.displayName, college: u.college, points: u.points }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function memRecord({ user, restaurant: r, lines, lat, lng, co2SavedKg, distance, createdAt }: RecordCheckinInput): RecordCheckinOutcome {
  if (mem.checkins.some((c) => c.uid === user.uid && c.restaurantId === r.id)) {
    return { ok: false, reason: "already_checked_in" };
  }

  const u: UserDoc = mem.users.get(user.uid) ?? {
    displayName: user.displayName,
    email: user.email,
    college: user.college,
    points: 0,
    unlocked: [],
    co2SavedKg: 0,
    createdAt: Date.now(),
  };

  // First visit anywhere in this neighborhood? (Checked before this check-in is added.)
  const newNeighborhood = !mem.checkins.some((c) => c.uid === user.uid && c.neighborhood === r.neighborhood);
  // Spots already eaten in this neighborhood, before this one: the deeper you are, the less a visit pays.
  const spotsInHood = new Set(
    mem.checkins.filter((c) => c.uid === user.uid && c.neighborhood === r.neighborhood).map((c) => c.restaurantId),
  ).size;

  const checkinId = String(mem.nextId++);
  mem.checkins.push({
    id: checkinId,
    uid: user.uid,
    restaurantId: r.id,
    neighborhood: r.neighborhood,
    nearestStopId: r.nearestStopId,
    lat,
    lng,
    verified: true,
    createdAt: (createdAt ?? new Date()).getTime(),
  });

  // Unlock: 3 distinct restaurants in this neighborhood.
  const distinct = new Set(
    mem.checkins.filter((c) => c.uid === user.uid && c.neighborhood === r.neighborhood).map((c) => c.restaurantId),
  ).size;
  const newlyUnlocked = isUnlocked(distinct) && !u.unlocked.includes(r.neighborhood);
  if (newlyUnlocked) u.unlocked.push(r.neighborhood);

  // Line quests: add this stop to every line that serves it.
  let questCompleted: LineId | undefined;
  let newLine = false;
  for (const line of lines) {
    const key = `${user.uid}:${line}`;
    if (!mem.quests.has(key)) newLine = true; // a line this player has never visited
    const q = mem.quests.get(key) ?? { stopIds: new Set<string>(), completed: false };
    q.stopIds.add(r.nearestStopId);
    if (!q.completed && q.stopIds.size >= LINE_QUEST_STOPS) {
      q.completed = true;
      questCompleted ??= line; // one quest bonus per check-in
    }
    mem.quests.set(key, q);
  }

  const breakdown = scoreCheckin({
    isChain: r.isChain,
    unlockedNeighborhood: newlyUnlocked,
    questCompleted: Boolean(questCompleted),
    stopsFromHome: distance?.stopsFromHome ?? null,
    inHomeNeighborhood: distance?.inHomeNeighborhood ?? false,
    newNeighborhood,
    newLine,
    spotsInHood,
  });
  const pointsEarned = breakdown.total;
  u.points += pointsEarned;
  u.co2SavedKg = Math.round((u.co2SavedKg + co2SavedKg) * 100) / 100;
  mem.users.set(user.uid, u);

  return {
    ok: true,
    checkinId,
    pointsEarned,
    breakdown,
    totalPoints: u.points,
    unlockedNeighborhood: newlyUnlocked ? r.neighborhood : undefined,
    questCompleted,
  };
}

const memStore: GameStore = {
  async recordCheckin(input) {
    ensureMemSeeded();
    return memRecord(input);
  },

  async hasVisited(uid, restaurantId) {
    ensureMemSeeded();
    return mem.checkins.some((c) => c.uid === uid && c.restaurantId === restaurantId);
  },

  async getProfile(user) {
    ensureMemSeeded();
    const u = mem.users.get(user.uid);
    const board = memLeaderboard();
    const mine = mem.checkins.filter((c) => c.uid === user.uid && c.verified);

    const perHood = new Map<string, Set<string>>();
    for (const c of mine) perHood.set(c.neighborhood, (perHood.get(c.neighborhood) ?? new Set()).add(c.restaurantId));

    const quests = new Map<string, { stops: number; completed: boolean }>();
    for (const [key, q] of mem.quests) {
      const [uid, line] = key.split(":");
      if (uid === user.uid) quests.set(line, { stops: q.stopIds.size, completed: q.completed });
    }

    return buildProfile(user, {
      stored: u && { displayName: u.displayName, college: u.college },
      points: u?.points ?? 0,
      co2SavedKg: u?.co2SavedKg ?? 0,
      rank: u ? board.findIndex((r) => r.id === user.uid) + 1 : null,
      totalPlayers: board.length,
      hoodCounts: new Map([...perHood].map(([h, rs]) => [h, rs.size])),
      unlocks: new Set<string>(u?.unlocked ?? []),
      quests,
      visited: [...new Set(mine.map((c) => c.restaurantId))],
    });
  },
};

// ---------- Tiger Data backend ----------

const pgStore: GameStore = {
  async recordCheckin({ user, restaurant: r, lines, lat, lng, co2SavedKg, distance, createdAt }) {
    const at = createdAt ?? new Date();

    return withTransaction(async (db): Promise<RecordCheckinOutcome> => {
      // 1. Upsert the player. ON CONFLICT DO UPDATE also row-locks them, which serializes
      //    concurrent check-ins by the same player (so two at once can't both miss an unlock).
      await db.query(
        `INSERT INTO users (uid, display_name, email, college) VALUES ($1, $2, $3, $4)
         ON CONFLICT (uid) DO UPDATE
           SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, college = EXCLUDED.college`,
        [user.uid, user.displayName, user.email, user.college],
      );

      // 2. Claim the first visit. The primary key makes "one check-in per restaurant" a DB rule.
      const first = await db.query(
        `INSERT INTO first_visits (uid, restaurant_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING 1`,
        [user.uid, r.id],
      );
      if (first.rowCount === 0) return { ok: false, reason: "already_checked_in" };

      // 3. Append to the hypertable.
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO checkins (uid, restaurant_id, neighborhood, nearest_stop_id, lat, lng, verified, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7) RETURNING id`,
        [user.uid, r.id, r.neighborhood, r.nearestStopId, lat, lng, at],
      );
      const checkinId = String(inserted.rows[0].id);

      // 4. Unlock: distinct verified restaurants in this neighborhood.
      const count = await db.query<{ n: number }>(
        `SELECT COUNT(DISTINCT restaurant_id)::int AS n FROM checkins
         WHERE uid = $1 AND neighborhood = $2 AND verified`,
        [user.uid, r.neighborhood],
      );
      // This check-in is already in the count, so n === 1 means it was the first visit in the neighborhood.
      const newNeighborhood = count.rows[0].n === 1;
      let newlyUnlocked = false;
      if (isUnlocked(count.rows[0].n)) {
        const unlock = await db.query(
          `INSERT INTO unlocks (uid, neighborhood, created_at) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING RETURNING 1`,
          [user.uid, r.neighborhood, at],
        );
        newlyUnlocked = unlock.rowCount === 1;
      }

      // 5. Line quests: add this stop to each line's set; complete at LINE_QUEST_STOPS.
      let questCompleted: LineId | undefined;
      let newLine = false;
      for (const line of lines) {
        const q = await db.query<{ n: number; completed: boolean; fresh: boolean }>(
          `INSERT INTO quests (uid, line, stop_ids) VALUES ($1, $2, ARRAY[$3]::text[])
           ON CONFLICT (uid, line) DO UPDATE
             SET stop_ids = ARRAY(SELECT DISTINCT unnest(quests.stop_ids || EXCLUDED.stop_ids))
           RETURNING cardinality(stop_ids) AS n, completed, (xmax = 0) AS fresh`, // fresh = a new row = a line never visited
          [user.uid, line, r.nearestStopId],
        );
        const { n, completed, fresh } = q.rows[0];
        if (fresh) newLine = true;
        if (!completed && n >= LINE_QUEST_STOPS) {
          await db.query(`UPDATE quests SET completed = true WHERE uid = $1 AND line = $2`, [user.uid, line]);
          questCompleted ??= line; // one quest bonus per check-in
        }
      }

      // 6. Points and CO2.
      const breakdown = scoreCheckin({
        isChain: r.isChain,
        unlockedNeighborhood: newlyUnlocked,
        questCompleted: Boolean(questCompleted),
        stopsFromHome: distance?.stopsFromHome ?? null,
        inHomeNeighborhood: distance?.inHomeNeighborhood ?? false,
        newNeighborhood,
        newLine,
        spotsInHood: count.rows[0].n - 1, // this check-in is already counted
      });
      const pointsEarned = breakdown.total;
      const updated = await db.query<{ points: number }>(
        `UPDATE users SET points = points + $2, co2_saved_kg = co2_saved_kg + $3
         WHERE uid = $1 RETURNING points`,
        [user.uid, pointsEarned, co2SavedKg],
      );

      return {
        ok: true,
        checkinId,
        pointsEarned,
        breakdown,
        totalPoints: updated.rows[0].points,
        unlockedNeighborhood: newlyUnlocked ? r.neighborhood : undefined,
        questCompleted,
      };
    });
  },

  async hasVisited(uid, restaurantId) {
    const r = await getPool()!.query(`SELECT 1 FROM first_visits WHERE uid = $1 AND restaurant_id = $2`, [
      uid,
      restaurantId,
    ]);
    return (r.rowCount ?? 0) > 0;
  },

  async getProfile(user) {
    const pool = getPool()!;
    const uid = [user.uid];
    const [me, total, hoods, unlocks, quests, visits] = await Promise.all([
      pool.query<{ display_name: string; college: string; points: number; co2: number; rank: number }>(
        `SELECT display_name, college, points, co2_saved_kg::float AS co2,
                (SELECT count(*)::int + 1 FROM users o  -- same order as the citywide leaderboard
                  WHERE o.points > u.points OR (o.points = u.points AND o.display_name < u.display_name)) AS rank
           FROM users u WHERE uid = $1`,
        uid,
      ),
      pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`),
      pool.query<{ neighborhood: string; n: number }>(
        `SELECT neighborhood, count(DISTINCT restaurant_id)::int AS n
           FROM checkins WHERE uid = $1 AND verified GROUP BY neighborhood`,
        uid,
      ),
      pool.query<{ neighborhood: string }>(
        `SELECT neighborhood FROM unlocks WHERE uid = $1`,
        uid,
      ),
      pool.query<{ line: string; n: number; completed: boolean }>(
        `SELECT line, cardinality(stop_ids)::int AS n, completed FROM quests WHERE uid = $1`,
        uid,
      ),
      pool.query<{ restaurant_id: string }>(`SELECT restaurant_id FROM first_visits WHERE uid = $1`, uid),
    ]);

    const row = me.rows[0];
    return buildProfile(user, {
      stored: row && { displayName: row.display_name, college: row.college },
      points: row?.points ?? 0,
      co2SavedKg: row?.co2 ?? 0,
      rank: row ? row.rank : null,
      totalPlayers: total.rows[0].n,
      hoodCounts: new Map(hoods.rows.map((r) => [r.neighborhood, r.n])),
      unlocks: new Set(unlocks.rows.map((r) => r.neighborhood)),
      quests: new Map(quests.rows.map((r) => [r.line, { stops: r.n, completed: r.completed }])),
      visited: visits.rows.map((r) => r.restaurant_id),
    });
  },
};
