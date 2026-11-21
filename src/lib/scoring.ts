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
