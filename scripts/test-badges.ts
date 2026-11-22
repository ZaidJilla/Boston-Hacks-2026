/** npm run test:badges: badge rules and "what is new". */
import assert from "node:assert/strict";
import { BADGES, earnedIds, factsFrom, newBadges, shelfOrder, type Facts } from "../src/lib/badges";
import { restaurants, stations } from "../src/lib/data";
import { stopsBetween } from "../src/lib/stationGraph";
import type { Profile } from "../src/lib/types";

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
};
const none: Facts = { points: 0, checkins: 0, unlockedCount: 0, lines: new Set(), cravings: new Map(), independents: 0, maxStopsFromHome: 0 };

console.log("badges");
test("ids are unique and every badge has a name, hint and emoji", () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  for (const b of BADGES) assert.ok(b.name && b.how && b.emoji, b.id);
});
test("a brand new player has no badges", () => assert.equal(earnedIds(none).size, 0));
test("first check-in earns First Stop only", () => {
  const ids = earnedIds({ ...none, checkins: 1 });
  assert.deepEqual([...ids], ["first-stop"]);
});
test("thresholds: 5 and 10 check-ins, 100 points, 1 and 3 and 10 neighborhoods", () => {
  assert.ok(earnedIds({ ...none, checkins: 5 }).has("regular-rider"));
  assert.ok(!earnedIds({ ...none, checkins: 4 }).has("regular-rider"));
  assert.ok(earnedIds({ ...none, checkins: 10 }).has("double-digits"));
  assert.ok(earnedIds({ ...none, points: 100 }).has("century"));
  assert.ok(!earnedIds({ ...none, points: 99 }).has("century"));
  assert.ok(earnedIds({ ...none, unlockedCount: 1 }).has("fog-lifter"));
  assert.ok(earnedIds({ ...none, unlockedCount: 3 }).has("fog-clearer"));
  assert.ok(!earnedIds({ ...none, unlockedCount: 9 }).has("cartographer"));
  assert.ok(earnedIds({ ...none, unlockedCount: 10 }).has("cartographer"));
});
test("All Aboard needs red, orange, green and blue (silver doesn't count)", () => {
  assert.ok(!earnedIds({ ...none, lines: new Set(["red", "orange", "green", "silver"]) }).has("all-aboard"));
  assert.ok(earnedIds({ ...none, lines: new Set(["red", "orange", "green", "blue"]) }).has("all-aboard"));
});
test("distance badges: 5 and 10 stops from home", () => {
  assert.ok(earnedIds({ ...none, maxStopsFromHome: 5 }).has("cross-town"));
  assert.ok(!earnedIds({ ...none, maxStopsFromHome: 4 }).has("cross-town"));
  assert.ok(earnedIds({ ...none, maxStopsFromHome: 10 }).has("way-out"));
});
test("food badges and Taste Tripper (5 kinds)", () => {
  assert.ok(earnedIds({ ...none, cravings: new Map([["chinese", 1]]) }).has("dumpling"));
  const five = new Map([["chinese", 1], ["pizza", 1], ["ramen", 1], ["tacos", 1], ["dessert", 1]] as const);
  assert.ok(earnedIds({ ...none, cravings: five }).has("taste-tripper"));
  assert.ok(!earnedIds({ ...none, cravings: new Map([["chinese", 4]]) }).has("taste-tripper"));
});
test("newBadges lists only what the check-in added", () => {
  const before: Facts = { ...none, checkins: 4, points: 90 };
  const after: Facts = { ...none, checkins: 5, points: 110, cravings: new Map([["pizza", 1]]) };
  assert.deepEqual(newBadges(before, after).map((b) => b.id).sort(), ["century", "regular-rider", "slice"].sort().concat().filter(Boolean).sort());
});

// Wiring: with real data, every badge can actually be earned, and a real profile earns them.
test("every badge has a description and a valid rarity", () => {
  for (const b of BADGES) assert.ok(b.desc.length > 10 && ["common", "rare", "epic", "legendary"].includes(b.rarity), b.id);
});
test("eating at every restaurant earns every badge (so none is unreachable)", () => {
  const lineIds = ["red", "orange", "green", "blue"] as const;
  // Pick a home station and one restaurant per line so the quest/line facts are realistic.
  const home = stations.find((s) => s.id === restaurants[0].nearestStopId)!.id;
  const visited = restaurants.map((r) => r.id);
  const profile = {
    points: 5000, checkins: visited.length, visitedRestaurantIds: visited,
    neighborhoods: Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, name: `h${i}`, visited: 3, needed: 3, unlocked: true })),
    quests: lineIds.map((l) => ({ line: l, name: l, color: "#000", stops: 5, needed: 5, completed: true })),
  } as unknown as Profile;
  // the farthest home for distance badges
  let best = home, bestMax = 0;
  for (const s of stations) {
    const m = Math.max(...restaurants.map((r) => stopsBetween(s.id, r.nearestStopId) ?? 0));
    if (m > bestMax) { bestMax = m; best = s.id; }
  }
  const missing = BADGES.filter((b) => !b.earned(factsFrom(profile, best))).map((b) => b.id);
  assert.deepEqual(missing, []);
});
test("a quest with no stops does not earn its line badge", () => {
  const p = { points: 0, checkins: 0, visitedRestaurantIds: [], neighborhoods: [], quests: [{ line: "red", name: "Red", color: "#000", stops: 0, needed: 5, completed: false }] } as unknown as Profile;
  assert.equal(earnedIds(factsFrom(p, null)).has("line-red"), false);
});
test("'other' food is not a kind of food for Taste Tripper", () => {
  const others = restaurants.filter((r) => r.craving === "other").slice(0, 6).map((r) => r.id);
  const p = { points: 0, checkins: 6, visitedRestaurantIds: others, neighborhoods: [], quests: [] } as unknown as Profile;
  assert.equal(earnedIds(factsFrom(p, null)).has("taste-tripper"), false);
});
test("shelf shows 3 best first: rarest earned, then easiest locked", () => {
  const f = { ...none, checkins: 10, points: 100, unlockedCount: 10 };
  const { featured, rest } = shelfOrder(f);
  assert.equal(featured.length, 3);
  assert.equal(featured[0].id, "cartographer");
  assert.equal(featured.length + rest.length, BADGES.length);
  const solo = shelfOrder(none).featured;
  assert.ok(solo.every((b) => b.rarity === "common"));
});
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
