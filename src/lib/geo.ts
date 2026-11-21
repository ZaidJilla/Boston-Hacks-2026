/**
 * Geo helpers + richer views of the generated data in /data. Server or client safe.
 *
 * The base shapes come from the shared contract in ./types.ts. The types here only *extend*
 * them with the extra fields the data scripts write, so anything typed against types.ts still works.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  Craving,
  Line as LineBase,
  LineId,
  PriceTier,
  Restaurant as RestaurantBase,
  Station as StationBase,
} from "./types";
import { LINE_COLORS } from "./config";
import { UNLOCK_THRESHOLD } from "./scoring";
import neighborhoodsJson from "../../data/neighborhoods.json";
import stationsJson from "../../data/stations.json";
import linesJson from "../../data/lines.json";
import restaurantsJson from "../../data/restaurants.json";
import cravingsJson from "../../data/cravings.json";

export { UNLOCK_THRESHOLD };
export type { Craving, LineId, PriceTier };

export interface NeighborhoodProps {
  id: string;
  name: string;
  /** [lat, lng] point guaranteed to be inside the polygon */
  center: [number, number];
  sqmiles: number | null;
}
export type NeighborhoodFeature = Feature<Polygon | MultiPolygon, NeighborhoodProps>;

export interface Station extends StationBase {
  /** GTFS route ids, e.g. ["Green-B", "Green-C"] */
  routes: string[];
  wheelchair: boolean;
  municipality: string | null;
}

export interface LineBranch {
  /** GTFS route id, e.g. "Green-D", "Mattapan", "741" */
  routeId: string;
  name: string;
  terminus: string;
  /** ordered station ids */
  stops: string[];
  /** scheduled minutes from stops[i] to stops[i + 1] */
  segmentMinutes: number[];
  totalMinutes: number;
  /** [lat, lng] track geometry for drawing */
  shape: [number, number][];
}

export interface Line extends LineBase {
  branches: LineBranch[];
}

export interface CravingInfo {
  id: Craving;
  label: string;
  emoji: string;
}

export interface Restaurant extends RestaurantBase {
  neighborhoodName: string;
  amenity: string;
  /** raw OSM cuisine values */
  cuisine: string[];
  /** every craving this place fits; `craving` is the primary one */
  cravings: Craving[];
  /** finer category, e.g. "korean", "italian" (these roll up into craving "other") */
  category: string;
  categoryLabel: string;
  priceLabel: string;
  /** true when the price tier was estimated (OSM rarely has price tags) */
  priceEstimated: boolean;
  brand: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  diet: { vegetarian: boolean; vegan: boolean; glutenFree: boolean };
  wheelchair: string | null;
  nearestStation: { id: string; name: string; lines: LineId[]; distanceM: number; walkMin: number };
  osm: string;
}

export const neighborhoods = neighborhoodsJson as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  NeighborhoodProps
>;
export const stations = stationsJson as unknown as Station[];
export const lines = linesJson as unknown as Line[];
export const restaurants = restaurantsJson as unknown as Restaurant[];
export const cravings = cravingsJson as unknown as CravingInfo[];

export const neighborhoodById = new Map(neighborhoods.features.map((f) => [f.properties.id, f]));
export const stationById = new Map(stations.map((s) => [s.id, s]));
export const lineById = new Map(lines.map((l) => [l.id, l]));
export const restaurantById = new Map(restaurants.map((r) => [r.id, r]));
export const cravingById = new Map(cravings.map((c) => [c.id, c]));

export const getRestaurant = (id: string) => restaurantById.get(id);
export const restaurantsIn = (hoodId: string) => restaurants.filter((r) => r.neighborhood === hoodId);

export const LINE_ORDER: LineId[] = ["red", "orange", "green", "blue", "silver"];
export const LINE_SHORT: Record<LineId, string> = { red: "R", orange: "O", green: "G", blue: "B", silver: "SL" };

export const BOSTON_BOUNDS: [[number, number], [number, number]] = [
  [42.227, -71.191],
  [42.4, -70.986],
];

export const lineColor = (id: LineId): string => LINE_COLORS[id] ?? LINE_COLORS.silver;

/** Station dot color: its line color, or white for transfer stations. */
export function stationColor(s: Pick<StationBase, "lines">): string {
  return s.lines.length > 1 ? "#ffffff" : lineColor(s.lines[0]);
}

/** Great-circle distance in meters. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Used by /api/checkin (from the team skeleton). Keep these signatures stable.
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distanceM({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng });
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distanceMeters(aLat, aLng, bLat, bLng) / 1000;
}

/** Rough walking minutes for a straight-line distance (street grid ≈ 1.3× crow-flies, 80 m/min). */
export const walkMinutes = (meters: number) => Math.max(1, Math.round((meters * 1.3) / 80));

/** Scheduled minutes riding between two stations on the same branch (null if not on one branch). */
export function rideMinutes(lineId: LineId, fromStopId: string, toStopId: string): number | null {
  for (const b of lineById.get(lineId)?.branches ?? []) {
    const i = b.stops.indexOf(fromStopId);
    const j = b.stops.indexOf(toStopId);
    if (i < 0 || j < 0) continue;
    const [a, z] = i < j ? [i, j] : [j, i];
    return b.segmentMinutes.slice(a, z).reduce((s, m) => s + m, 0);
  }
  return null;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Which neighborhood a point is in (null if outside Boston). */
export function neighborhoodAt(lat: number, lng: number): NeighborhoodFeature | null {
  for (const f of neighborhoods.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [outer, ...holes] of polys) {
      if (pointInRing(lng, lat, outer) && !holes.some((h) => pointInRing(lng, lat, h))) return f;
    }
  }
  return null;
}

/** [[south, west], [north, east]] for a neighborhood, for map.fitBounds. */
export function neighborhoodBounds(f: NeighborhoodFeature): [[number, number], [number, number]] {
  let s = 90, w = 180, n = -90, e = -180;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys)
    for (const [lng, lat] of poly[0]) {
      s = Math.min(s, lat); n = Math.max(n, lat);
      w = Math.min(w, lng); e = Math.max(e, lng);
    }
  return [[s, w], [n, e]];
}

export type LocationFilter =
  | { kind: "anywhere" }
  | { kind: "near"; lat: number; lng: number; radiusM: number }
  | { kind: "neighborhood"; id: string };

export interface RestaurantFilters {
  /** empty = all */
  cravings: Craving[];
  /** empty = all */
  prices: PriceTier[];
  /** nearest station is on one of these lines; empty = all */
  lines: LineId[];
  location: LocationFilter;
  hideChains: boolean;
}

export const DEFAULT_FILTERS: RestaurantFilters = {
  cravings: [],
  prices: [],
  lines: [],
  location: { kind: "anywhere" },
  hideChains: false,
};

export function filterRestaurants(list: Restaurant[], f: RestaurantFilters): Restaurant[] {
  return list.filter((r) => {
    if (f.cravings.length && !r.cravings.some((c) => f.cravings.includes(c))) return false;
    if (f.prices.length && !f.prices.includes(r.price)) return false;
    if (f.lines.length && !r.nearestStation.lines.some((l) => f.lines.includes(l))) return false;
    if (f.hideChains && r.isChain) return false;
    if (f.location.kind === "neighborhood" && r.neighborhood !== f.location.id) return false;
    if (f.location.kind === "near" && distanceM(r, f.location) > f.location.radiusM) return false;
    return true;
  });
}

export function activeFilterCount(f: RestaurantFilters): number {
  return (
    (f.cravings.length ? 1 : 0) +
    (f.prices.length ? 1 : 0) +
    (f.lines.length ? 1 : 0) +
    (f.location.kind !== "anywhere" ? 1 : 0) +
    (f.hideChains ? 1 : 0)
  );
}
