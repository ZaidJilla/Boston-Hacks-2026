// Server only. One GameStore interface, two backends:
//   - pgStore:  Tiger Data (Postgres + TimescaleDB), used when DATABASE_URL is set.
//   - memStore: in-memory fallback for demo mode. Resets on server restart.
// The check-in route only talks to getStore(), never to a backend directly.
import { getPool, withTransaction } from "./db";
import { LINE_QUEST_STOPS, isUnlocked, pointsForCheckin } from "./scoring";
import type { CheckinDoc, LeaderboardRow, LineId, Restaurant, UserDoc } from "./types";

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
}

export type RecordCheckinOutcome =
  | {
      ok: true;
      checkinId: string;
      pointsEarned: number;
      totalPoints: number;
      unlockedNeighborhood?: string;
      questCompleted?: LineId;
    }
  | { ok: false; reason: "already_checked_in" };

export interface GameStore {
  /** Everything in one atomic step: first visit, checkin row, unlock, quests, points. */
  recordCheckin(input: RecordCheckinInput): Promise<RecordCheckinOutcome>;
  /** Called after commit, once Solana returns. Must never fail the request. */
  attachTxSignature(checkinId: string, txSignature: string): Promise<void>;
  attachBadgeMint(uid: string, neighborhood: string, badgeMint: string): Promise<void>;
}

export function getStore(): GameStore {
  return getPool() ? pgStore : memStore;
}

// ---------- In-memory backend (demo mode) ----------

type MemCheckin = CheckinDoc & { id: string };
interface MemQuest {
  stopIds: Set<string>;
  completed: boolean;
}

const g = globalThis as unknown as {
  __store?: {
    users: Map<string, UserDoc>;
    checkins: MemCheckin[];
    quests: Map<string, MemQuest>; // key: `${uid}:${line}`
    badges: Map<string, string>; // key: `${uid}:${neighborhood}` -> mint
    nextId: number;
  };
};
export const mem = (g.__store ??= {
  users: new Map(),
  checkins: [] as MemCheckin[],
  quests: new Map(),
  badges: new Map(),
  nextId: 1,
});

export function memLeaderboard(): LeaderboardRow[] {
  return [...mem.users.entries()]
    .map(([id, u]) => ({ id, name: u.displayName, college: u.college, points: u.points }))
    .sort((a, b) => b.points - a.points);
}

const memStore: GameStore = {
  async recordCheckin({ user, restaurant: r, lines, lat, lng, co2SavedKg }) {
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
      createdAt: Date.now(),
    });

    // Unlock: 3 distinct restaurants in this neighborhood.
    const distinct = new Set(
      mem.checkins
        .filter((c) => c.uid === user.uid && c.neighborhood === r.neighborhood)
        .map((c) => c.restaurantId),
    ).size;
    const newlyUnlocked = isUnlocked(distinct) && !u.unlocked.includes(r.neighborhood);
    if (newlyUnlocked) u.unlocked.push(r.neighborhood);

    // Line quests: add this stop to every line that serves it.
    let questCompleted: LineId | undefined;
    for (const line of lines) {
      const key = `${user.uid}:${line}`;
      const q = mem.quests.get(key) ?? { stopIds: new Set<string>(), completed: false };
      q.stopIds.add(r.nearestStopId);
      if (!q.completed && q.stopIds.size >= LINE_QUEST_STOPS) {
        q.completed = true;
        questCompleted ??= line; // one quest bonus per check-in
      }
      mem.quests.set(key, q);
    }

    const pointsEarned = pointsForCheckin({
      isChain: r.isChain,
      unlockedNeighborhood: newlyUnlocked,
      questCompleted: Boolean(questCompleted),
    });
    u.points += pointsEarned;
    u.co2SavedKg = Math.round((u.co2SavedKg + co2SavedKg) * 100) / 100;
    mem.users.set(user.uid, u);

    return {
      ok: true,
      checkinId,
      pointsEarned,
      totalPoints: u.points,
      unlockedNeighborhood: newlyUnlocked ? r.neighborhood : undefined,
      questCompleted,
    };
  },

  async attachTxSignature(checkinId, txSignature) {
    const c = mem.checkins.find((x) => x.id === checkinId);
    if (c) c.txSignature = txSignature;
  },

  async attachBadgeMint(uid, neighborhood, badgeMint) {
    mem.badges.set(`${uid}:${neighborhood}`, badgeMint);
  },
};

// ---------- Tiger Data backend ----------

const pgStore: GameStore = {
  async recordCheckin(input) {
    return withTransaction(async (_db) => {
      // TODO(Raed): implement against db/schema.sql. Use `_db.query(sql, params)` for every
      // statement so they share the transaction. Rename `_db` to `db` once you use it.
      //
      // 1. Upsert the user (checkins/first_visits have FKs to users):
      //      INSERT INTO users (uid, display_name, email, college) VALUES ($1,$2,$3,$4)
      //      ON CONFLICT (uid) DO UPDATE SET display_name = EXCLUDED.display_name
      //
      // 2. Claim the first visit. 0 rows back = already checked in -> return { ok:false }:
      //      INSERT INTO first_visits (uid, restaurant_id) VALUES ($1,$2)
      //      ON CONFLICT DO NOTHING RETURNING 1
      //
      // 3. Insert the check-in into the hypertable:
      //      INSERT INTO checkins (uid, restaurant_id, neighborhood, nearest_stop_id, lat, lng, verified)
      //      VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id
      //
      // 4. Unlock check:
      //      SELECT COUNT(DISTINCT restaurant_id)::int AS n FROM checkins
      //      WHERE uid = $1 AND neighborhood = $2 AND verified
      //    If isUnlocked(n):
      //      INSERT INTO unlocks (uid, neighborhood) VALUES ($1,$2)
      //      ON CONFLICT DO NOTHING RETURNING 1      -- a row back = newly unlocked
      //
      // 5. Line quests, for each line in input.lines:
      //      INSERT INTO quests (uid, line, stop_ids) VALUES ($1,$2,ARRAY[$3])
      //      ON CONFLICT (uid, line) DO UPDATE
      //        SET stop_ids = ARRAY(SELECT DISTINCT unnest(quests.stop_ids || EXCLUDED.stop_ids))
      //      RETURNING cardinality(stop_ids) AS n, completed
      //    If n >= LINE_QUEST_STOPS and !completed: UPDATE quests SET completed = true ...
      //
      // 6. Points via pointsForCheckin(...), then:
      //      UPDATE users SET points = points + $2, co2_saved_kg = co2_saved_kg + $3
      //      WHERE uid = $1 RETURNING points
      //
      // 7. Return the same shape as memStore.recordCheckin.
      void input;
      throw new Error("TODO(Raed): pgStore.recordCheckin not implemented yet");
    });
  },

  async attachTxSignature(_checkinId, _txSignature) {
    // TODO(Raed): UPDATE checkins SET tx_signature = $2 WHERE id = $1
  },

  async attachBadgeMint(_uid, _neighborhood, _badgeMint) {
    // TODO(Raed): UPDATE unlocks SET badge_mint = $3 WHERE uid = $1 AND neighborhood = $2
  },
};
