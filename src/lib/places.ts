// Server only. Photos and extra details for one restaurant.
// 1. Google Places API (New) when GOOGLE_PLACES_API_KEY is set: real photos, rating, hours, website.
// 2. Otherwise the restaurant's own website: its og:image and description.
// 3. Otherwise nothing, and the page shows what is in our OSM data. Never throws.
import { distanceMeters, type Restaurant } from "./geo";

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

  const value = (async (): Promise<PlaceDetails> =>
    (await fromGoogle(r).catch(() => null)) ??
    (await fromWebsite(r).catch(() => null)) ?? { source: "none", photos: [] })();
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
  const key = process.env.GOOGLE_PLACES_API_KEY;
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

const MAX_HTML_BYTES = 1_000_000;

function safeHttpUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** Content of <meta property|name="key" content="...">, in either attribute order. */
function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((v) => v !== undefined);
    const k = (attr("property") ?? attr("name"))?.toLowerCase();
    if (k === key) {
      const c = attr("content");
      if (c) return decodeEntities(c);
    }
  }
  return null;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fromWebsite(r: Restaurant): Promise<PlaceDetails | null> {
  // The URL comes from our committed OSM data, never from the request.
  const site = safeHttpUrl(r.website);
  if (!site) return null;

  const res = await fetch(
    site,
    withTimeout({ headers: { "User-Agent": "Mozilla/5.0 (compatible; RestaurantPreview/1.0)", Accept: "text/html" } }),
  );
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  const html = await readCapped(res);
  const finalUrl = res.url || site;

  const image = safeHttpUrl(
    metaContent(html, "og:image:secure_url") ?? metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
    finalUrl,
  )?.replace(/^http:/, "https:"); // our page is served over https; an http image would be blocked
  const summary = metaContent(html, "og:description") ?? metaContent(html, "description") ?? undefined;
  if (!image && !summary) return null;

  return {
    source: "website",
    photos: image ? [{ url: image }] : [],
    summary: summary && summary.length > 280 ? `${summary.slice(0, 277).trimEnd()}…` : summary,
    website: site,
  };
}
