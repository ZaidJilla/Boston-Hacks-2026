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

// ---- Home base ----

/** Meteorological seasons, labeled by the year they start in (Jan 2027 is "2026-winter"). */
export function seasonOf(d: Date = new Date()): string {
  const m = d.getMonth(); // 0 = Jan
  const y = d.getFullYear();
  if (m === 11) return `${y}-winter`;
  if (m <= 1) return `${y - 1}-winter`;
  if (m <= 4) return `${y}-spring`;
  if (m <= 7) return `${y}-summer`;
  return `${y}-fall`;
}

/** Setting a first home is free. After that, one change per season. */
export function canChangeHome(lastChangeSeason: string | undefined, now: Date = new Date()): boolean {
  return lastChangeSeason !== seasonOf(now);
}

// ---- Spend your slack: deadline-aware adventure cards ----

/** Minutes held back so a small delay never makes the rider late. */
export const SLACK_BUFFER_MIN = 5;

export type CardKind =
  | "early-exit" // get off a few stops early, walk the rest
  | "end-of-line" // ride to the terminus and back
  | "new-line" // transfer onto a line the rider hasn't used
  | "fog" // detour into a fogged neighborhood
  | "bite" // food stop, filtered by craving and budget
  | "chain"; // two stops, one detour

export type RiskLevel = "safe" | "tight" | "risky";

/** Spare minutes left after the detour decides the risk label. */
export const RISK_SPARE_MIN = { safe: 10, tight: 4 } as const;

export const RISK_MULTIPLIER: Record<RiskLevel, number> = {
  safe: 1,
  tight: 1.5,
  risky: 2,
};

/** Base points by card kind. Food is worth no more than riding. */
export const CARD_POINTS: Record<CardKind, number> = {
  "early-exit": 15,
  "end-of-line": 30,
  "new-line": 20,
  fog: 20,
  bite: 10,
  chain: 35,
};

export const RIDE_POINTS = {
  perTransitLeg: 3,
  perWalkKm: 5,
  onTimeBonus: 20,
} as const;

export function slackMin(directEtaMin: number, minutesToDeadline: number): number {
  return Math.floor(minutesToDeadline - directEtaMin - SLACK_BUFFER_MIN);
}

/** A detour fits if its added time stays within slack. */
export function detourFits(addedMin: number, slack: number): boolean {
  return addedMin <= slack;
}

export function riskFor(addedMin: number, slack: number): RiskLevel {
  const spare = slack - addedMin;
  if (spare >= RISK_SPARE_MIN.safe) return "safe";
  if (spare >= RISK_SPARE_MIN.tight) return "tight";
  return "risky";
}

export interface AdventureScoreInput {
  kind: CardKind;
  risk: RiskLevel;
  transitLegs: number;
  walkKm: number;
  arrivedOnTime: boolean;
}

/** Risk only pays out if the rider gets there on time. */
export function pointsForAdventure(i: AdventureScoreInput): number {
  if (!i.arrivedOnTime) return Math.round(CARD_POINTS[i.kind] / 2);
  const base = CARD_POINTS[i.kind] * RISK_MULTIPLIER[i.risk];
  const ride = i.transitLegs * RIDE_POINTS.perTransitLeg + i.walkKm * RIDE_POINTS.perWalkKm;
  return Math.round(base + ride + RIDE_POINTS.onTimeBonus);
}

export function isUnlocked(distinctRestaurantsInHood: number): boolean {
  return distinctRestaurantsInHood >= UNLOCK_THRESHOLD;
}
