/** npm run test:badges: badge rules and "what is new". */
import assert from "node:assert/strict";
import { BADGES, earnedIds, newBadges, type Facts } from "../src/lib/badges";

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
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
