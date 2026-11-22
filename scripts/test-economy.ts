/** npm run test:economy: the store applies the exploring-pays rules (new neighborhood, new line, distance). */
import assert from "node:assert/strict";
import { restaurants } from "../src/lib/data";
import { checkinFacts, getStore } from "../src/lib/store";

const store = getStore();
const user = { uid: "economy-test", displayName: "Economy Test", email: "", college: "Northeastern" };
let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
};

async function main() {
  console.log("economy");
  // Two independent restaurants in one neighborhood, on the same line.
  const hood = restaurants.filter((r) => !r.isChain).reduce<Record<string, typeof restaurants>>((m, r) => ((m[r.neighborhood] ??= []).push(r), m), {});
  const [a, b] = Object.values(hood).find((list) => list.length >= 2) ?? [];
  assert.ok(a && b, "need two restaurants in a neighborhood");
  const rec = (r: typeof a, distance?: { stopsFromHome: number | null; inHomeNeighborhood: boolean }) => {
    const { lines, co2SavedKg } = checkinFacts(r);
    return store.recordCheckin({ user, restaurant: r, lines, lat: r.lat, lng: r.lng, co2SavedKg, distance });
  };

  await test("first visit anywhere: new neighborhood and new line bonuses, distance multiplier applied", async () => {
    const out = await rec(a, { stopsFromHome: 12, inHomeNeighborhood: false });
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.breakdown.multiplier, 2);
    assert.equal(out.breakdown.distancePoints, 20);
    assert.equal(out.breakdown.newNeighborhood, 50);
    assert.ok(out.breakdown.newLine === 25, "first visit to a line should be a new line");
    assert.equal(out.pointsEarned, out.breakdown.total);
  });
  await test("second visit in the same neighborhood: no new-neighborhood bonus, and a line already visited isn't new", async () => {
    const out = await rec(b, { stopsFromHome: 12, inHomeNeighborhood: false });
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.breakdown.newNeighborhood, 0);
    assert.equal(out.breakdown.newLine, 0);
    assert.equal(out.breakdown.distancePoints, 20);
  });
  await test("no distance info scores like before", async () => {
    const other = restaurants.find((r) => r.neighborhood !== a.neighborhood && !r.isChain)!;
    const out = await rec(other);
    assert.ok(out.ok);
    if (!out.ok) return;
    assert.equal(out.breakdown.multiplier, 1);
    assert.equal(out.breakdown.distancePoints, 10);
  });
  await test("the same restaurant can't be counted twice", async () => {
    const again = await rec(a);
    assert.equal(again.ok, false);
  });
  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
}
main();
