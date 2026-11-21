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

const CRAVING_WORDS: Record<string, Craving> = {
  pizza: "pizza", ramen: "ramen", noodle: "ramen", taco: "tacos", burrito: "tacos",
  burger: "burgers", coffee: "coffee", cafe: "coffee", dessert: "dessert", ice: "dessert",
  chinese: "chinese", dumpling: "chinese", indian: "indian", curry: "indian", thai: "thai",
  seafood: "seafood", lobster: "seafood", sandwich: "sandwiches", sub: "sandwiches",
};

/** Keyword parse of plain English into filters. Used when there is no Gemini key. */
export function parseQuery(q: string): SearchFilters {
  const s = q.toLowerCase();
  const f: SearchFilters = {};
  for (const [word, c] of Object.entries(CRAVING_WORDS)) if (s.includes(word)) { f.craving = c; break; }
  if (/cheap|budget|broke|student|under \$?1\d\b|\$(?!\$)/.test(s)) f.maxPrice = 1;
  else if (/\$\$(?!\$)|mid|moderate/.test(s)) f.maxPrice = 2;
  f.line = LINES.find((l) => s.includes(l));
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
