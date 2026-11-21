// Restaurant filtering shared by the Mastra tool and the no-key fallback.
// Plain TypeScript, no server-only imports, so it is safe anywhere.
import { restaurants, getStation, stations } from "./data";
import type { Craving, LineId, PriceTier, Restaurant } from "./types";

export const CRAVINGS: Craving[] = [
  "pizza", "ramen", "tacos", "burgers", "coffee", "dessert",
  "chinese", "indian", "thai", "seafood", "sandwiches", "other",
];
export const LINES: LineId[] = ["red", "orange", "green", "blue", "silver"];

export interface SearchFilters {
  craving?: Craving;
  maxPrice?: PriceTier;
  line?: LineId;
  neighborhood?: string; // Neighborhood.id
  independentOnly?: boolean;
  limit?: number;
}

export function searchRestaurants(f: SearchFilters): Restaurant[] {
  return restaurants
    .filter((r) => !f.craving || r.craving === f.craving)
    .filter((r) => !f.maxPrice || r.price <= f.maxPrice)
    .filter((r) => !f.neighborhood || r.neighborhood === f.neighborhood)
    .filter((r) => !f.independentOnly || !r.isChain)
    .filter((r) => !f.line || getStation(r.nearestStopId)?.lines.includes(f.line))
    .slice(0, f.limit ?? 5);
}

export interface RelaxedSearch {
  results: Restaurant[];
  exact: boolean; // false when filters had to be loosened to find anything
  dropped: string[]; // human labels of the filters that were loosened, in order
}

// Loosened in this order: location matters most to someone on foot, craving next.
const RELAX_ORDER: [keyof SearchFilters, string][] = [
  ["independentOnly", "independent-only"],
  ["line", "T line"],
  ["maxPrice", "price limit"],
  ["neighborhood", "neighborhood"],
  ["craving", "craving"],
];

/** Search, and if nothing matches, loosen one filter at a time until something does. */
export function searchWithRelaxation(f: SearchFilters): RelaxedSearch {
  const cur: SearchFilters = { ...f };
  const dropped: string[] = [];
  let results = searchRestaurants(cur);
  for (const [key, label] of RELAX_ORDER) {
    if (results.length) break;
    if (cur[key] === undefined) continue;
    delete cur[key];
    dropped.push(label);
    results = searchRestaurants(cur);
  }
  return { results, exact: dropped.length === 0, dropped };
}

/** Neighborhood ids present in the data, e.g. "back-bay". */
export const NEIGHBORHOOD_IDS: string[] = [...new Set(restaurants.map((r) => r.neighborhood))];

// Word-start patterns, so "ice" doesn't match "nice" and "sub" doesn't match "subway".
const CRAVING_WORDS: [RegExp, Craving][] = [
  [/\bpizza/, "pizza"], [/\bramen/, "ramen"], [/\bnoodle/, "ramen"], [/\bsushi/, "ramen"], [/\bboba/, "dessert"], [/\btaco/, "tacos"], [/\bburrito/, "tacos"],
  [/\bburger/, "burgers"], [/\bcoffee/, "coffee"], [/\bcafe/, "coffee"], [/\bdessert/, "dessert"], [/\bice\b/, "dessert"],
  [/\bchinese/, "chinese"], [/\bdumpling/, "chinese"], [/\bindian/, "indian"], [/\bcurry/, "indian"], [/\bthai\b/, "thai"],
  [/\bseafood/, "seafood"], [/\blobster/, "seafood"], [/\bsandwich/, "sandwiches"], [/\bsubs?\b/, "sandwiches"],
];

/** Keyword parse of plain English into filters. Used when there is no Gemini key. */
export function parseQuery(q: string): SearchFilters {
  const s = q.toLowerCase();
  const f: SearchFilters = {};
  for (const [re, c] of CRAVING_WORDS) if (re.test(s)) { f.craving = c; break; }
  if (/cheap|budget|broke|student|under \$?1\d\b|(^|[^$])\$(?!\$)/.test(s)) f.maxPrice = 1;
  else if (/(^|[^$])\$\$(?!\$)|\bmid\b|moderate/.test(s)) f.maxPrice = 2;
  f.line = LINES.find((l) => new RegExp(`\\b${l}\\b`).test(s));
  f.neighborhood = NEIGHBORHOOD_IDS.find((id) => s.includes(id.replace(/-/g, " ")));
  if (/indie|independent|local|not a chain/.test(s)) f.independentOnly = true;
  return f;
}

export function nearestStation(lat: number, lng: number) {
  let best = stations[0];
  let bestD = Infinity;
  for (const st of stations) {
    const d = (st.lat - lat) ** 2 + (st.lng - lng) ** 2;
    if (d < bestD) { best = st; bestD = d; }
  }
  return best;
}
