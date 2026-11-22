// Server only (uses the trip planner). Route-aware discovery: given where you are and where you
// are going, find a place for something you want (food now, shops and landmarks once those are in
// the data) that barely changes your trip, and prefer places you haven't been.
//
// Every place is scored by its ADDED minutes: (you -> place) + (place -> destination) minus
// (you -> destination). Small added time keeps your path intact. Picks are then sampled with
// weights, not sorted, so asking twice gives different answers and the same famous street doesn't
// win every time.
import { getStation, places, restaurants } from "./data";
import { distanceM, neighborhoodById } from "./geo";
import { plan } from "./planner";
import type { Craving, LineId, PlaceRow, Restaurant } from "./types";

type LatLng = { lat: number; lng: number };
export type PlaceKind = "food" | "shop" | "landmark";

/** Normalized place. Restaurants map in today; stores and landmarks plug in when that data exists. */
export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  neighborhood: string;
  nearestStopId: string;
  kind: PlaceKind;
  craving?: Craving;
  price?: 1 | 2 | 3;
  isChain: boolean;
  /** false only when OSM says "no". Unknown counts as fine, so we never hide places for missing data. */
  wheelchair?: boolean | null;
  /** park, museum, books, ... (landmarks and stores only) */
  subtype?: string;
}

const access = (v: string | null | undefined): boolean | null => (v === "no" ? false : v ? true : null);

const fromRestaurant = (r: Restaurant & { wheelchair?: string | null }): Place => ({
  id: r.id, name: r.name, lat: r.lat, lng: r.lng, neighborhood: r.neighborhood,
  nearestStopId: r.nearestStopId, kind: "food", craving: r.craving, price: r.price,
  isChain: r.isChain, wheelchair: access(r.wheelchair),
});

const fromPlace = (p: PlaceRow): Place => ({
  id: p.id, name: p.name, lat: p.lat, lng: p.lng, neighborhood: p.neighborhood, nearestStopId: p.nearestStopId,
  kind: p.type === "landmark" ? "landmark" : "shop", isChain: p.isChain, wheelchair: access(p.wheelchair), subtype: p.subtype,
});

const ALL: Place[] = [...restaurants.map(fromRestaurant), ...places.map(fromPlace)];
export const allPlaces = (): Place[] => ALL;
export const supportedKinds = (): PlaceKind[] => [...new Set(allPlaces().map((p) => p.kind))];

export interface DetourOptions {
  from: LatLng;
  to: LatLng;
  kind?: PlaceKind;
  craving?: Craving;
  maxPrice?: 1 | 2 | 3;
  independentOnly?: boolean;
  /** Skip places whose data says they are not step-free. */
  stepFree?: boolean;
  /** Most extra travel minutes the student will accept. */
  maxAdded?: number;
  limit?: number;
  /** Place ids to avoid (recently suggested). */
  exclude?: Set<string>;
  /** Neighborhoods the student has already visited; unvisited ones get a boost. */
  visitedNeighborhoods?: Set<string>;
  /** Fixed seed for repeatable output in tests. */
  seed?: number;
}

export interface Detour {
  place: Place;
  directMin: number;
  viaMin: number;
  addedMin: number;
  /** The place is right on the ride you were already taking. */
  onRoute: boolean;
  /** Looks far on a map but costs little. This is the surprise. */
  feelsFar: boolean;
  newNeighborhood: boolean;
  reason: string;
}

const WALK_M_PER_MIN = 80;
const FEELS_FAR_M = 2000;
const walkMin = (m: number) => Math.max(1, Math.round((m * 1.3) / WALK_M_PER_MIN));

const memo = new Map<string, number>();
/** Minutes door to door without live data, mirroring the planner's walk-or-ride choice. */
function tripMin(a: LatLng, b: LatLng): number {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const w = walkMin(distanceM(a, b));
  let out = w;
  if (w > 10) {
    const p = plan(a, b);
    out = p && !(w <= p.durationMin && w <= 40) ? p.durationMin : w;
  }
  if (memo.size > 20000) memo.clear();
  memo.set(key, out);
  return out;
}

/** Museums and galleries are the better surprise; memorial tablets and cemeteries rarely are. */
const subtypeWeight = (s?: string) =>
  !s ? 1 : /museum|gallery/.test(s) ? 1.4 : /attraction|park|building|fort|ship|maritime/.test(s) ? 1.15 : /memorial|cemetery|ruins/.test(s) ? 0.5 : 1;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lineName = (l: LineId) => `${l[0].toUpperCase()}${l.slice(1)} Line`;
const hoodName = (id: string) => neighborhoodById.get(id)?.properties.name ?? id;

export function findDetours(opts: DetourOptions): Detour[] {
  const { from, to } = opts;
  const maxAdded = opts.maxAdded ?? 12;
  const limit = opts.limit ?? 3;
  const rand = rng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
  const direct = tripMin(from, to);
  const directPlan = plan(from, to);
  const routeStops = new Set(directPlan?.stopIds ?? []);
  const crow = distanceM(from, to);

  const candidates = allPlaces()
    .filter((p) => !opts.kind || p.kind === opts.kind)
    .filter((p) => !opts.craving || p.craving === opts.craving)
    .filter((p) => !opts.maxPrice || (p.price ?? 1) <= opts.maxPrice)
    .filter((p) => !opts.independentOnly || !p.isChain)
    .filter((p) => !opts.stepFree || p.wheelchair !== false)
    .filter((p) => !opts.exclude?.has(p.id))
    // Cheap geometric cut before any routing: the place must sit inside an ellipse around the trip.
    .filter((p) => distanceM(from, p) + distanceM(p, to) <= crow * 1.7 + 2500);

  const scored: { d: Detour; w: number }[] = [];
  for (const p of candidates) {
    const via = tripMin(from, p) + tripMin(p, to);
    const added = Math.max(0, via - direct);
    if (added > maxAdded) continue;
    const station = getStation(p.nearestStopId);
    // Only call it on-route when it really costs almost nothing; a far walk from the station doesn't count.
    const onRoute = routeStops.has(p.nearestStopId) && added <= 6;
    const nearest = Math.min(distanceM(from, p), distanceM(to, p));
    const feelsFar = nearest > FEELS_FAR_M && added <= maxAdded * 0.75;
    const newNeighborhood = Boolean(opts.visitedNeighborhoods) && !opts.visitedNeighborhoods!.has(p.neighborhood);

    // Weight: cheap detours first, then novelty and surprise, then independents.
    const w =
      Math.exp(-added / 6) *
      (newNeighborhood ? 1.8 : 1) *
      (feelsFar ? 1.6 : 1) *
      (onRoute ? 1.3 : 1) *
      (p.isChain ? 0.6 : 1.2) *
      subtypeWeight(p.subtype);

    const what = p.subtype ? `${p.subtype.replace(/^historic-/, "").replace(/_/g, " ")}, ` : "";
    const where = `${what}${hoodName(p.neighborhood)}${station ? `, by ${station.name}` : ""}`;
    const reason = onRoute
      ? `Adds about ${Math.round(added)} min. It is on the ride you are already taking (${where}).`
      : feelsFar
        ? `Looks far, but adds only about ${Math.round(added)} min (${where}).`
        : `Adds about ${Math.round(added)} min (${where}).`;
    scored.push({
      w,
      d: { place: p, directMin: Math.round(direct), viaMin: Math.round(via), addedMin: Math.round(added), onRoute, feelsFar, newNeighborhood, reason },
    });
  }

  // Weighted sampling without replacement (Gumbel top-k), one pick per neighborhood so the three
  // answers span different areas. Varies on every call unless a seed is given.
  const keyed = scored
    .map((s) => ({ ...s, k: Math.log(s.w) - Math.log(-Math.log(Math.max(rand(), 1e-9))) }))
    .sort((a, b) => b.k - a.k);
  const picks: Detour[] = [];
  const hoods = new Set<string>();
  for (const s of keyed) {
    if (hoods.has(s.d.place.neighborhood)) continue;
    hoods.add(s.d.place.neighborhood);
    picks.push(s.d);
    if (picks.length >= limit) break;
  }
  for (const s of keyed) {
    if (picks.length >= limit) break;
    if (!picks.includes(s.d)) picks.push(s.d);
  }
  return picks;
}
