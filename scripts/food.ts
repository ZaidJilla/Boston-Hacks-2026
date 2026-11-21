/**
 * data:food — OpenStreetMap (Overpass) restaurants → data/restaurants.json
 *
 * Needs data/neighborhoods.json and data/stations.json (run data:hoods and data:gtfs first).
 * Each restaurant is tagged with its neighborhood (point-in-polygon), a craving category,
 * a price tier (1–3, estimated when OSM has no price tag), isChain, and its nearest T station.
 */
import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cachedFetch, readJson, round, slugify, writeJson } from "./lib/util";

// Boston city limits, padded. Anything outside a neighborhood polygon is dropped later.
const BBOX = "42.227,-71.191,42.400,-70.986";
const QUERY = `[out:json][timeout:120];
(nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream)$"]["name"](${BBOX}););
out center tags;`;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Max restaurants kept per neighborhood (best-tagged first) so the map stays readable on a phone. */
const PER_HOOD_CAP = 40;

/** Coffee/donut mega-chains: they'd swamp the map and aren't really "eating out". */
const DROP_NAMES = new Set(["dunkin", "dunkin-donuts", "starbucks", "tim-hortons", "peet-s-coffee"]);

/** Chains that are often missing a `brand` tag in OSM. */
const KNOWN_CHAINS = new Set(
  [
    "McDonald's", "Burger King", "Wendy's", "Subway", "Chipotle", "Chipotle Mexican Grill", "Taco Bell",
    "Domino's", "Domino's Pizza", "Papa John's", "Pizza Hut", "KFC", "Popeyes", "Popeyes Louisiana Kitchen",
    "Five Guys", "Shake Shack", "Sweetgreen", "sweetgreen", "Cava", "CAVA", "Panera Bread", "Qdoba",
    "Wingstop", "Chick-fil-A", "Jersey Mike's", "Jersey Mike's Subs", "Jimmy John's", "Potbelly",
    "Pret A Manger", "Dig", "Tatte", "Tatte Bakery & Cafe", "Tatte Bakery", "Boloco", "B.GOOD", "b.good",
    "Anna's Taqueria", "Pinkberry", "Ben & Jerry's", "J.P. Licks", "Kung Fu Tea", "Gong Cha", "Chatime",
    "Cheesecake Factory", "The Cheesecake Factory", "Legal Sea Foods", "Smashburger", "IHOP", "Denny's",
    "Applebee's", "Olive Garden", "Bertucci's", "Uno Pizzeria & Grill", "Au Bon Pain", "Blaze Pizza",
    "&pizza", "Halal Guys", "The Halal Guys", "Roxy's Grilled Cheese", "Dave's Hot Chicken", "Raising Cane's",
  ].map(slugify),
);

// craving id → OSM cuisine values. Order matters: first match is the primary craving.
const CRAVINGS: { id: string; label: string; emoji: string; cuisines: string[] }[] = [
  { id: "pizza", label: "Pizza", emoji: "🍕", cuisines: ["pizza"] },
  { id: "burgers", label: "Burgers", emoji: "🍔", cuisines: ["burger", "hot_dog"] },
  { id: "chicken", label: "Chicken", emoji: "🍗", cuisines: ["chicken", "wings", "fried_chicken"] },
  { id: "tacos", label: "Tacos & Latin", emoji: "🌮", cuisines: ["mexican", "tex-mex", "tacos", "burrito", "latin_american", "colombian", "peruvian", "venezuelan", "salvadoran", "brazilian", "caribbean", "cuban", "dominican", "puerto_rican", "haitian", "jamaican", "argentinian"] },
  { id: "sushi", label: "Sushi & Japanese", emoji: "🍣", cuisines: ["sushi", "japanese", "ramen", "poke", "udon"] },
  { id: "chinese", label: "Chinese", emoji: "🥟", cuisines: ["chinese", "dim_sum", "hotpot", "hot_pot", "cantonese", "szechuan", "sichuan", "taiwanese", "dumpling", "mongolian", "shanghai"] },
  { id: "korean", label: "Korean", emoji: "🍜", cuisines: ["korean"] },
  { id: "thai-viet", label: "Thai & Viet", emoji: "🍲", cuisines: ["thai", "vietnamese", "pho", "noodle", "asian", "malaysian", "filipino", "indonesian", "burmese", "cambodian", "laotian"] },
  { id: "indian", label: "Indian", emoji: "🍛", cuisines: ["indian", "nepalese", "pakistani", "bangladeshi", "himalayan", "tibetan"] },
  { id: "mediterranean", label: "Mediterranean", emoji: "🥙", cuisines: ["mediterranean", "greek", "middle_eastern", "lebanese", "turkish", "falafel", "kebab", "gyros", "persian", "moroccan", "israeli", "ethiopian", "eritrean", "african", "shawarma"] },
  { id: "italian", label: "Italian", emoji: "🍝", cuisines: ["italian", "pasta", "italian_pizza"] },
  { id: "seafood", label: "Seafood", emoji: "🦞", cuisines: ["seafood", "fish", "oyster", "lobster", "fish_and_chips"] },
  { id: "sandwiches", label: "Sandwiches", emoji: "🥪", cuisines: ["sandwich", "deli", "sub", "bagel", "wrap", "cheesesteak", "jewish"] },
  { id: "breakfast", label: "Breakfast & Brunch", emoji: "🥞", cuisines: ["breakfast", "brunch", "diner", "crepe", "pancake", "waffle"] },
  { id: "healthy", label: "Healthy", emoji: "🥗", cuisines: ["salad", "juice", "smoothie", "vegan", "vegetarian", "organic", "bowl", "acai"] },
  { id: "american", label: "American", emoji: "🍖", cuisines: ["american", "regional", "barbecue", "bbq", "steak_house", "steak", "bar_and_grill", "southern", "local", "new_american", "comfort_food", "grill", "pub"] },
  { id: "dessert", label: "Dessert & Boba", emoji: "🍦", cuisines: ["ice_cream", "donut", "dessert", "cake", "bubble_tea", "frozen_yogurt", "cupcake", "chocolate", "gelato", "pastry", "cookie"] },
  { id: "coffee", label: "Coffee & Bakery", emoji: "☕", cuisines: ["coffee_shop", "coffee", "tea", "bakery", "cafe"] },
];

// cuisines that point to a cheap ($) or pricey ($$$) meal when there's no price tag
const CHEAP = new Set(["pizza", "burger", "hot_dog", "sandwich", "deli", "sub", "bagel", "tacos", "burrito", "chicken", "wings", "fried_chicken", "donut", "bubble_tea", "falafel", "kebab", "gyros", "shawarma", "ice_cream", "frozen_yogurt", "coffee_shop", "coffee", "juice", "smoothie", "dumpling", "crepe", "bakery", "noodle", "pho", "breakfast", "diner"]);
const PRICEY = new Set(["steak_house", "steak", "french", "fine_dining", "oyster", "lobster", "tapas", "omakase", "spanish", "new_american"]);
// neighborhoods where sit-down meals skew expensive
const PRICEY_HOODS = new Set(["back-bay", "south-boston-waterfront", "beacon-hill", "downtown", "north-end", "leather-district"]);

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
      const buf = await cachedFetch(url, "overpass-food.json", {
        method: "POST",
        body: new URLSearchParams({ data: QUERY }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json = JSON.parse(buf.toString());
      if (!Array.isArray(json.elements)) throw new Error("no elements");
      return json;
    } catch (e) {
      lastErr = e;
      // a bad response must not stay in the cache
      await import("node:fs").then((fs) =>
        fs.rmSync(require("node:path").join(__dirname, ".cache", "overpass-food.json"), { force: true }),
      );
      const wait = 2000 * 2 ** Math.floor(attempt / ENDPOINTS.length);
      console.warn(`  ${url} failed (${(e as Error).message.slice(0, 60)}), retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function cuisinesOf(t: Record<string, string>): string[] {
  const list = (t.cuisine ?? "")
    .toLowerCase()
    .split(/[;,]/)
    .map((s) => s.trim().replace(/\s+/g, "_"))
    .filter(Boolean);
  if (list.length === 0) {
    const hint = NAME_HINTS.find(([re]) => re.test(t.name));
    if (hint) list.push(hint[1]);
  }
  if (t.amenity === "ice_cream") list.push("ice_cream");
  if (t.amenity === "cafe" && list.length === 0) list.push("cafe");
  if (t["diet:vegan"] === "only") list.push("vegan");
  if (t["diet:vegetarian"] === "only") list.push("vegetarian");
  return [...new Set(list)];
}

// Name keywords used when OSM has no cuisine tag.
const NAME_HINTS: [RegExp, string][] = [
  [/pizz/i, "pizza"], [/burger/i, "burger"], [/taquer|taco|burrito|cantina|mexic/i, "mexican"],
  [/sushi|ramen|izakaya|japan/i, "japanese"], [/\bpho\b|viet|banh/i, "vietnamese"], [/thai/i, "thai"],
  [/dumpling|wok|szechuan|sichuan|china|chinese|dim sum/i, "chinese"], [/korea|bibim|k-?bbq/i, "korean"],
  [/india|tandoor|curry|masala/i, "indian"], [/falafel|shawarma|kebab|gyro|mediterr|greek/i, "mediterranean"],
  [/trattoria|osteria|ristorante|pasta|italia/i, "italian"], [/oyster|lobster|seafood|clam|fish/i, "seafood"],
  [/bagel|deli|sub\b|sandwich|hoagie/i, "sandwich"], [/pancake|breakfast|brunch|diner|crepe/i, "breakfast"],
  [/bbq|barbecue|smokehouse|steak/i, "barbecue"], [/wing|chicken/i, "chicken"], [/salad|juice|bowl/i, "salad"],
  [/bakery|bakehouse|patisserie|boulangerie/i, "bakery"], [/coffee|espresso|caf[eé]\b/i, "coffee_shop"],
  [/ice cream|gelato|creamery|boba|bubble tea|donut|dessert/i, "dessert"],
];

function cravingsOf(cuisines: string[]): string[] {
  const out: string[] = [];
  // walk cuisines in OSM order so the first-listed cuisine decides the primary craving
  for (const c of cuisines) for (const cr of CRAVINGS) if (cr.cuisines.includes(c) && !out.includes(cr.id)) out.push(cr.id);
  return out;
}

function priceOf(t: Record<string, string>, cuisines: string[], hood: string): { tier: 1 | 2 | 3; estimated: boolean } {
  const explicit = t.price ?? t["price:range"] ?? t.price_range;
  if (explicit && /^\$+$/.test(explicit.trim())) {
    return { tier: Math.min(3, explicit.trim().length) as 1 | 2 | 3, estimated: false };
  }
  if (["fast_food", "ice_cream", "food_court", "cafe"].includes(t.amenity)) return { tier: 1, estimated: true };
  if (cuisines.some((c) => PRICEY.has(c))) return { tier: 3, estimated: true };
  if (cuisines.length && cuisines.every((c) => CHEAP.has(c))) return { tier: 1, estimated: true };
  if (PRICEY_HOODS.has(hood) && (t.reservation === "yes" || t.reservation === "recommended" || cuisines.includes("seafood") || cuisines.includes("italian")))
    return { tier: 3, estimated: true };
  return { tier: 2, estimated: true };
}

function addressOf(t: Record<string, string>): string | null {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return street || null;
}

/** How complete the OSM entry is; better-tagged places are more likely to be real and open. */
function quality(t: Record<string, string>, isChain: boolean): number {
  let s = 0;
  if (t.cuisine) s += 3;
  if (t["addr:street"]) s += 2;
  if (t.website || t["contact:website"]) s += 1;
  if (t.opening_hours) s += 1;
  if (t.phone || t["contact:phone"]) s += 1;
  if (t.check_date) s += 1;
  if (!isChain) s += 2; // the game is about discovering local spots
  if (t.amenity === "restaurant") s += 1;
  return s;
}

async function main() {
  console.log("data:food");
  const hoods = readJson<FeatureCollection<Polygon | MultiPolygon>>("neighborhoods.json");
  const stations = readJson<Station[]>("stations.json");
  const stationPts = turf.featureCollection(stations.map((s) => turf.point([s.lng, s.lat], { id: s.id })));
  const hoodBoxes = hoods.features.map((f) => ({ f, bbox: turf.bbox(f) }));

  const { elements } = await fetchOverpass();
  console.log(`  ${elements.length} OSM food places in bbox`);

  const seenIds = new Set<string>();
  const all = elements
    .map((el) => {
      const t = el.tags;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null || !t.name) return null;
      if (DROP_NAMES.has(slugify(t.brand ?? t.name))) return null;
      if (t.disused === "yes" || t["disused:amenity"]) return null;

      const pt = turf.point([lng, lat]);
      const hood = hoodBoxes.find(
        ({ f, bbox }) =>
          lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && turf.booleanPointInPolygon(pt, f),
      )?.f;
      if (!hood) return null; // outside Boston proper
      const hoodId = String(hood.properties!.id);

      const cuisine = cuisinesOf(t);
      const cravings = cravingsOf(cuisine);
      const craving = cravings[0] ?? (t.amenity === "fast_food" ? "burgers" : "american");
      if (!cravings.length) cravings.push(craving);

      const isChain = Boolean(t.brand || t["brand:wikidata"]) || KNOWN_CHAINS.has(slugify(t.name));
      const price = priceOf(t, cuisine, hoodId);

      const near = turf.nearestPoint(pt, stationPts);
      const st = stations.find((s) => s.id === near.properties.id)!;
      const distanceM = Math.round(turf.distance(pt, near, { units: "meters" }));

      let id = `${slugify(t.name)}-${el.type[0]}${el.id}`;
      if (seenIds.has(id)) id += "-2";
      seenIds.add(id);

      return {
        id,
        name: t.name,
        lat: round(lat),
        lng: round(lng),
        neighborhood: hoodId,
        neighborhoodName: String(hood.properties!.name),
        amenity: t.amenity,
        cuisine,
        craving,
        cravings,
        price: price.tier,
        priceLabel: "$".repeat(price.tier),
        priceEstimated: price.estimated,
        isChain,
        brand: t.brand ?? null,
        address: addressOf(t),
        website: t.website ?? t["contact:website"] ?? null,
        phone: t.phone ?? t["contact:phone"] ?? null,
        openingHours: t.opening_hours ?? null,
        diet: {
          vegetarian: ["yes", "only"].includes(t["diet:vegetarian"]),
          vegan: ["yes", "only"].includes(t["diet:vegan"]),
          glutenFree: ["yes", "only"].includes(t["diet:gluten_free"]),
        },
        wheelchair: t.wheelchair ?? null,
        nearestStation: {
          id: st.id,
          name: st.name,
          lines: st.lines,
          distanceM,
          // ~80 m/min walking, ×1.3 for street grid vs straight line
          walkMin: Math.max(1, Math.round((distanceM * 1.3) / 80)),
        },
        osm: `${el.type}/${el.id}`,
        _q: quality(t, isChain),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // keep the best-tagged places per neighborhood
  const byHood = new Map<string, typeof all>();
  for (const r of all) byHood.set(r.neighborhood, [...(byHood.get(r.neighborhood) ?? []), r]);
  const restaurants = [...byHood.values()]
    .flatMap((list) =>
      list.sort((a, b) => b._q - a._q || a.name.localeCompare(b.name)).slice(0, PER_HOOD_CAP),
    )
    .map(({ _q, ...r }) => r)
    .sort((a, b) => a.neighborhood.localeCompare(b.neighborhood) || a.name.localeCompare(b.name));

  writeJson("restaurants.json", restaurants);
  writeJson(
    "cravings.json",
    CRAVINGS.map(({ id, label, emoji }) => ({ id, label, emoji })),
  );

  console.log(`  ${all.length} inside Boston neighborhoods → kept ${restaurants.length}`);
  for (const f of hoods.features) {
    const id = String(f.properties!.id);
    const n = restaurants.filter((r) => r.neighborhood === id).length;
    console.log(`  ${id.padEnd(24)} ${n}${n < 3 ? "  ⚠ fewer than 3 — cannot be unlocked" : ""}`);
  }
  const tally = (k: (r: (typeof restaurants)[number]) => string) =>
    Object.entries(restaurants.reduce<Record<string, number>>((m, r) => ((m[k(r)] = (m[k(r)] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
  console.log(`  cravings: ${tally((r) => r.craving)}`);
  console.log(`  price:    ${tally((r) => r.priceLabel)}`);
  console.log(`  chains:   ${tally((r) => (r.isChain ? "chain" : "local"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
