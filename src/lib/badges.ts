// Collectible badges. Nothing is stored: what you have earned is worked out from your progress
// (check-ins, neighborhoods, lines, what you ate, how far you went), so rules can change freely and
// every player's shelf is always consistent. The check-in route compares the shelf before and after
// to announce new badges.
import { LINE_COLORS } from "./config";
import { restaurants } from "./data";
import { stopsBetween } from "./stationGraph";
import type { Craving, LineId, Profile } from "./types";

const byId = new Map(restaurants.map((r) => [r.id, r]));

export interface Facts {
  points: number;
  checkins: number;
  unlockedCount: number;
  lines: Set<LineId>;
  /** distinct restaurants eaten at, by craving */
  cravings: Map<Craving, number>;
  independents: number;
  /** the farthest visit from home, in subway stops (0 if no home or no visits) */
  maxStopsFromHome: number;
}

export interface Badge {
  id: string;
  name: string;
  /** how to earn it, shown on locked badges */
  how: string;
  emoji: string;
  color: string;
  earned: (f: Facts) => boolean;
}

const cravingBadge = (id: string, name: string, emoji: string, craving: Craving, how: string, color: string): Badge => ({
  id, name, emoji, how, color, earned: (f) => (f.cravings.get(craving) ?? 0) >= 1,
});
const lineBadge = (line: LineId, name: string, emoji: string): Badge => ({
  id: `line-${line}`, name, emoji, how: `Eat near a ${line[0].toUpperCase()}${line.slice(1)} Line stop.`, color: LINE_COLORS[line],
  earned: (f) => f.lines.has(line),
});

export const BADGES: Badge[] = [
  // Getting started
  { id: "first-stop", name: "First Stop", emoji: "🚉", color: LINE_COLORS.green, how: "Check in for the first time.", earned: (f) => f.checkins >= 1 },
  { id: "regular-rider", name: "Regular Rider", emoji: "🎟️", color: LINE_COLORS.blue, how: "Check in 5 times.", earned: (f) => f.checkins >= 5 },
  { id: "double-digits", name: "Double Digits", emoji: "🔟", color: LINE_COLORS.orange, how: "Check in 10 times.", earned: (f) => f.checkins >= 10 },
  { id: "century", name: "Century Club", emoji: "💯", color: LINE_COLORS.red, how: "Earn 100 points.", earned: (f) => f.points >= 100 },

  // Clearing the fog
  { id: "fog-lifter", name: "Fog Lifter", emoji: "🌤️", color: LINE_COLORS.blue, how: "Unlock your first neighborhood.", earned: (f) => f.unlockedCount >= 1 },
  { id: "fog-clearer", name: "Fog Clearer", emoji: "☀️", color: LINE_COLORS.orange, how: "Unlock 3 neighborhoods.", earned: (f) => f.unlockedCount >= 3 },
  { id: "cartographer", name: "Cartographer", emoji: "🗺️", color: LINE_COLORS.red, how: "Unlock 10 neighborhoods.", earned: (f) => f.unlockedCount >= 10 },

  // Riding the T
  lineBadge("red", "Red Hot Rider", "🌶️"),
  lineBadge("orange", "Orange Crush", "🍊"),
  lineBadge("green", "Green Machine", "🍀"),
  lineBadge("blue", "Blue Wave", "🌊"),
  {
    id: "all-aboard", name: "All Aboard", emoji: "🌈", color: LINE_COLORS.silver,
    how: "Eat near a stop on the Red, Orange, Green and Blue lines.",
    earned: (f) => (["red", "orange", "green", "blue"] as LineId[]).every((l) => f.lines.has(l)),
  },

  // Going far
  { id: "cross-town", name: "Cross-Town Traffic", emoji: "🚦", color: LINE_COLORS.green, how: "Eat 5 or more stops from home.", earned: (f) => f.maxStopsFromHome >= 5 },
  { id: "way-out", name: "Way Out There", emoji: "🚀", color: LINE_COLORS.blue, how: "Eat 10 or more stops from home.", earned: (f) => f.maxStopsFromHome >= 10 },

  // What you ate
  cravingBadge("dumpling", "Dumpling Diplomat", "🥟", "chinese", "Eat at a Chinese spot.", LINE_COLORS.red),
  cravingBadge("slice", "Slice Seeker", "🍕", "pizza", "Eat at a pizza place.", LINE_COLORS.orange),
  cravingBadge("ramen", "Ramen Runner", "🍜", "ramen", "Eat at a ramen or sushi spot.", LINE_COLORS.blue),
  cravingBadge("taco", "Taco Tourist", "🌮", "tacos", "Eat at a taco or Latin spot.", LINE_COLORS.green),
  cravingBadge("sweet", "Sweet Tooth", "🍦", "dessert", "Eat at a dessert or boba spot.", LINE_COLORS.red),
  cravingBadge("coffee", "Caffeine Collector", "☕", "coffee", "Eat at a coffee or bakery spot.", LINE_COLORS.orange),
  { id: "taste-tripper", name: "Taste Tripper", emoji: "🍽️", color: LINE_COLORS.silver, how: "Eat 5 different kinds of food.", earned: (f) => f.cravings.size >= 5 },
  { id: "local-hero", name: "Local Hero", emoji: "🦸", color: LINE_COLORS.green, how: "Eat at 5 independent spots.", earned: (f) => f.independents >= 5 },
];

/** What a player's progress says, boiled down for the rules above. */
export function factsFrom(profile: Profile, homeStationId: string | null): Facts {
  const cravings = new Map<Craving, number>();
  let independents = 0;
  let maxStopsFromHome = 0;
  for (const id of profile.visitedRestaurantIds) {
    const r = byId.get(id);
    if (!r) continue;
    cravings.set(r.craving, (cravings.get(r.craving) ?? 0) + 1);
    if (!r.isChain) independents++;
    const stops = homeStationId ? stopsBetween(homeStationId, r.nearestStopId) : null;
    if (stops !== null && stops > maxStopsFromHome) maxStopsFromHome = stops;
  }
  return {
    points: profile.points,
    checkins: profile.checkins,
    unlockedCount: profile.neighborhoods.filter((n) => n.unlocked).length,
    lines: new Set(profile.quests.filter((q) => q.stops > 0).map((q) => q.line)),
    cravings,
    independents,
    maxStopsFromHome,
  };
}

export const earnedIds = (f: Facts): Set<string> => new Set(BADGES.filter((b) => b.earned(f)).map((b) => b.id));

/** Badges in `after` that were not in `before`. */
export function newBadges(before: Facts, after: Facts): Badge[] {
  const had = earnedIds(before);
  return BADGES.filter((b) => !had.has(b.id) && b.earned(after));
}

/** The slice of a badge the browser needs to show a celebration. */
export const badgeCard = (b: Badge) => ({ id: b.id, name: b.name, emoji: b.emoji, color: b.color });
