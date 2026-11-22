// Server only. Photos and extra details for one restaurant.
// 1. Google Places API (New) when GOOGLE_PLACES_API_KEY is set: real photos, rating, hours, website.
// 2. Otherwise photos from the restaurant's own website (saved by `npm run data:photos`, or fetched live).
// 3. Otherwise nothing, and the page shows what is in our OSM data. Never throws.
import { distanceMeters, type Restaurant } from "./geo";
import { safeHttpUrl, scrapeSite, type SiteScrape } from "./siteImages";
import bakedJson from "../../data/photos.json";

export interface PlacePhoto {
  url: string;
  /** who took it, shown under the photo (Google requires this) */
  author?: string;
  authorUrl?: string;
}

export interface PlaceDetails {
  source: "google" | "website" | "none";
  photos: PlacePhoto[];
  summary?: string;
  rating?: number;
  ratingCount?: number;
  openNow?: boolean;
  /** one line per day, e.g. "Monday: 11:00 AM – 9:00 PM" */
  hours?: string[];
  website?: string;
  googleMapsUrl?: string;
}

const PLACES_URL = "https://places.googleapis.com/v1";
const MAX_PHOTOS = 6;
/** Google's best match must be this close to our OSM point, or it's probably a different place. */
const MATCH_RADIUS_M = 250;
const TIMEOUT_MS = 5000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const RETRY_EMPTY_MS = 10 * 60 * 1000;

// Promises, so two parts of one page asking at once share a single lookup.
const cache = new Map<string, { at: number; value: Promise<PlaceDetails> }>();

export function getPlaceDetails(r: Restaurant): Promise<PlaceDetails> {
  const hit = cache.get(r.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = (async (): Promise<PlaceDetails> => {
    const google = await fromGoogle(r).catch(() => null);
    if (google?.photos.length) return google;
    const site = await fromWebsite(r).catch(() => null);
    // Google matched but had no photos: keep its rating and hours, borrow the website's photos.
    if (google) return { ...google, photos: site?.photos ?? [], source: site?.photos.length ? "website" : "google", summary: google.summary ?? site?.summary };
    return site ?? { source: "none", photos: [] };
  })();
  const entry = { at: Date.now(), value };
  cache.set(r.id, entry);
  // An empty result may just be a network blip, so retry it sooner.
  value.then((d) => {
    if (d.source === "none") entry.at = Date.now() - CACHE_MS + RETRY_EMPTY_MS;
  });
  return value;
}

function withTimeout(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" };
}

// ---------- Google Places API (New) ----------

interface GooglePlace {
  id: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  editorialSummary?: { text?: string };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  currentOpeningHours?: { openNow?: boolean };
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
}

const FIELDS = [
  "places.id",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.websiteUri",
  "places.editorialSummary",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.currentOpeningHours.openNow",
  "places.photos",
].join(",");

async function fromGoogle(r: Restaurant): Promise<PlaceDetails | null> {
  // One Google Cloud key often has both APIs on. If Places is off for it, the call fails and we fall back.
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `${PLACES_URL}/places:searchText`,
    withTimeout({
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: [r.name, r.address, "Boston, MA"].filter(Boolean).join(", "),
        locationBias: { circle: { center: { latitude: r.lat, longitude: r.lng }, radius: 200 } },
      }),
    }),
  );
  if (!res.ok) return null;
  const places: GooglePlace[] = (await res.json()).places ?? [];

  // Take the closest result inside the match radius.
  const place = places
    .filter((p) => p.location)
    .map((p) => ({ p, d: distanceMeters(r.lat, r.lng, p.location!.latitude, p.location!.longitude) }))
    .filter((x) => x.d <= MATCH_RADIUS_M)
    .sort((a, b) => a.d - b.d)[0]?.p;
  if (!place) return null;

  const photos = (
    await Promise.all(
      (place.photos ?? []).slice(0, MAX_PHOTOS).map(async (ph): Promise<PlacePhoto | null> => {
        try {
          // skipHttpRedirect returns a public photoUri, so the key never reaches the browser.
          const m = await fetch(
            `${PLACES_URL}/${ph.name}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${encodeURIComponent(key)}`,
            withTimeout(),
          );
          if (!m.ok) return null;
          const { photoUri } = (await m.json()) as { photoUri?: string };
          if (!photoUri) return null;
          const a = ph.authorAttributions?.[0];
          return { url: photoUri, author: a?.displayName, authorUrl: a?.uri };
        } catch {
          return null;
        }
      }),
    )
  ).filter((p): p is PlacePhoto => p !== null);

  return {
    source: "google",
    photos,
    summary: place.editorialSummary?.text,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    openNow: place.currentOpeningHours?.openNow,
    hours: place.regularOpeningHours?.weekdayDescriptions,
    website: place.websiteUri ?? r.website ?? undefined,
    googleMapsUrl: place.googleMapsUri,
  };
}

// ---------- The restaurant's own website ----------

/** Photos found ahead of time by `npm run data:photos` (checked to load). Keyed by restaurant id. */
const baked = bakedJson as Record<string, SiteScrape | undefined>;

async function fromWebsite(r: Restaurant): Promise<PlaceDetails | null> {
  const site = safeHttpUrl(r.website) ?? undefined;
  const pre = baked[r.id];
  // Saved photos are instant and work offline; only scrape live when this place wasn't scanned.
  const found = pre?.photos.length ? pre : ((await scrapeSite(r.website)) ?? pre);
  if (!found) return null;
  return {
    source: "website",
    photos: found.photos.map((url) => ({ url })),
    summary: found.summary,
    website: site,
  };
}
