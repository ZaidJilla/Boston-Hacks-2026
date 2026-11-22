// Source of truth for game rules. No numbers hardcoded elsewhere.

/** A check-in counts if you are this close, or you scan a receipt from today (not everyone gets one). */
export const CHECKIN_RADIUS_M = 50;
export const UNLOCK_THRESHOLD = 3;

export const POINTS = {
  /** Base points for a visit, before the distance multiplier. */
  checkin: 10,
  /** The check-in that makes 3 distinct places in a neighborhood. */
  unlock: 50,
  independent: 5,
  lineQuest: 25,
  /** Your first visit anywhere in a neighborhood. */
  newNeighborhood: 50,
  /** First visit to a place whose nearest station is on a line you have never visited. */
  newLine: 25,
} as const;

// ---- Exploring pays: the farther from home, the more a visit is worth ----

/** Visits in your own neighborhood are worth half: the game is about going somewhere new. */
export const HOME_NEIGHBORHOOD_MULTIPLIER = 0.5;

/** By subway stops from your home station to the place's nearest station. First tier that fits wins. */
export const DISTANCE_TIERS = [
  { maxStops: 4, multiplier: 1, label: "Close to home" },
  { maxStops: 9, multiplier: 1.5, label: "Across town" },
  { maxStops: Infinity, multiplier: 2, label: "Far from home" },
] as const;

export function distanceMultiplier(stopsFromHome: number | null, inHomeNeighborhood: boolean): number {
  if (inHomeNeighborhood) return HOME_NEIGHBORHOOD_MULTIPLIER;
  if (stopsFromHome === null) return 1; // no home set, or no subway station to measure from
  return DISTANCE_TIERS.find((t) => stopsFromHome <= t.maxStops)!.multiplier;
}

export const LINE_QUEST_STOPS = 5;

/** Between midnight and this hour (Boston time), yesterday's receipt still counts. */
export const RECEIPT_GRACE_HOURS = 4;

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
  /** Subway stops from the player's home station to this place's nearest station (null = unknown). */
  stopsFromHome?: number | null;
  inHomeNeighborhood?: boolean;
  newNeighborhood?: boolean;
  newLine?: boolean;
  /** Distinct spots already eaten in this neighborhood before this visit (drives the depth falloff). */
  spotsInHood?: number;
}

/** Everything a check-in earned, line by line, so the UI can show its work. */
export interface PointsBreakdown {
  base: number;
  multiplier: number;
  stopsFromHome: number | null;
  inHomeNeighborhood: boolean;
  /** Falloff for how deep you already are in this neighborhood (1 = none). */
  depthMultiplier: number;
  /** Your title in this neighborhood before this visit, if any. */
  hoodRank: string | null;
  /** base x multiplier x depth, rounded */
  distancePoints: number;
  independent: number;
  newNeighborhood: number;
  newLine: number;
  unlock: number;
  lineQuest: number;
  total: number;
}

export function scoreCheckin(i: PointsInput): PointsBreakdown {
  const stopsFromHome = i.stopsFromHome ?? null;
  const inHomeNeighborhood = Boolean(i.inHomeNeighborhood);
  const multiplier = distanceMultiplier(stopsFromHome, inHomeNeighborhood);
  const spotsInHood = i.spotsInHood ?? 0;
  const depth = depthMultiplier(spotsInHood);
  const distancePoints = Math.round(POINTS.checkin * multiplier * depth);
  const independent = i.isChain ? 0 : POINTS.independent;
  const newNeighborhood = i.newNeighborhood ? POINTS.newNeighborhood : 0;
  const newLine = i.newLine ? POINTS.newLine : 0;
  const unlock = i.unlockedNeighborhood ? POINTS.unlock : 0;
  const lineQuest = i.questCompleted ? POINTS.lineQuest : 0;
  return {
    base: POINTS.checkin, multiplier, stopsFromHome, inHomeNeighborhood, depthMultiplier: depth, hoodRank: hoodRankFor(spotsInHood)?.name ?? null, distancePoints,
    independent, newNeighborhood, newLine, unlock, lineQuest,
    total: distancePoints + independent + newNeighborhood + newLine + unlock + lineQuest,
  };
}

export function pointsForCheckin(i: PointsInput): number {
  return scoreCheckin(i).total;
}

/** "Base 10 x 2 (12 stops from home) + New neighborhood 50 + New line 25 = 95" */
export function describeBreakdown(b: PointsBreakdown): string {
  const parts = [
    b.multiplier === 1
      ? `Base ${b.base}`
      : `Base ${b.base} × ${b.multiplier}${
          b.inHomeNeighborhood ? " (home neighborhood)" : b.stopsFromHome !== null ? ` (${b.stopsFromHome} stops from home)` : ""
        }`,
    b.depthMultiplier !== 1 && `× ${b.depthMultiplier} (${b.hoodRank} here)`,
    b.independent && `Independent ${b.independent}`,
    b.newNeighborhood && `New neighborhood ${b.newNeighborhood}`,
    b.newLine && `New line ${b.newLine}`,
    b.unlock && `Unlock ${b.unlock}`,
    b.lineQuest && `Line quest ${b.lineQuest}`,
  ].filter(Boolean);
  return `${parts.join(" + ").replace(" + ×", " ×")} = ${b.total}`;
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

// ---------- Ranks ----------
// The overall rank comes from total points, so you keep growing even when you go back to places you have
// been (the neighborhood ranks below are the ones about breadth). Lowest first.
// Colors and art live in the UI; only the rules live here.
export const RANKS = [
  { id: "visitor", name: "Visitor", minPoints: 0, blurb: "Fresh off the T. The city is still foggy." },
  { id: "regular", name: "Regular", minPoints: 150, blurb: "You're getting around." },
  { id: "local", name: "Local", minPoints: 700, blurb: "You know the city past your campus." },
  { id: "legend", name: "Legend", minPoints: 1500, blurb: "Most of Boston is yours." },
] as const;

export type Rank = (typeof RANKS)[number];
export type RankId = Rank["id"];

/** The rank a player holds with this many points. */
export function rankFor(points: number): Rank {
  let rank: Rank = RANKS[0];
  for (const r of RANKS) if (points >= r.minPoints) rank = r;
  return rank;
}

export const rankIndex = (id: RankId): number => RANKS.findIndex((r) => r.id === id);

// ---- Neighborhood ranks ----
// A title for each neighborhood, from how many of its spots you have eaten at. The player with the most
// (at least UNLOCK_THRESHOLD, so it has to be a neighborhood they unlocked) is its Mayor.
export const HOOD_RANKS = [
  { id: "newcomer", name: "Newcomer", minSpots: 1 },
  { id: "regular", name: "Regular", minSpots: UNLOCK_THRESHOLD },
  { id: "local", name: "Local", minSpots: 6 },
] as const;

/** The title for this many spots in one neighborhood, or null with none. */
export function hoodRankFor(spots: number): (typeof HOOD_RANKS)[number] | null {
  let rank: (typeof HOOD_RANKS)[number] | null = null;
  for (const r of HOOD_RANKS) if (spots >= r.minSpots) rank = r;
  return rank;
}

/** What to call a player on a neighborhood board: Mayor for first place, else their title there. */
export function hoodTitle(place: number, spots: number): string {
  if (place === 1 && spots >= UNLOCK_THRESHOLD) return "Mayor";
  return hoodRankFor(spots)?.name ?? "Visitor";
}

/**
 * The deeper you are in a neighborhood, the less each more visit there pays toward your points, so the
 * fastest way up is to go somewhere new. Keyed by your title in that neighborhood before this visit.
 */
export const HOOD_DEPTH_MULTIPLIER = { none: 1, newcomer: 1, regular: 0.75, local: 0.5 } as const;

export function depthMultiplier(spotsInHood: number): number {
  const rank = hoodRankFor(spotsInHood);
  return rank ? HOOD_DEPTH_MULTIPLIER[rank.id] : 1;
}

/** Current rank, the next one (if any), and how many more points it takes to get there. */
export function rankProgress(points: number): {
  rank: Rank;
  next: Rank | null;
  pointsToNext: number;
  /** 0 to 1 of the way from this rank to the next (1 at the top) */
  fraction: number;
} {
  const rank = rankFor(points);
  const next = RANKS[rankIndex(rank.id) + 1] ?? null;
  const fraction = next ? Math.min(1, Math.max(0, (points - rank.minPoints) / (next.minPoints - rank.minPoints))) : 1;
  return { rank, next, pointsToNext: next ? next.minPoints - points : 0, fraction };
}
