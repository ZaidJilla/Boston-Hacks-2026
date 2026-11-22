/** npm run test:scoring: the exploring-pays points rules. */
import assert from "node:assert/strict";
import { describeBreakdown, distanceMultiplier, pointsForCheckin, scoreCheckin } from "../src/lib/scoring";

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
const base = { isChain: true, unlockedNeighborhood: false, questCompleted: false };

console.log("scoring");
test("distance tiers: 1-4 stops 1x, 5-9 1.5x, 10+ 2x", () => {
  for (const [stops, m] of [[0, 1], [1, 1], [4, 1], [5, 1.5], [9, 1.5], [10, 2], [25, 2]] as const)
    assert.equal(distanceMultiplier(stops, false), m, `${stops} stops`);
});
test("home neighborhood is 0.5x whatever the distance", () => {
  assert.equal(distanceMultiplier(0, true), 0.5);
  assert.equal(distanceMultiplier(12, true), 0.5);
});
test("unknown distance (no home, Silver Line only) is 1x", () => assert.equal(distanceMultiplier(null, false), 1));
test("the spec example: base 10 x 2 + new neighborhood 50 + new line 25 = 95 for an independent far away is 100", () => {
  const far = scoreCheckin({ ...base, isChain: false, stopsFromHome: 12, newNeighborhood: true, newLine: true });
  assert.equal(far.total, 20 + 5 + 50 + 25);
  const chain = scoreCheckin({ ...base, isChain: true, stopsFromHome: 12, newNeighborhood: true, newLine: true });
  assert.equal(chain.total, 95);
  assert.equal(describeBreakdown(chain), "Base 10 × 2 (12 stops from home) + New neighborhood 50 + New line 25 = 95");
});
test("home neighborhood check-in: half base", () => {
  const b = scoreCheckin({ ...base, stopsFromHome: 0, inHomeNeighborhood: true });
  assert.equal(b.distancePoints, 5);
  assert.equal(b.total, 5);
});
test("old callers (no distance info) score exactly as before", () => {
  assert.equal(pointsForCheckin({ isChain: false, unlockedNeighborhood: true, questCompleted: true }), 10 + 5 + 50 + 25);
  assert.equal(pointsForCheckin(base), 10);
});
test("the total is always the sum of the lines", () => {
  for (const stops of [null, 0, 3, 7, 14])
    for (const flags of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      const b = scoreCheckin({
        isChain: Boolean(flags & 1), unlockedNeighborhood: Boolean(flags & 2), questCompleted: Boolean(flags & 4),
        newNeighborhood: Boolean(flags & 8), newLine: Boolean(flags & 8), stopsFromHome: stops, inHomeNeighborhood: stops === 0,
      });
      assert.equal(b.total, b.distancePoints + b.independent + b.newNeighborhood + b.newLine + b.unlock + b.lineQuest);
    }
});
test("a far check-in always beats a home check-in", () => {
  assert.ok(scoreCheckin({ ...base, stopsFromHome: 12 }).total > scoreCheckin({ ...base, stopsFromHome: 0, inHomeNeighborhood: true }).total);
});
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
