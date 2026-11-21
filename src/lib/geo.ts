/**
 * Shared geo types + helpers over the generated data in /data.
 * Safe to import from server or client code.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import neighborhoodsJson from "../../data/neighborhoods.json";
import stationsJson from "../../data/stations.json";
import linesJson from "../../data/lines.json";
import restaurantsJson from "../../data/restaurants.json";
import cravingsJson from "../../data/cravings.json";

export type PriceTier = 1 | 2 | 3;

export interface NeighborhoodProps {
  id: string;
  name: string;
  color: string;
  /** [lat, lng] point guaranteed to be inside the polygon */
  center: [number, number];
  sqmiles: number | null;
}
export type Neighborhood = Feature<Polygon | MultiPolygon, NeighborhoodProps>;

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** line ids, e.g. ["red", "green-b"] */
  lines: string[];
  wheelchair: boolean;
  municipality: string | null;
}

export interface Line {
  id: string;
  routeId: string;
  name: string;
  short: string;
  /** red | orange | blue | green | mattapan | silver */
  group: string;
  color: string;
  textColor: string;
  /** ordered station ids of the longest branch */
  stops: string[];
  branches: { terminus: string; stops: string[]; shape: [number, number][] }[];
}

export interface Craving {
  id: string;
  label: string;
  emoji: string;
}

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  neighborhood: string;
  neighborhoodName: string;
  amenity: string;
  cuisine: string[];
  craving: string;
  cravings: string[];
  price: PriceTier;
  priceLabel: string;
  priceEstimated: boolean;
  isChain: boolean;
  brand: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  diet: { vegetarian: boolean; vegan: boolean; glutenFree: boolean };
  wheelchair: string | null;
  nearestStation: { id: string; name: string; lines: string[]; distanceM: number; walkMin: number };
  osm: string;
}

export const neighborhoods = neighborhoodsJson as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  NeighborhoodProps
>;
export const stations = stationsJson as Station[];
export const lines = linesJson as unknown as Line[];
export const restaurants = restaurantsJson as unknown as Restaurant[];
export const cravings = cravingsJson as Craving[];

export const neighborhoodById = new Map(neighborhoods.features.map((f) => [f.properties.id, f]));
export const stationById = new Map(stations.map((s) => [s.id, s]));
export const lineById = new Map(lines.map((l) => [l.id, l]));
export const restaurantById = new Map(restaurants.map((r) => [r.id, r]));
export const cravingById = new Map(cravings.map((c) => [c.id, c]));

export const getRestaurant = (id: string) => restaurantById.get(id);
export const restaurantsIn = (hoodId: string) => restaurants.filter((r) => r.neighborhood === hoodId);

/** Restaurants needed in a neighborhood to unlock it. */
export const UNLOCK_THRESHOLD = 3;

export const BOSTON_CENTER: [number, number] = [42.3505, -71.0759];
export const BOSTON_BOUNDS: [[number, number], [number, number]] = [
  [42.227, -71.191],
  [42.4, -70.986],
];

/** Color for a line id (falls back to T silver). */
export function lineColor(lineId: string): string {
  return lineById.get(lineId)?.color ?? "#7C878E";
}

/** One color per line *group* (all Green branches share green), for station dots. */
export function stationColor(s: Pick<Station, "lines">): string {
  const groups = new Set(s.lines.map((l) => lineById.get(l)?.group ?? l));
  if (groups.size > 1) return "#ffffff"; // transfer station
  return lineColor(s.lines[0]);
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

/** Rough walking minutes for a straight-line distance (street grid ≈ 1.3× crow-flies, 80 m/min). */
export const walkMinutes = (meters: number) => Math.max(1, Math.round((meters * 1.3) / 80));

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
export function neighborhoodAt(lat: number, lng: number): Neighborhood | null {
  for (const f of neighborhoods.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [outer, ...holes] of polys) {
      if (pointInRing(lng, lat, outer) && !holes.some((h) => pointInRing(lng, lat, h))) return f;
    }
  }
  return null;
}

/** [[south, west], [north, east]] for a neighborhood, for map.fitBounds. */
export function neighborhoodBounds(f: Neighborhood): [[number, number], [number, number]] {
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
  /** craving ids; empty = all */
  cravings: string[];
  /** price tiers; empty = all */
  prices: PriceTier[];
  location: LocationFilter;
  hideChains: boolean;
}

export const DEFAULT_FILTERS: RestaurantFilters = {
  cravings: [],
  prices: [],
  location: { kind: "anywhere" },
  hideChains: false,
};

export function filterRestaurants(list: Restaurant[], f: RestaurantFilters): Restaurant[] {
  return list.filter((r) => {
    if (f.cravings.length && !r.cravings.some((c) => f.cravings.includes(c))) return false;
    if (f.prices.length && !f.prices.includes(r.price)) return false;
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
    (f.location.kind !== "anywhere" ? 1 : 0) +
    (f.hideChains ? 1 : 0)
  );
}

// Used by /api/checkin (from the team skeleton). Keep these signatures stable.
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distanceM({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng });
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distanceMeters(aLat, aLng, bLat, bLng) / 1000;
}
