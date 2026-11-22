/**
 * npm run test:trip — checks the multi-stop trip engine without a network.
 * fetch is stubbed so the MBTA calls return canned timetable data (or fail), which is how we prove
 * the trip never throws and says when it is estimating.
 */
import assert from "node:assert/strict";
import { planTrip, TripError, validate } from "../src/lib/trip";
import { openStatus } from "../src/lib/openingHours";
import { serviceQuery } from "../src/lib/clock";
import type { TripResult } from "../src/lib/tripTypes";

const P = {
  northeastern: { name: "Northeastern", lat: 42.3398, lng: -71.0892 },
  mfa: { name: "Museum of Fine Arts", lat: 42.3394, lng: -71.094 },
  chinatown: { name: "Chinatown", lat: 42.3515, lng: -71.0627 },
  theater: { name: "Theater District", lat: 42.3503, lng: -71.0663 },
  maldenHome: { name: "Malden Center", lat: 42.4263, lng: -71.0741 },
  fenway: { name: "Fenway Park", lat: 42.3467, lng: -71.0972 },
  harvard: { name: "Harvard Square", lat: 42.3736, lng: -71.119 },
  southStation: { name: "South Station", lat: 42.3519, lng: -71.0552 },
};
// A fixed Saturday afternoon so results don't depend on when the test runs.
const NOW = new Date("2026-11-21T19:00:00Z"); // 2:00 PM Boston
const realFetch = globalThis.fetch;

function stubFetch(mode: "offline" | "timetable") {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (mode === "offline") throw new Error("offline");
    if (url.includes("/schedules")) {
      const q = new URL(url).searchParams;
      // Second request: the same trips at the stop where the rider gets off. Sequence 20 > boarding sequence 10.
      if (q.get("filter[trip]")) {
        // The real API only searches today's service day unless filter[date] is sent, so a leg tomorrow needs it.
        if (!q.get("filter[date]")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
        const ids = q.get("filter[trip]")!.split(",");
        return new Response(JSON.stringify({ data: ids.map((id) => ({ attributes: { stop_sequence: 20 }, relationships: { trip: { data: { id } } } })) }), { status: 200 });
      }
      // First request: first train leaves 7 minutes after whatever time was asked for, then every 6 minutes.
      const [h, m] = q.get("filter[min_time]")!.split(":").map(Number);
      const at = Date.parse(`${q.get("filter[date]")}T00:00:00-05:00`) + (h * 60 + m + 7) * 60_000;
      const trip = (id: string, offsetMin: number) => ({ attributes: { departure_time: new Date(at + offsetMin * 60_000).toISOString(), stop_sequence: 10 }, relationships: { trip: { data: { id } } } });
      return new Response(JSON.stringify({ data: [trip("t1", 0), trip("t2", 6), trip("t3", 12)] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;
}

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
const rejects = async (input: unknown, re: RegExp) => {
  try {
    await planTrip(input, NOW);
  } catch (e) {
    assert.ok(e instanceof TripError, `expected TripError, got ${e}`);
    assert.match((e as Error).message, re);
    return;
  }
  assert.fail("expected the request to be rejected");
};
const mins = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

async function main() {
  console.log("trip engine");

  stubFetch("offline");
  await test("2 stops, offline: still returns a timeline and says it is estimating", async () => {
    const r = await planTrip({ stops: [P.northeastern, P.maldenHome], departAt: NOW.toISOString() }, NOW);
    assert.equal(r.legs.length, 1);
    assert.equal(r.stops.length, 2);
    assert.ok(r.totalMin > 10 && r.totalMin < 90, `odd total ${r.totalMin}`);
    assert.ok(r.warnings.some((w) => w.kind === "estimate"));
  });

  await test("4 stops: clock carries through legs and dwell times", async () => {
    const r = await planTrip({
      stops: [P.northeastern, { ...P.mfa, dwellMin: 90 }, { ...P.chinatown, dwellMin: 60 }, { ...P.theater, dwellMin: 150 }, P.maldenHome],
      departAt: NOW.toISOString(),
    }, NOW);
    assert.equal(r.legs.length, 4);
    r.stops.forEach((s, i) => {
      assert.ok(Date.parse(s.departAt) >= Date.parse(s.arriveAt), `stop ${i} leaves before it arrives`);
      if (i > 0) assert.equal(s.arriveAt, r.legs[i - 1].arriveAt, `stop ${i} arrival != leg arrival`);
      if (i < r.legs.length) assert.equal(r.legs[i].departAt, s.departAt, `leg ${i} departs when stop ${i} ends`);
    });
    assert.equal(r.dwellMin, 90 + 60 + 150);
    assert.equal(r.totalMin, r.travelMin + r.dwellMin);
    for (const leg of r.legs) {
      assert.equal(leg.steps[0].startAt, leg.departAt);
      assert.equal(leg.steps[leg.steps.length - 1].endAt, leg.arriveAt);
    }
  });

  await test("start and end can be the same place (round trip)", async () => {
    const r = await planTrip({ stops: [P.northeastern, { ...P.mfa, dwellMin: 45 }, P.northeastern], departAt: NOW.toISOString() }, NOW);
    assert.equal(r.legs.length, 2);
  });

  await test("two stops a short walk apart become a walking leg", async () => {
    const r = await planTrip({ stops: [P.chinatown, P.theater], departAt: NOW.toISOString() }, NOW);
    assert.equal(r.legs[0].mode, "walk");
    assert.equal(r.legs[0].accuracy, "walk");
  });

  await test("optimize puts a far stop in the efficient place", async () => {
    const stops = [P.northeastern, { ...P.harvard, dwellMin: 30 }, { ...P.mfa, dwellMin: 30 }, { ...P.fenway, dwellMin: 30 }, P.northeastern];
    const asGiven = await planTrip({ stops, departAt: NOW.toISOString() }, NOW);
    const best = await planTrip({ stops, optimize: true, departAt: NOW.toISOString() }, NOW);
    assert.ok(best.totalMin <= asGiven.totalMin, `optimized ${best.totalMin} > given ${asGiven.totalMin}`);
    assert.deepEqual([best.order[0], best.order[best.order.length - 1]], [0, 4], "start and end must stay put");
    assert.equal(new Set(best.order).size, 5);
  });

  await test("optimize reorders so a closing museum is visited while open", async () => {
    // Museum closes at 4 PM; at 2 PM with a long first stop it only works museum-first.
    const stops = [
      P.northeastern,
      { ...P.chinatown, dwellMin: 120 },
      { ...P.mfa, dwellMin: 60, openingHours: "Mo-Su 10:00-16:00" },
      P.northeastern,
    ];
    const given = await planTrip({ stops, departAt: NOW.toISOString() }, NOW);
    assert.ok(given.warnings.some((w) => w.kind === "closed" || w.kind === "closing"), "given order should warn");
    const best = await planTrip({ stops, optimize: true, departAt: NOW.toISOString() }, NOW);
    assert.ok(!best.warnings.some((w) => w.kind === "closed"), "optimized order should not arrive at a closed museum");
    assert.deepEqual(best.order, [0, 2, 1, 3]);
  });

  await test("arriveBy works backwards to a leave-by time", async () => {
    const by = new Date(NOW.getTime() + 4 * 3600_000);
    const r = await planTrip({ stops: [P.northeastern, { ...P.mfa, dwellMin: 60 }, P.maldenHome], arriveBy: by.toISOString() }, NOW);
    assert.ok(r.leaveBy, "no leaveBy");
    const off = Math.abs(Date.parse(r.endAt) - by.getTime()) / 60_000;
    assert.ok(off <= 6, `arrives ${off} min off target`);
    assert.ok(Date.parse(r.leaveBy!) >= NOW.getTime());
  });

  await test("arriveBy too soon warns instead of failing", async () => {
    const by = new Date(NOW.getTime() + 20 * 60_000);
    const r = await planTrip({ stops: [P.northeastern, { ...P.mfa, dwellMin: 120 }, P.maldenHome], arriveBy: by.toISOString() }, NOW);
    assert.ok(r.warnings.some((w) => w.kind === "late"));
  });

  await test("a leg at 2 AM warns that service has stopped", async () => {
    const night = new Date("2026-11-22T07:00:00Z"); // 2 AM Boston
    const r = await planTrip({ stops: [P.northeastern, P.maldenHome], departAt: night.toISOString() }, night);
    assert.ok(r.warnings.some((w) => w.kind === "service"));
  });

  await test("a stop with no location is rejected with its name", async () => {
    await rejects({ stops: [P.northeastern, { name: "Nowhere" }] }, /Nowhere/);
  });
  await test("coordinates outside Boston are rejected", async () => {
    await rejects({ stops: [P.northeastern, { name: "Paris", lat: 48.85, lng: 2.35 }] }, /outside the Boston area/);
  });
  await test("too many stops are rejected", async () => {
    await rejects({ stops: Array.from({ length: 9 }, () => P.mfa) }, /up to 8/);
  });
  await test("a single stop is rejected", async () => {
    await rejects({ stops: [P.mfa] }, /start and an end/);
  });
  await test("garbage input is rejected, not thrown raw", async () => {
    for (const bad of [null, undefined, 42, "x", {}, { stops: "no" }, { stops: [null, null] }]) await rejects(bad, /./);
  });
  await test("bad and far-future times are rejected", async () => {
    await rejects({ stops: [P.mfa, P.fenway], departAt: "not a date" }, /isn't valid/);
    await rejects({ stops: [P.mfa, P.fenway], departAt: new Date(NOW.getTime() + 30 * 86400_000).toISOString() }, /7 days/);
    await rejects({ stops: [P.mfa, P.fenway], arriveBy: new Date(NOW.getTime() - 3600_000).toISOString() }, /already passed/);
  });
  await test("a departure in the past means now; dwell is clamped", async () => {
    const v = validate({ stops: [P.mfa, { ...P.chinatown, dwellMin: 99999 }, P.fenway], departAt: new Date(NOW.getTime() - 3600_000).toISOString() }, NOW);
    assert.equal(v.depart.getTime(), NOW.getTime());
    assert.equal(v.stops[1].dwellMin, 240);
    assert.equal(v.stops[0].dwellMin, 0);
    assert.equal(v.stops[2].dwellMin, 0);
  });
  await test("HTML in a stop name is kept as text and trimmed", async () => {
    const v = validate({ stops: [{ ...P.mfa, name: "  <b>x</b>".padEnd(200, "y") }, P.fenway] }, NOW);
    assert.ok(v.stops[0].name.length <= 80);
  });

  // With a timetable, the first train of a later leg is a real scheduled train.
  stubFetch("timetable");
  await test("with a timetable, legs report scheduled accuracy and nothing throws", async () => {
    const r: TripResult = await planTrip({ stops: [P.northeastern, { ...P.mfa, dwellMin: 60 }, P.maldenHome], departAt: new Date(NOW.getTime() + 3600_000).toISOString() }, NOW);
    const transit = r.legs.filter((l) => l.mode === "transit");
    assert.ok(transit.length > 0 && transit.every((l) => l.accuracy === "scheduled"), `accuracies: ${r.legs.map((l) => l.accuracy)}`);
    assert.ok(mins(r.startAt, r.endAt) === r.totalMin);
    assert.ok(!r.warnings.some((w) => w.kind === "service"), "should not claim service ended");
    // The 7-minute timetable wait replaces the average wait, so the first train step lasts at least 7 min.
    const firstRide = transit[0].steps.find((s) => s.mode === "subway");
    assert.ok(firstRide && firstRide.minutes >= 7, `first ride only ${firstRide?.minutes} min`);
  });

  await test("a train going the other way is not used (it reaches the stop BEFORE boarding)", async () => {
    const { getScheduledDeparture } = await import("../src/lib/mbta");
    const base = new Date("2026-11-21T20:00:00Z");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const q = new URL(String(input)).searchParams;
      const mk = (id: string, min: number, seq: number) => ({ attributes: { departure_time: new Date(base.getTime() + min * 60_000).toISOString(), stop_sequence: seq }, relationships: { trip: { data: { id } } } });
      if (q.get("filter[trip]")) return new Response(JSON.stringify({ data: [mk("south", 0, 5), mk("north", 0, 30)] }), { status: 200 }); // south reaches Chinatown at seq 5, before it boards (seq 10)
      return new Response(JSON.stringify({ data: [mk("south", 3, 10), mk("north", 9, 10)] }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await getScheduledDeparture("place-rugg", "Orange", "place-chncl", base), 9, "should skip the 3-minute train going the other way");
  });
  await test("service ended only when nothing leaves the stop; unmatched trips are unknown, not 'ended'", async () => {
    const { getScheduledDeparture } = await import("../src/lib/mbta");
    const at = new Date("2026-11-21T20:00:00Z");
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
    assert.equal(await getScheduledDeparture("a", "Orange", "b", at), "none");
    // Empty answer but the day's last departure is still ahead: that's a flaky response, not the end of service.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const q = new URL(String(input)).searchParams;
      const later = { attributes: { departure_time: new Date(at.getTime() + 3600_000).toISOString() }, relationships: { trip: { data: { id: "z" } } } };
      return new Response(JSON.stringify({ data: q.get("sort") === "-departure_time" ? [later] : [] }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await getScheduledDeparture("a", "Orange", "b", at), null);
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const q = new URL(String(input)).searchParams;
      if (q.get("filter[trip]")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ attributes: { departure_time: new Date(at.getTime() + 300_000).toISOString(), stop_sequence: 1 }, relationships: { trip: { data: { id: "x" } } } }] }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await getScheduledDeparture("a", "Orange", "b", at), null);
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.equal(await getScheduledDeparture("a", "Orange", "b", at), null);
  });
  await test("earliest finish: optimized order is never later than the given one, and near the best of all orders", async () => {
    const mid = [{ ...P.harvard, dwellMin: 30 }, { ...P.mfa, dwellMin: 30 }, { ...P.chinatown, dwellMin: 30 }];
    const depart = new Date(NOW.getTime() + 3600_000).toISOString();
    const run = (stops: unknown[], optimize: boolean) => planTrip({ stops, optimize, departAt: depart }, NOW);
    const given = await run([P.northeastern, ...mid, P.maldenHome], false);
    const best = await run([P.northeastern, ...mid, P.maldenHome], true);
    assert.ok(Date.parse(best.endAt) <= Date.parse(given.endAt), "optimized finished later than the given order");
    // brute force every order for the true earliest finish
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let earliest = Infinity;
    for (const o of orders) earliest = Math.min(earliest, Date.parse((await run([P.northeastern, ...o.map((i) => mid[i]), P.maldenHome], false)).endAt));
    const gapMin = (Date.parse(best.endAt) - earliest) / 60_000;
    assert.ok(gapMin <= 6, `optimized finishes ${gapMin} min after the true best order`);
    assert.equal(best.savedMin, Math.max(0, Math.round((Date.parse(given.endAt) - Date.parse(best.endAt)) / 60_000)));
  });
  globalThis.fetch = realFetch;

  console.log("opening hours");
  const at = (iso: string) => new Date(iso);
  await test("open now, closes later", () => {
    const s = openStatus("Mo-Sa 11:00-21:00; Su 12:00-20:00", at("2026-11-21T19:00:00Z"), at("2026-11-21T20:00:00Z")); // Sat 2 PM
    assert.equal(s.state, "open");
  });
  await test("closed before opening, tells you when it opens", () => {
    const s = openStatus("Mo-Su 10:00-17:00", at("2026-11-21T13:00:00Z"), at("2026-11-21T14:00:00Z")); // 8 AM
    assert.equal(s.state, "closed");
    assert.match(s.note ?? "", /Opens at 10:00 AM/);
  });
  await test("closes while you are there", () => {
    const s = openStatus("Mo-Su 10:00-17:00", at("2026-11-21T20:30:00Z"), at("2026-11-21T22:00:00Z")); // arrive 3:30, leave 5:00... closes at 5
    assert.equal(s.state, "open");
    const t = openStatus("Mo-Su 10:00-17:00", at("2026-11-21T21:00:00Z"), at("2026-11-21T22:30:00Z")); // arrive 4, leave 5:30
    assert.equal(t.state, "closing");
  });
  await test("overnight hours carry past midnight", () => {
    const s = openStatus("Fr,Sa 18:00-02:00", at("2026-11-22T06:00:00Z"), at("2026-11-22T06:30:00Z")); // Sat 1 AM
    assert.equal(s.state, "open");
  });
  await test("day off and 24/7", () => {
    assert.equal(openStatus("Mo-Sa 09:00-17:00; Su off", at("2026-11-22T17:00:00Z"), at("2026-11-22T18:00:00Z")).state, "closed");
    assert.equal(openStatus("24/7", at("2026-11-22T08:00:00Z"), at("2026-11-22T09:00:00Z")).state, "open");
  });
  await test("things it can't read come back unknown, never guessed", () => {
    for (const oh of ["sunrise-sunset", "Jan-Mar Mo 10:00-12:00", "Mo-Fr 10:00-17:00 \"call ahead\"", "garbage", "", null, undefined])
      assert.equal(openStatus(oh as string, at("2026-11-21T19:00:00Z"), at("2026-11-21T20:00:00Z")).state, "unknown", String(oh));
  });

  console.log("clock");
  await test("after-midnight times use the previous service date with a 24+ hour", () => {
    const q = serviceQuery(new Date("2026-11-22T06:30:00Z")); // 1:30 AM Sun
    assert.deepEqual(q, { date: "2026-11-21", minTime: "25:30" });
    assert.deepEqual(serviceQuery(new Date("2026-11-21T19:05:00Z")), { date: "2026-11-21", minTime: "14:05" });
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
}
main();
