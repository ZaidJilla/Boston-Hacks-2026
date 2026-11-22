/** npm run test:scoring: the exploring-pays points rules. */
import assert from "node:assert/strict";
import { HOOD_RANKS, MAYOR, RANKS, depthMultiplier, describeBreakdown, distanceMultiplier, hoodRankFor, hoodTitle, hoodTitleFor, pointsForCheckin, rankFor, rankProgress, scoreCheckin } from "../src/lib/scoring";

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
test("neighborhood ranks: Wanderer at 1, Neighbor at 3, Insider at 6; none at 0", () => {
  assert.equal(hoodRankFor(0), null);
  assert.equal(hoodRankFor(1)?.name, "Wanderer");
  assert.equal(hoodRankFor(2)?.name, "Wanderer");
  assert.equal(hoodRankFor(3)?.name, "Neighbor");
  assert.equal(hoodRankFor(6)?.name, "Insider");
});
test("neighborhood titles use their own names, never the overall ones", () => {
  const overall = new Set<string>(RANKS.map((r) => r.name));
  for (const r of [...HOOD_RANKS, MAYOR]) assert.ok(!overall.has(r.name), r.name);
});
test("Mayor is first place with an unlocked neighborhood; otherwise the spots title", () => {
  assert.equal(hoodTitle(1, 3), "Mayor");
  assert.equal(hoodTitle(1, 2), "Wanderer");
  assert.equal(hoodTitle(2, 7), "Insider");
  assert.equal(hoodTitle(5, 0), "Visitor");
  assert.equal(hoodTitleFor(5, 0), null);
});
test("neighborhood rank is independent of overall rank: a Visitor can be Mayor, a Legend a Wanderer", () => {
  assert.equal(rankFor(20).id, "visitor");
  assert.equal(hoodTitleFor(1, 4)?.id, "mayor");
  assert.equal(rankFor(5000).id, "legend");
  assert.equal(hoodTitleFor(9, 1)?.id, "wanderer");
});
test("overall rank comes from points: 0 Visitor, 150 Regular, 700 Local, 1500 Legend", () => {
  for (const [pts, id] of [[0, "visitor"], [149, "visitor"], [150, "regular"], [699, "regular"], [700, "local"], [1499, "local"], [1500, "legend"], [99999, "legend"]] as const)
    assert.equal(rankFor(pts).id, id, `${pts} points`);
  assert.deepEqual(RANKS.map((r) => r.minPoints), [0, 150, 700, 1500]);
});
test("rank progress: points to the next rank and how far along", () => {
  const p = rankProgress(425);
  assert.equal(p.rank.id, "regular");
  assert.equal(p.next?.id, "local");
  assert.equal(p.pointsToNext, 275);
  assert.ok(Math.abs(p.fraction - 0.5) < 1e-9);
  assert.equal(rankProgress(5000).next, null);
  assert.equal(rankProgress(5000).fraction, 1);
});
test("new spots in a neighborhood you know still pay (the falloff floor is half), so rank keeps climbing", () => {
  let total = 0;
  for (let i = 0; i < 100; i++) total += scoreCheckin({ ...base, spotsInHood: 9 }).total; // 100 spots deep in known places
  assert.equal(total, 100 * 5);
  assert.equal(rankFor(total).id, "regular");
  assert.equal(rankFor(total + 300).id, "local");
});
test("the deeper you are in a neighborhood, the less a visit pays: x1, x0.75, x0.5", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 12].map(depthMultiplier), [1, 1, 1, 0.75, 0.75, 0.5, 0.5]);
  const pts = (n: number) => scoreCheckin({ ...base, spotsInHood: n }).distancePoints;
  assert.deepEqual([pts(0), pts(3), pts(6)], [10, 8, 5]);
  assert.ok(pts(0) >= pts(3) && pts(3) >= pts(6));
});
test("depth falloff shows in the breakdown, and old callers (no spotsInHood) are unchanged", () => {
  const b = scoreCheckin({ ...base, isChain: false, stopsFromHome: 12, spotsInHood: 6 });
  assert.equal(b.hoodRank, "Insider");
  assert.equal(b.distancePoints, 10); // 10 x 2 x 0.5
  assert.equal(describeBreakdown(b), "Base 10 × 2 (12 stops from home) × 0.5 (Insider here) + Independent 5 = 15");
  assert.equal(pointsForCheckin(base), 10);
});
// The demo player must stay Mayor of Allston: the seed players never go past 3 spots there, the demo has 6.
(async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  const { ensureMemSeeded } = await import("../src/lib/store");
  const { byNeighborhood } = await import("../src/lib/leaderboard");
  ensureMemSeeded();
  const rows = await byNeighborhood("allston");
  test("the demo player is first in Allston with at least 4 spots, ahead of every seed player", () => {
    assert.equal(rows[0]?.id, "demo-user");
    assert.ok(rows[0].points >= 4);
    assert.ok(rows.length > 1 && rows[0].points > rows[1].points);
  });
  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
})();
