/**
 * data:places — OpenStreetMap (Overpass) landmarks and local stores → data/places.json
 *
 * Needs data/neighborhoods.json and data/stations.json (run data:hoods and data:gtfs first).
 * Restaurants stay in data/restaurants.json (data:food); this adds the other place types:
 *   landmark  tourism=attraction|museum|gallery, historic=*, leisure=park  (named only)
 *   shopping  shopping centers and districts: OSM shop=mall|shopping_centre plus a short curated list
 *             (Newbury Street, Downtown Crossing and similar are not tagged as areas in OSM)
 *   store     individual local shops. Off by default (INCLUDE_STORES): the app suggests shopping
 *             centers, not single stores.
 * Each place gets its neighborhood (point-in-polygon) and nearest T station, like restaurants do.
 */
import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, cachedFetch, readJson, round, slugify, writeJson } from "./lib/util";

const BBOX = "42.227,-71.191,42.400,-70.986";
const QUERY = `[out:json][timeout:180];
(
  nwr["tourism"~"^(attraction|museum|gallery)$"]["name"](${BBOX});
  nwr["historic"]["name"](${BBOX});
  nwr["leisure"="park"]["name"](${BBOX});
  nwr["shop"]["name"](${BBOX});
);
out center tags;`;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const CACHE_FILE = "overpass-places.json";
const PER_HOOD_CAP = { landmark: 25, store: 25, shopping: 5 } as const;
const INCLUDE_STORES = false;

/**
 * Shopping districts and centers OSM doesn't map as a single tagged place. Coordinates are the
 * middle of the area; neighborhood and nearest station are worked out from them below. Anything
 * that has an OSM mall within 250 m is skipped so we don't list the same place twice.
 */
/** Famous places the map shows by default, to draw people in. Matched by exact OSM name. */
const FAMOUS_NAMES = new Set([
  "Faneuil Hall", "Old North Church", "Boston Common", "Boston Public Garden", "Museum of Fine Arts",
  "Isabella Stewart Gardner Museum", "Old State House", "USS Constitution Museum", "Bunker Hill Monument",
  "Museum of Science", "Paul Revere House", "Franklin Park", "Arnold Arboretum", "Castle Island",
  "The Institute of Contemporary Art", "Granary Burying Ground", "Swan Boats", "The Mapparium",
  // Added so every neighborhood has at least 3 major landmarks (checked at the end of the run).
  "Charles River Reservation", "Out of the Blue Gallery", "McMullen Museum of Art", "Metropolitan Waterworks Museum",
  "Chestnut Hill Reservation", "The Battle of Bunker Hill Museum", "Reggie Wong Memorial Park",
  "John F. Kennedy Presidential Library and Museum", "Edward M. Kennedy Institute for the United States Senate",
  "Commonwealth Museum", "ICA Watershed", "Piers Park", "Donald McKay House", "Citgo Sign",
  "Francis D. Martini Memorial Shell", "Edmund A. Connell Fields", "Loring-Greenough House", "Jamaica Pond",
  "MassArt Art Museum", "Warren Anatomical Museum", "Mattahunt Woods", "Timothy Hoxie House",
  "Kevin W. Fitzgerald Park", "Copp's Hill Burying Ground", "Bay State Model Railroad Museum",
  "Irving W. Adams Park", "Shirley-Eustis House", "Dorchester Heights National Historic Site", "Fort Independence",
  "Boston Children's Museum", "Hood Milk Bottle", "Cyclorama Building", "Union Park", "Harriet Tubman Square",
  "Otis House Museum", "Millennium Park", "Bellevue Hill Park", "Historic Springhouse", "Bay Village Neighborhood Park",
]);

/**
 * The handful shown on the map before a neighborhood is opened: one or two per area, spread out so
 * the first view stays clean. Everything else famous appears once you open its neighborhood.
 */
const ICONIC_NAMES = new Set([
  "Fenway Park", "Museum of Fine Arts", "Isabella Stewart Gardner Museum", "Boston Common", "Faneuil Hall",
  "TD Garden", "Old North Church", "USS Constitution Museum", "Museum of Science", "Castle Island",
  "Franklin Park Zoo", "Arnold Arboretum",
]);

/**
 * Famous places OSM doesn't carry as a tagged tourist spot. Checked against OpenStreetMap (Nominatim) and
 * Wikidata; most are within 100 m. Not found anywhere, so approximate: Edgar Allan Poe Square, Chinatown Park.
 */
const CURATED_LANDMARKS: { name: string; subtype: string; lat: number; lng: number; hood?: string }[] = [
  { name: "Fenway Park", subtype: "stadium", lat: 42.3467, lng: -71.0972 },
  { name: "New England Aquarium", subtype: "attraction", lat: 42.3592, lng: -71.0495 },
  { name: "TD Garden", subtype: "stadium", lat: 42.3662, lng: -71.0621 },
  { name: "Massachusetts State House", subtype: "historic-building", lat: 42.3587, lng: -71.0638 },
  { name: "Boston Public Library", subtype: "library", lat: 42.3494, lng: -71.0782 },
  { name: "Trinity Church", subtype: "historic-church", lat: 42.3498, lng: -71.0762 },
  { name: "Boston Tea Party Ships & Museum", subtype: "museum", lat: 42.3532, lng: -71.0505 },
  { name: "Franklin Park Zoo", subtype: "zoo", lat: 42.3052, lng: -71.0889 },
  { name: "Hatch Shell", subtype: "attraction", lat: 42.3573, lng: -71.0737 },
  // Thin neighborhoods. `hood` forces the neighborhood where our polygon edge and common usage disagree.
  { name: "Harvard Stadium", subtype: "stadium", lat: 42.3665, lng: -71.1269 },
  { name: "Cocoanut Grove Fire Memorial", subtype: "historic-memorial", lat: 42.35, lng: -71.0679, hood: "bay-village" },
  { name: "Edgar Allan Poe Square", subtype: "historic-monument", lat: 42.3519, lng: -71.0675, hood: "bay-village" },
  { name: "Chinatown Gate", subtype: "historic-monument", lat: 42.3512, lng: -71.0598 },
  { name: "Chinatown Park", subtype: "park", lat: 42.3505, lng: -71.0597 },
  { name: "Stony Brook Reservation", subtype: "park", lat: 42.2609, lng: -71.1398 },
  { name: "Boston Nature Center", subtype: "attraction", lat: 42.2858, lng: -71.1042 },
  { name: "Mattapan Trolley", subtype: "attraction", lat: 42.267, lng: -71.0925 },
  { name: "Mission Church", subtype: "historic-church", lat: 42.3331, lng: -71.1001 },
  { name: "Roslindale Square", subtype: "attraction", lat: 42.2868, lng: -71.1294 },
  { name: "South Station", subtype: "historic-railway_station", lat: 42.3519, lng: -71.0552, hood: "leather-district" },
  { name: "Piers Park", subtype: "park", lat: 42.3647, lng: -71.0371, hood: "east-boston" },
  { name: "Dewey Square", subtype: "park", lat: 42.353, lng: -71.0547, hood: "leather-district" },
  { name: "Leather District Historic District", subtype: "attraction", lat: 42.351, lng: -71.0578 },
];

const OVERRIDDEN = new Set(CURATED_LANDMARKS.filter((c) => c.hood).map((c) => c.name.toLowerCase()));

const CURATED_SHOPPING: { name: string; subtype: "district" | "mall" | "market"; lat: number; lng: number }[] = [
  { name: "Newbury Street", subtype: "district", lat: 42.3495, lng: -71.081 },
  { name: "Downtown Crossing", subtype: "district", lat: 42.3555, lng: -71.06 },
  { name: "Charles Street", subtype: "district", lat: 42.3567, lng: -71.0707 },
  { name: "Faneuil Hall Marketplace", subtype: "market", lat: 42.3602, lng: -71.0548 },
  { name: "Boston Public Market", subtype: "market", lat: 42.3637, lng: -71.0578 },
  { name: "Landmark Center", subtype: "mall", lat: 42.3452, lng: -71.1002 },
  { name: "South Bay Center", subtype: "mall", lat: 42.3265, lng: -71.0605 },
  { name: "Centre Street, Jamaica Plain", subtype: "district", lat: 42.3098, lng: -71.1141 },
];

/** Shop types worth walking into to browse. Groceries, salons, phone repair and the like are out. */
const STORE_TYPES = new Set([
  "books", "clothes", "boutique", "vintage", "second_hand", "charity", "antiques", "art", "gift", "music",
  "musical_instrument", "games", "video_games", "comics", "records", "jewelry", "shoes", "bag", "florist",
  "craft", "art_supplies", "stationery", "toys", "bicycle", "sports", "outdoor", "variety_store", "photo",
  "collector", "frame", "fabric", "tea", "interior_decoration", "furniture", "pet", "garden_centre", "perfumery",
]);

/** Historic tags that are real places to visit. Plaques, markers and boundary stones are not. */
const HISTORIC_SKIP = new Set([
  "boundary_stone", "wayside_marker", "plaque", "wayside_cross", "milestone", "tomb", "yes", "no",
  "neighbourhood", "neighborhood", "district", "heritage",
]);

/** Parks, cemeteries and memorials are plentiful and drown out museums, so cap each per neighborhood. */
const SUBTYPE_CAP: Record<string, number> = { park: 8, "historic-cemetery": 2, "historic-memorial": 3, "historic-monument": 4 };

const KNOWN_CHAINS = new Set(
  [
    "Urban Outfitters", "H&M", "Zara", "Uniqlo", "Nike", "Adidas", "Apple", "Barnes & Noble", "Target", "CVS",
    "Walgreens", "GameStop", "Foot Locker", "Sephora", "Lush", "Trader Joe's", "Whole Foods", "TJ Maxx",
    "Marshalls", "Old Navy", "Gap", "Banana Republic", "American Eagle", "Forever 21", "Lululemon",
    "Patagonia", "REI", "The North Face", "Staples", "Michaels", "Five Below", "Dollar Tree", "Best Buy",
    "Anthropologie", "J.Crew", "Brooks Brothers", "Pandora", "Kay Jewelers", "Zumiez", "Journeys", "Payless",
  ].map(slugify),
);

type OsmEl = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
};
type Station = { id: string; name: string; lat: number; lng: number; lines: string[] };

async function fetchOverpass(): Promise<{ elements: OsmEl[] }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const buf = await cachedFetch(url, CACHE_FILE, {
        method: "POST",
        body: new URLSearchParams({ data: QUERY }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json = JSON.parse(buf.toString());
      if (!Array.isArray(json.elements)) throw new Error("no elements");
      return json;
    } catch (e) {
      lastErr = e;
      fs.rmSync(path.join(CACHE_DIR, CACHE_FILE), { force: true }); // a bad response must not stay cached
      const wait = 2000 * 2 ** Math.floor(attempt / ENDPOINTS.length);
      console.warn(`  ${url} failed (${(e as Error).message.slice(0, 60)}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

type Classified = { type: "landmark" | "store" | "shopping"; subtype: string } | null;
function classify(t: Record<string, string>): Classified {
  if (t["chewchoo:shopping"]) return { type: "shopping", subtype: t["chewchoo:shopping"] };
  if (t["chewchoo:landmark"]) return { type: "landmark", subtype: t["chewchoo:landmark"] };
  if (t.shop === "mall" || t.shop === "shopping_centre") return { type: "shopping", subtype: "mall" };
  if (t.shop) return INCLUDE_STORES && STORE_TYPES.has(t.shop) ? { type: "store", subtype: t.shop } : null;
  if (t.tourism === "museum") return { type: "landmark", subtype: "museum" };
  if (t.tourism === "gallery") return { type: "landmark", subtype: "gallery" };
  if (t.tourism === "attraction") return { type: "landmark", subtype: "attraction" };
  if (t.leisure === "park") return { type: "landmark", subtype: "park" };
  if (t.historic && !HISTORIC_SKIP.has(t.historic)) return { type: "landmark", subtype: `historic-${t.historic}` };
  return null;
}

/** How notable or complete the OSM entry is; higher is kept first when a neighborhood is capped. */
function quality(t: Record<string, string>): number {
  let s = 0;
  if (t.wikidata || t.wikipedia) s += 4;
  if (t.website || t["contact:website"]) s += 2;
  if (t.opening_hours) s += 1;
  if (t["addr:street"]) s += 1;
  if (t.tourism === "museum") s += 3;
  if (t.tourism === "attraction") s += 2;
  if (t.historic === "building" || t.historic === "monument" || t.historic === "ship" || t.historic === "fort") s += 1;
  if (t.check_date) s += 1;
  return s;
}

async function main() {
  console.log("data:places");
  const hoods = readJson<FeatureCollection<Polygon | MultiPolygon>>("neighborhoods.json");
  const stations = readJson<Station[]>("stations.json").filter((s) => s.lines.some((l) => l !== "silver"));
  const stationPts = turf.featureCollection(stations.map((s) => turf.point([s.lng, s.lat], { id: s.id })));
  const hoodBoxes = hoods.features.map((f) => ({ f, bbox: turf.bbox(f) }));

  const fetched = await fetchOverpass();
  const osmMalls = fetched.elements.filter((e) => e.tags?.shop === "mall" || e.tags?.shop === "shopping_centre");
  const curated: OsmEl[] = CURATED_SHOPPING.filter(
    (c) => !osmMalls.some((m) => turf.distance([c.lng, c.lat], [m.lon ?? m.center!.lon, m.lat ?? m.center!.lat], { units: "meters" }) < 250),
  ).map((c, i) => ({ type: "node", id: 9_000_000_000 + i, lat: c.lat, lon: c.lng, tags: { name: c.name, "chewchoo:shopping": c.subtype } }));
  // A curated place is skipped only if OSM already has the same place AND we would keep it: tagged as a
  // landmark and inside a neighborhood polygon (Piers Park's centroid, for one, falls outside them).
  const sameAsOsm = (c: { name: string; lat: number; lng: number }) =>
    fetched.elements.some((e) => {
      if (e.tags?.name?.toLowerCase() !== c.name.toLowerCase() || !classify(e.tags)) return false;
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (lat == null || lng == null) return false;
      if (turf.distance([c.lng, c.lat], [lng, lat], { units: "meters" }) >= 400) return false;
      return hoods.features.some((f) => turf.booleanPointInPolygon(turf.point([lng, lat]), f));
    });
  const curatedLandmarks: OsmEl[] = CURATED_LANDMARKS.filter((c) => c.hood || !sameAsOsm(c)).map((c, i) => ({
    type: "node", id: 9_100_000_000 + i, lat: c.lat, lon: c.lng,
    tags: { name: c.name, "chewchoo:landmark": c.subtype, ...(c.hood ? { "chewchoo:hood": c.hood } : {}) },
  }));
  const elements = [...fetched.elements, ...curated, ...curatedLandmarks];
  console.log(`  ${fetched.elements.length} OSM elements in bbox, ${curated.length} curated shopping and ${curatedLandmarks.length} curated landmarks added`);

  const seen = new Set<string>();
  const dupes = new Set<string>(); // same name + type within ~100 m is one place (park outlines, multipart ways)
  const all = elements
    .map((el) => {
      const t = el.tags;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null || !t.name) return null;
      if (t.name.length < 3 || /^[\d\s]+$/.test(t.name)) return null; // "26" is a house number, not a place
      if (t.disused === "yes" || t["disused:shop"] || t.abandoned === "yes" || t.access === "private") return null;
      const c = classify(t);
      if (!c) return null;
      // The curated copy with a forced neighborhood replaces any OSM entry of the same name.
      if (!t["chewchoo:landmark"] && OVERRIDDEN.has(t.name.toLowerCase())) return null;

      const isChain = Boolean(t.brand || t["brand:wikidata"]) || KNOWN_CHAINS.has(slugify(t.name));
      if (c.type === "store" && isChain) return null; // local shops only
      const isCurated = Boolean(t["chewchoo:shopping"] || t["chewchoo:landmark"]);
      const famous = Boolean(t["chewchoo:landmark"]) || (c.type !== "store" && FAMOUS_NAMES.has(t.name));

      const pt = turf.point([lng, lat]);
      const hood = t["chewchoo:hood"]
        ? hoods.features.find((f) => f.properties!.id === t["chewchoo:hood"])
        : hoodBoxes.find(
            ({ f, bbox }) =>
              lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && turf.booleanPointInPolygon(pt, f),
          )?.f;
      if (!hood) return null;

      const dupeKey = `${c.type}|${slugify(t.name)}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
      if (dupes.has(dupeKey)) return null;
      dupes.add(dupeKey);

      const near = turf.nearestPoint(pt, stationPts);
      const st = stations.find((s) => s.id === near.properties.id)!;
      const distanceM = Math.round(turf.distance(pt, near, { units: "meters" }));

      let id = `${slugify(t.name)}-${el.type[0]}${el.id}`;
      if (seen.has(id)) id += "-2";
      seen.add(id);

      return {
        id,
        type: c.type,
        subtype: c.subtype,
        name: t.name,
        lat: round(lat),
        lng: round(lng),
        neighborhood: String(hood.properties!.id),
        neighborhoodName: String(hood.properties!.name),
        isChain,
        address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null,
        website: t.website ?? t["contact:website"] ?? null,
        openingHours: t.opening_hours ?? null,
        wheelchair: t.wheelchair ?? null,
        nearestStopId: st.id,
        nearestStation: {
          id: st.id,
          name: st.name,
          lines: st.lines,
          distanceM,
          walkMin: Math.max(1, Math.round((distanceM * 1.3) / 80)),
        },
        famous,
        iconic: ICONIC_NAMES.has(t.name),
        curated: isCurated,
        osm: isCurated ? null : `${el.type}/${el.id}`,
        _q: quality(t) + (c.type === "shopping" ? 10 : 0) + (famous ? 100 : 0),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Keep the most notable places per neighborhood and type so the map stays readable on a phone.
  const groups = new Map<string, typeof all>();
  for (const p of all) groups.set(`${p.neighborhood}|${p.type}`, [...(groups.get(`${p.neighborhood}|${p.type}`) ?? []), p]);
  const places = [...groups.values()]
    .flatMap((list) => {
      const used: Record<string, number> = {};
      return list
        .sort((a, b) => b._q - a._q || a.name.localeCompare(b.name))
        .filter((p) => (used[p.subtype] = (used[p.subtype] ?? 0) + 1) <= (SUBTYPE_CAP[p.subtype] ?? Infinity))
        .slice(0, PER_HOOD_CAP[list[0].type]);
    })
    .map(({ _q, ...p }) => p)
    .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  writeJson("places.json", places);

  const count = (type: string, hood?: string) => places.filter((p) => p.type === type && (!hood || p.neighborhood === hood)).length;
  console.log(`  ${all.length} inside Boston neighborhoods before capping`);
  console.log(`  kept: ${count("landmark")} landmarks, ${count("shopping")} shopping, ${count("store")} stores`);
  console.log(`  ${"neighborhood".padEnd(24)} landmark  shopping  store`);
  for (const f of hoods.features) {
    const id = String(f.properties!.id);
    console.log(`  ${id.padEnd(24)} ${String(count("landmark", id)).padStart(8)}  ${String(count("shopping", id)).padStart(8)}  ${String(count("store", id)).padStart(5)}`);
  }
  const tally = (type: string) =>
    Object.entries(places.filter((p) => p.type === type).reduce<Record<string, number>>((m, p) => ((m[p.subtype] = (m[p.subtype] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
  const thin = hoods.features
    .map((f) => [String(f.properties!.id), places.filter((p) => p.famous && p.neighborhood === f.properties!.id).length] as const)
    .filter(([, n]) => n < 3);
  console.log(thin.length ? `  ⚠ fewer than 3 major landmarks: ${thin.map(([id, n]) => `${id}:${n}`).join(", ")}` : "  every neighborhood has at least 3 major landmarks");
  console.log(`  iconic (shown before opening a neighborhood): ${places.filter((p) => p.iconic).map((p) => p.name).join(", ")}`);
  console.log(`  famous: ${places.filter((p) => p.famous).map((p) => `${p.name} (${p.neighborhood})`).join("; ")}`);
  console.log(`  landmark subtypes: ${tally("landmark")}`);
  console.log(`  shopping:          ${places.filter((p) => p.type === "shopping").map((p) => `${p.name} (${p.neighborhood}, ${p.nearestStation.name})`).join("; ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
