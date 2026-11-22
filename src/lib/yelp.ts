// Server only. Photos of a restaurant from the Yelp Places (Fusion) API, used when we have none
// from Google or the restaurant's own website. Needs YELP_API_KEY; without it, or on any error,
// returns null so the page falls back to its placeholder. Never throws.
//
// Yelp's terms: Yelp content may not be stored for more than 24 hours, so these results are only
// kept in places.ts's in-memory cache (6 h) and are never written to data/. Anything shown from
// Yelp must be credited with a link to the business's Yelp page (see PhotoGallery).
import { distanceMeters } from "./geo";

const API = "https://api.yelp.com/v3";
const TIMEOUT_MS = 5000;
/** Yelp's listing must be this close to our OSM point to count as the same place. */
const MATCH_RADIUS_M = 200;

export interface YelpPhotos {
  photos: string[];
  /** the business's Yelp page, for attribution (keep Yelp's tracking params, per their terms) */
  url: string;
  name: string;
}

interface YelpBusiness {
  id: string;
  name: string;
  url?: string;
  image_url?: string;
  photos?: string[];
  coordinates?: { latitude?: number | null; longitude?: number | null };
}

/** Dropped before comparing: they never tell two places apart. */
const FILLER = new Set(["the", "and", "of"]);
/** Kind-of-place words: "Brown Sugar Cafe" and "Brown Sugar" are the same place, but these words
 *  alone ("Cafe", "Pizza") never identify one. */
const GENERIC = new Set([
  "restaurant", "cafe", "bar", "grill", "kitchen", "boston", "eatery", "bistro",
  "pizza", "pizzeria", "sushi", "tacos", "taqueria", "burger", "burgers", "ramen", "pho", "thai", "bbq",
  "deli", "bakery", "coffee", "tea", "noodle", "noodles", "dumpling", "dumplings", "house", "express",
]);

/** Lowercase words without accents, punctuation or filler, for comparing names across sources. */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
}

/**
 * Same place name? "BOS' Sichuan Taste" = "Bos Sichuan Taste", "Tasty Burger" = "Tasty Burger -
 * Fenway", "Brown Sugar Cafe" = "Brown Sugar"; but "Dumpling House" ≠ "Dumpling Cafe".
 * Callers also require the two to be within a short walk of each other.
 */
export function sameName(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (!wa.length || !wb.length) return false;
  if (wa.join(" ") === wb.join(" ")) return true;

  // Same once kind-of-place words are dropped, as long as something distinctive is left.
  const core = (w: string[]) => w.filter((x) => !GENERIC.has(x)).join(" ");
  if (core(wa) && core(wa) === core(wb)) return true;

  // One name is the other plus extra words (a branch or area suffix), on whole-word boundaries.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const distinctive = short.length >= 2 || (short[0].length >= 4 && !GENERIC.has(short[0]));
  if (distinctive && ` ${long.join(" ")} `.includes(` ${short.join(" ")} `)) return true;

  // Mostly the same words.
  const setB = new Set(wb);
  const shared = wa.filter((w) => setB.has(w)).length;
  return shared / new Set([...wa, ...wb]).size >= 0.6;
}

async function yelpGet<T>(path: string, key: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null; // 401 bad key, 429 rate limit, etc.
  return (await res.json()) as T;
}

const httpsOnly = (u: unknown): u is string => typeof u === "string" && u.startsWith("https://");

export async function yelpPhotos(r: { name: string; lat: number; lng: number }): Promise<YelpPhotos | null> {
  const key = process.env.YELP_API_KEY;
  if (!key) return null;
  try {
    const q = new URLSearchParams({
      term: r.name,
      latitude: String(r.lat),
      longitude: String(r.lng),
      radius: "300",
      limit: "10",
      sort_by: "distance",
    });
    const found = await yelpGet<{ businesses?: YelpBusiness[] }>(`/businesses/search?${q}`, key);
    const match = (found?.businesses ?? [])
      .filter((b) => b.coordinates?.latitude != null && b.coordinates?.longitude != null)
      .map((b) => ({ b, d: distanceMeters(r.lat, r.lng, b.coordinates!.latitude!, b.coordinates!.longitude!) }))
      .filter((x) => x.d <= MATCH_RADIUS_M && sameName(r.name, x.b.name))
      .sort((a, b) => a.d - b.d)[0]?.b;
    if (!match) return null;

    // Details has up to 3 photos on the standard plan; search only has one.
    const details = await yelpGet<YelpBusiness>(`/businesses/${encodeURIComponent(match.id)}`, key);
    const photos = [...new Set([...(details?.photos ?? []), match.image_url].filter(httpsOnly))];
    const url = details?.url ?? match.url;
    if (!photos.length || !httpsOnly(url)) return null;
    return { photos, url, name: details?.name ?? match.name };
  } catch {
    return null;
  }
}
