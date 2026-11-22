// Server only. Multi-stop transit trips: start, any stops along the way, end, with a clock time for
// every arrival and departure. Transit apps give you A to B; this chains legs and carries the clock.
//
// How the clock is carried: each leg starts when the last stop's stay ends. The first train of a leg
// uses live MBTA predictions if the leg starts within 10 minutes, otherwise the MBTA timetable for
// that hour (so a 7 PM leg gets a real 7 PM train). Later transfers inside a leg use average waits and
// the leg says so. Nothing here throws on a bad network: it degrades to estimates and flags them.
import { getStation } from "./data";
import { addMin, bostonParts, fmtClock } from "./clock";
import { distanceM } from "./geo";
import { getAlerts, getNextDeparture, getScheduledDeparture } from "./mbta";
import { openStatus } from "./openingHours";
import { plan, type Plan } from "./planner";
import { estimateRoute } from "./routes";
import type {
  Accuracy, TripLeg, TripRequest, TripResult, TripStep, TripStopInput, TripStopResult, TripWarning,
} from "./tripTypes";
import type { LineId, RouteStep } from "./types";

export const MAX_STOPS = 8;
export const DEFAULT_DWELL_MIN = 30;
const MIN_DWELL = 5;
const MAX_DWELL = 240;
const LIVE_WINDOW_MIN = 10;
const NETWORK_BUDGET_MS = 9_000;
const MAX_WALK_ONLY_MIN = 40;
const WALK_ONLY_SHORT_MIN = 10;
const WALK_M_PER_MIN = 80;
const BOUNDS = { latMin: 42.15, latMax: 42.55, lngMin: -71.35, lngMax: -70.85 };
const MAX_AHEAD_MS = 7 * 24 * 3600_000;

export class TripError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Pt = { lat: number; lng: number };
interface Stop extends Required<Pick<TripStopInput, "name" | "lat" | "lng">> {
  id?: string;
  dwellMin: number;
  openingHours?: string | null;
}

const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.3) / WALK_M_PER_MIN));

// ---------- input ----------

export function validate(req: unknown, now = new Date()) {
  const body = req as Partial<TripRequest> | null;
  if (!body || !Array.isArray(body.stops)) throw new TripError("Add at least a start and an end.");
  if (body.stops.length < 2) throw new TripError("Add at least a start and an end.");
  if (body.stops.length > MAX_STOPS) throw new TripError(`Trips can have up to ${MAX_STOPS} stops in all. Remove ${body.stops.length - MAX_STOPS}.`);

  const stops: Stop[] = body.stops.map((s, i, all) => {
    const label = s && typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 80) : `Stop ${i + 1}`;
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng))
      throw new TripError(`"${label}" has no location. Pick it from the list.`);
    if (s.lat < BOUNDS.latMin || s.lat > BOUNDS.latMax || s.lng < BOUNDS.lngMin || s.lng > BOUNDS.lngMax)
      throw new TripError(`"${label}" is outside the Boston area we cover.`);
    const middle = i > 0 && i < all.length - 1;
    const dwell = Number.isFinite(s.dwellMin) ? Math.min(MAX_DWELL, Math.max(MIN_DWELL, Math.round(s.dwellMin!))) : DEFAULT_DWELL_MIN;
    return {
      id: typeof s.id === "string" ? s.id.slice(0, 120) : undefined,
      name: label, lat: s.lat, lng: s.lng,
      dwellMin: middle ? dwell : 0,
      openingHours: typeof s.openingHours === "string" ? s.openingHours.slice(0, 400) : null,
    };
  });

  let depart = now;
  if (body.departAt != null && body.departAt !== "") {
    const d = new Date(body.departAt);
    if (Number.isNaN(d.getTime())) throw new TripError("That departure time isn't valid.");
    if (d.getTime() - now.getTime() > MAX_AHEAD_MS) throw new TripError("Pick a time within the next 7 days.");
    depart = d.getTime() < now.getTime() ? now : d; // a time in the past means now
  }
  let arriveBy: Date | undefined;
  if (body.arriveBy != null && body.arriveBy !== "") {
    arriveBy = new Date(body.arriveBy);
    if (Number.isNaN(arriveBy.getTime())) throw new TripError("That arrival time isn't valid.");
    if (arriveBy.getTime() - now.getTime() > MAX_AHEAD_MS) throw new TripError("Pick a time within the next 7 days.");
    if (arriveBy.getTime() <= now.getTime()) throw new TripError("The arrival time has already passed.");
  }
  return { stops, depart, arriveBy, optimize: Boolean(body.optimize), stepFree: Boolean(body.stepFree) };
}

// ---------- one leg ----------

interface LegCtx {
  now: Date;
  canFetch: () => boolean;
}

const planMemo = new Map<string, Plan | null>();
function memoPlan(a: Pt, b: Pt): Plan | null {
  const k = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  if (planMemo.has(k)) return planMemo.get(k)!;
  let p: Plan | null = null;
  try {
    p = plan(a, b);
  } catch {
    p = null;
  }
  if (planMemo.size > 5000) planMemo.clear();
  planMemo.set(k, p);
  return p;
}

/** Minutes between two points with average waits, no network. Used to pick a good order. */
function quickMin(a: Pt, b: Pt): number {
  const w = walkMinutes(distanceM(a, b));
  if (w <= WALK_ONLY_SHORT_MIN) return w;
  const p = memoPlan(a, b);
  if (p && !(w <= p.durationMin && w <= MAX_WALK_ONLY_MIN)) return p.durationMin;
  if (!p) return w <= 60 ? w : Math.max(w, estimateRoute(a, b).durationMin || w);
  return w;
}

const lineOfStep = (s: RouteStep): LineId | undefined => s.line;

interface LegCore {
  steps: RouteStep[];
  mode: "walk" | "transit";
  accuracy: Accuracy;
  routeIds: string[];
  stopIds: string[];
  noService: boolean;
  /** Set when no train route exists and we fell back to walking or an estimate. */
  note?: string;
}

async function legCore(from: Stop, to: Stop, departAt: Date, ctx: LegCtx): Promise<LegCore> {
  const meters = distanceM(from, to);
  const walkMin = walkMinutes(meters);
  const walk = (note?: string): LegCore => ({
    steps: [{ mode: "walk", label: `Walk ${walkMin} min to ${to.name}`, minutes: walkMin }],
    mode: "walk", accuracy: "walk", routeIds: [], stopIds: [], noService: false, note,
  });
  if (walkMin <= WALK_ONLY_SHORT_MIN) return walk();

  const p = memoPlan(from, to);
  if (!p) {
    // No train route from our own planner. Last resort: a straight estimate, or walk if it is close enough.
    if (walkMin <= 60) return walk(`No train route found, so this leg is a ${walkMin} min walk.`);
    const est = estimateRoute(from, to);
    if (est.durationMin > 0)
      return { steps: est.steps, mode: "transit", accuracy: "estimated", routeIds: [], stopIds: [], noService: false, note: "Rough estimate: no timetable data for this leg." };
    throw new TripError(`We couldn't find a way from "${from.name}" to "${to.name}" by T.`);
  }
  if (walkMin <= p.durationMin && walkMin <= MAX_WALK_ONLY_MIN) return walk();

  const steps = p.steps.map((s) => ({ ...s }));
  let accuracy: Accuracy = "estimated";
  let noService = false;

  const fb = p.firstBoard;
  if (fb && steps[fb.stepIndex]) {
    // When the rider reaches the first platform: leg start plus any walking before it.
    const before = steps.slice(0, fb.stepIndex).reduce((n, s) => n + s.minutes, 0);
    const atStop = addMin(departAt, before);
    const leadMin = Math.round((atStop.getTime() - ctx.now.getTime()) / 60_000);
    let wait: number | null = null;

    if (ctx.canFetch() && leadMin <= LIVE_WINDOW_MIN) {
      const live = await getNextDeparture(fb.stopId, fb.routeId, fb.toStopId);
      if (live !== null) {
        const w = live - Math.max(0, leadMin);
        if (w >= 0 && w <= 45) { wait = w; accuracy = "live"; }
      }
    }
    if (wait === null && ctx.canFetch()) {
      const sched = await getScheduledDeparture(fb.stopId, fb.routeId, fb.toStopId, atStop);
      if (sched === "none") noService = true;
      else if (sched !== null && sched <= 90) { wait = sched; accuracy = "scheduled"; }
    }
    if (wait !== null) {
      const step = steps[fb.stepIndex];
      step.minutes = Math.max(1, step.minutes + Math.round(wait - fb.plannedWaitMin));
    }
  }
  return {
    steps, mode: "transit", accuracy, routeIds: p.routeIds, stopIds: p.stopIds, noService,
  };
}

// ---------- the whole trip ----------

interface Timeline {
  stops: TripStopResult[];
  legs: TripLeg[];
  cores: LegCore[];
  endAt: Date;
}

async function buildTimeline(stops: Stop[], depart: Date, ctx: LegCtx): Promise<Timeline> {
  const results: TripStopResult[] = [
    { id: stops[0].id, name: stops[0].name, lat: stops[0].lat, lng: stops[0].lng, role: "start", arriveAt: depart.toISOString(), departAt: depart.toISOString(), dwellMin: 0 },
  ];
  const legs: TripLeg[] = [];
  const cores: LegCore[] = [];
  let t = depart;

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i], to = stops[i + 1];
    const core = await legCore(from, to, t, ctx);
    let cursor = t;
    const steps: TripStep[] = core.steps.map((s) => {
      const startAt = cursor;
      cursor = addMin(cursor, s.minutes);
      return { ...s, startAt: startAt.toISOString(), endAt: cursor.toISOString() };
    });
    const arrive = cursor;
    const leave = addMin(arrive, to.dwellMin);
    legs.push({
      index: i, fromName: from.name, toName: to.name, departAt: t.toISOString(), arriveAt: arrive.toISOString(),
      durationMin: Math.round((arrive.getTime() - t.getTime()) / 60_000), mode: core.mode, steps, alerts: [],
      accuracy: core.accuracy, lines: [...new Set(core.steps.map(lineOfStep).filter((l): l is LineId => Boolean(l)))],
    });
    cores.push(core);
    const last = i === stops.length - 2;
    const open = to.openingHours ? openStatus(to.openingHours, arrive, leave) : undefined;
    results.push({
      id: to.id, name: to.name, lat: to.lat, lng: to.lng, role: last ? "end" : "stop",
      arriveAt: arrive.toISOString(), departAt: leave.toISOString(), dwellMin: to.dwellMin,
      open: open && open.state !== "unknown" ? open : undefined,
    });
    t = leave;
  }
  return { stops: results, legs, cores, endAt: new Date(results[results.length - 1].arriveAt) };
}

// ---------- order ----------

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) { yield items.slice(); return; }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

/** Cost of an order: total minutes, plus a big penalty for arriving at a closed or closing place. */
function orderCost(order: Stop[], depart: Date): { total: number; penalty: number; travel: number } {
  let t = depart, travel = 0, penalty = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const m = quickMin(order[i], order[i + 1]);
    travel += m;
    t = addMin(t, m);
    const s = order[i + 1];
    const leave = addMin(t, s.dwellMin);
    if (s.openingHours) {
      const st = openStatus(s.openingHours, t, leave).state;
      if (st === "closed") penalty += 1000;
      else if (st === "closing") penalty += 300;
    }
    t = leave;
  }
  return { total: (t.getTime() - depart.getTime()) / 60_000, penalty, travel };
}

/**
 * The most promising orders by the quick no-network estimate: the best two, plus the order the person
 * gave us (so we can say how much the change saves). The estimate only shortlists; the real timetable
 * decides, in planTrip.
 */
function rankedOrders(stops: Stop[], depart: Date): number[][] {
  const idx = stops.map((_, i) => i);
  const middle = idx.slice(1, -1);
  if (middle.length < 2) return [idx];
  const scored: { order: number[]; cost: number }[] = [];
  for (const perm of permutations(middle)) {
    const order = [0, ...perm, stops.length - 1];
    const c = orderCost(order.map((i) => stops[i]), depart);
    scored.push({ order, cost: c.total + c.penalty });
  }
  scored.sort((x, y) => x.cost - y.cost);
  const out = scored.slice(0, 2).map((x) => x.order);
  if (!out.some((o) => o.every((v, i) => v === idx[i]))) out.push(idx);
  return out;
}

// ---------- entry point ----------

const SOURCE_RANK: Accuracy[] = ["live", "scheduled", "estimated"];

export async function planTrip(request: unknown, now = new Date()): Promise<TripResult> {
  const v = validate(request, now);
  const started = Date.now();
  const ctxFor = (fetching: boolean): LegCtx => ({ now, canFetch: () => fetching && Date.now() - started < NETWORK_BUDGET_MS });

  // 1. Shortlist orders. 2. For each, work out when to leave and build the real timeline (live and
  // timetable times), in parallel. 3. Keep the one that finishes earliest with every place open.
  interface Solved {
    order: number[];
    stops: Stop[];
    tl: Timeline;
    depart: Date;
    leaveBy?: Date;
    warnings: TripWarning[];
    durationMin: number;
    penalty: number;
  }
  const solve = async (order: number[]): Promise<Solved> => {
    const stops = order.map((i) => v.stops[i]);
    let depart = v.depart;
    let leaveBy: Date | undefined;
    const warnings: TripWarning[] = [];
    if (v.arriveBy) {
      const rough = await buildTimeline(stops, v.arriveBy, ctxFor(false)); // no network: cheap first guess
      depart = new Date(v.arriveBy.getTime() - (rough.endAt.getTime() - v.arriveBy.getTime()));
      if (depart.getTime() < now.getTime()) {
        warnings.push({ kind: "late", severity: "bad", message: `To arrive by ${fmtClock(v.arriveBy)} you would have needed to leave ${Math.ceil((now.getTime() - depart.getTime()) / 60_000)} min ago. Showing the trip from now.` });
        depart = now;
      }
    }
    let tl = await buildTimeline(stops, depart, ctxFor(true));
    if (v.arriveBy && depart.getTime() > now.getTime()) {
      const off = tl.endAt.getTime() - v.arriveBy.getTime();
      if (Math.abs(off) > 3 * 60_000 && Date.now() - started < NETWORK_BUDGET_MS) {
        const next = new Date(Math.max(now.getTime(), depart.getTime() - off));
        tl = await buildTimeline(stops, next, ctxFor(true));
        depart = next;
      }
      leaveBy = depart;
      if (tl.endAt.getTime() > v.arriveBy.getTime() + 3 * 60_000)
        warnings.push({ kind: "late", severity: "bad", message: `You would get to the end at ${fmtClock(tl.endAt)}, ${Math.round((tl.endAt.getTime() - v.arriveBy.getTime()) / 60_000)} min after ${fmtClock(v.arriveBy)}.` });
    }
    const durationMin = (tl.endAt.getTime() - new Date(tl.stops[0].departAt).getTime()) / 60_000;
    const penalty = tl.stops.reduce((n, st) => n + (st.open?.state === "closed" ? 1000 : st.open?.state === "closing" ? 300 : 0), 0);
    return { order, stops, tl, depart, leaveBy, warnings, durationMin, penalty };
  };

  const identity = v.stops.map((_, i) => i);
  const candidates = v.optimize ? rankedOrders(v.stops, v.depart) : [identity];
  const solved = await Promise.all(candidates.map(solve));
  const score = (x: Solved) => x.durationMin + x.penalty;
  const original = solved.find((x) => x.order.every((o, i) => o === identity[i]));
  let chosen = solved[0];
  for (const x of solved) if (score(x) < score(chosen) - 0.5) chosen = x;
  // Never swap away from the person's own order for a gain that is just rounding.
  if (original && original !== chosen && score(original) - score(chosen) < 1) chosen = original;

  const { order, tl, leaveBy, warnings } = chosen;
  const savedMin = v.optimize && original ? Math.max(0, Math.round(original.durationMin - chosen.durationMin)) : v.optimize ? 0 : undefined;
  const fixedClosures = Boolean(original) && chosen.penalty < original!.penalty;

  // 4. alerts, all legs at once
  const canAlert = Date.now() - started < NETWORK_BUDGET_MS + 3_000;
  const alertSets = await Promise.all(tl.cores.map((c) => (canAlert && c.routeIds.length ? getAlerts(c.routeIds, c.stopIds) : Promise.resolve([] as string[]))));
  tl.legs.forEach((leg, i) => {
    leg.alerts = alertSets[i];
    for (const a of alertSets[i]) warnings.push({ kind: "alert", severity: "warn", legIndex: i, message: `Service alert on leg ${i + 1}: ${a}` });
  });

  // 5. warnings from the timeline
  tl.stops.forEach((s, i) => {
    if (s.open?.state === "closed") warnings.push({ kind: "closed", severity: "bad", stopIndex: i, message: `${s.name} looks closed when you'd arrive at ${fmtClock(s.arriveAt)}. ${s.open.note ?? ""}`.trim() });
    else if (s.open?.state === "closing") warnings.push({ kind: "closing", severity: "warn", stopIndex: i, message: `${s.name}: ${s.open.note}.` });
  });
  tl.cores.forEach((core, i) => {
    const leg = tl.legs[i];
    const dep = new Date(leg.departAt);
    const hour = bostonParts(dep).hour;
    if (core.noService)
      warnings.push({ kind: "service", severity: hour >= 22 || hour < 5 ? "bad" : "warn", legIndex: i, message: `No more scheduled service found for leg ${i + 1} after ${fmtClock(dep)}. The last train or bus may have gone.` });
    else if (core.mode === "transit" && (hour >= 1 && hour < 5))
      warnings.push({ kind: "service", severity: "bad", legIndex: i, message: `Leg ${i + 1} starts at ${fmtClock(dep)}, when most MBTA service isn't running.` });
    if (core.note) warnings.push({ kind: "estimate", severity: "info", legIndex: i, message: core.note });
    for (const s of leg.steps) if (s.mode === "walk" && s.minutes >= 15 && leg.mode === "transit")
      warnings.push({ kind: "walk", severity: "info", legIndex: i, message: `Leg ${i + 1} has a ${s.minutes} min walk.` });
    if (v.stepFree) {
      const bad = [...new Set(core.stopIds)]
        .map((id) => getStation(id))
        .filter((st) => st && (st as { wheelchair?: boolean }).wheelchair === false)
        .map((st) => st!.name);
      if (bad.length) warnings.push({ kind: "access", severity: "warn", legIndex: i, message: `Leg ${i + 1} uses ${bad.slice(0, 3).join(", ")}, which ${bad.length > 1 ? "have" : "has"} no elevator or ramp.` });
    }
  });
  if (v.optimize && (savedMin ?? 0) >= 2)
    warnings.push({ kind: "ordering", severity: "info", message: `Reordered your stops to save about ${savedMin} min.` });
  else if (v.optimize && fixedClosures)
    warnings.push({ kind: "ordering", severity: "info", message: "Reordered your stops so each place is open when you get there." });

  const transit = tl.legs.filter((l) => l.mode === "transit");
  const source: Accuracy = transit.length
    ? SOURCE_RANK[Math.max(...transit.map((l) => SOURCE_RANK.indexOf(l.accuracy === "walk" ? "live" : l.accuracy)))]
    : "scheduled";
  if (transit.some((l) => l.accuracy === "estimated"))
    warnings.push({ kind: "estimate", severity: "info", message: "Some train times are estimates because live and timetable data weren't available." });

  const startAt = tl.stops[0].departAt;
  const endAt = tl.stops[tl.stops.length - 1].arriveAt;
  const travelMin = tl.legs.reduce((n, l) => n + l.durationMin, 0);
  const dwellMin = tl.stops.reduce((n, s) => n + s.dwellMin, 0);
  return {
    ok: true,
    stops: tl.stops, legs: tl.legs, startAt, endAt,
    totalMin: Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
    travelMin, dwellMin, warnings: warnings.sort((a, b) => sev(b) - sev(a)),
    order, reordered: order.some((o, i) => o !== i), savedMin: v.optimize ? savedMin : undefined,
    leaveBy: leaveBy?.toISOString(), source, computedAt: now.toISOString(),
  };
}

const sev = (w: TripWarning) => (w.severity === "bad" ? 2 : w.severity === "warn" ? 1 : 0);
