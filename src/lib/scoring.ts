// Source of truth for game rules. No numbers hardcoded elsewhere.

export const CHECKIN_RADIUS_M = 75;
export const UNLOCK_THRESHOLD = 3;

export const POINTS = {
  checkin: 10,
  unlock: 50,
  independent: 5,
  lineQuest: 25,
} as const;

export const LINE_QUEST_STOPS = 5;

// kg CO2 per km
export const CO2_PER_KM = {
  rideshare: 0.25,
  transit: 0.05,
  walk: 0,
} as const;

export type TripMode = "transit" | "walk";

export function co2SavedKg(distanceKm: number, mode: TripMode): number {
  const saved = (CO2_PER_KM.rideshare - CO2_PER_KM[mode]) * distanceKm;
  return Math.max(0, Math.round(saved * 100) / 100);
}

export interface PointsInput {
  isChain: boolean;
  unlockedNeighborhood: boolean;
  questCompleted: boolean;
}

export function pointsForCheckin(i: PointsInput): number {
  return (
    POINTS.checkin +
    (i.isChain ? 0 : POINTS.independent) +
    (i.unlockedNeighborhood ? POINTS.unlock : 0) +
    (i.questCompleted ? POINTS.lineQuest : 0)
  );
}

export function isUnlocked(distinctRestaurantsInHood: number): boolean {
  return distinctRestaurantsInHood >= UNLOCK_THRESHOLD;
}

// ---------- Ranks ----------
// Earned by unlocking neighborhoods (exploration, not grinding points). Lowest first.
// Colors and art live in the UI; only the rules live here.
export const RANKS = [
  { id: "visitor", name: "Visitor", minUnlocks: 0, blurb: "Fresh off the T. The city is still foggy." },
  { id: "regular", name: "Regular", minUnlocks: 1, blurb: "You've cleared your first neighborhood." },
  { id: "local", name: "Local", minUnlocks: 4, blurb: "You know the city past your campus." },
  { id: "legend", name: "Legend", minUnlocks: 10, blurb: "Most of Boston is yours." },
] as const;

export type Rank = (typeof RANKS)[number];
export type RankId = Rank["id"];

/** The rank a player holds with this many unlocked neighborhoods. */
export function rankFor(unlockedNeighborhoods: number): Rank {
  let rank: Rank = RANKS[0];
  for (const r of RANKS) if (unlockedNeighborhoods >= r.minUnlocks) rank = r;
  return rank;
}

export const rankIndex = (id: RankId): number => RANKS.findIndex((r) => r.id === id);

/** Current rank, the next one (if any), and how many more unlocks it takes to get there. */
export function rankProgress(unlockedNeighborhoods: number): {
  rank: Rank;
  next: Rank | null;
  unlocksToNext: number;
} {
  const rank = rankFor(unlockedNeighborhoods);
  const next = RANKS[rankIndex(rank.id) + 1] ?? null;
  return { rank, next, unlocksToNext: next ? next.minUnlocks - unlockedNeighborhoods : 0 };
}
