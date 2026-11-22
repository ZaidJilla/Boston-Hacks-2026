/**
 * data:photos — restaurant websites → data/photos.json
 *
 * Needs data/restaurants.json (run data:food first). For each restaurant with a website, finds up to
 * 5 photos on it and checks each one actually loads and isn't an icon. The restaurant page shows
 * these instantly, with no network, when there's no Google Places key.
 *
 * Re-running keeps earlier results for sites that fail this time. Pass --fresh to start over.
 */
import { scrapeSite, type SiteScrape } from "../src/lib/siteImages";
import { readJson, writeJson } from "./lib/util";

type R = { id: string; name: string; website: string | null };
const CONCURRENCY = 16;

async function main() {
  console.log("data:photos");
  const restaurants = readJson<R[]>("restaurants.json");
  const previous = process.argv.includes("--fresh") ? {} : readJson<Record<string, SiteScrape>>("photos.json");
  const ids = new Set(restaurants.map((r) => r.id));
  const out: Record<string, SiteScrape> = {};
  for (const [id, v] of Object.entries(previous)) if (ids.has(id)) out[id] = v;

  const todo = restaurants.filter((r) => r.website);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < todo.length) {
        const r = todo[next++];
        const found = await scrapeSite(r.website, { verify: true });
        // keep an older, better result if the site is down today
        if (found && found.photos.length >= (out[r.id]?.photos.length ?? 0)) out[r.id] = found;
        if (++done % 50 === 0) console.log(`  ${done}/${todo.length}`);
      }
    }),
  );

  // stable order so diffs stay readable
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeJson("photos.json", sorted);

  const counts = restaurants.map((r) => sorted[r.id]?.photos.length ?? 0);
  const withPhotos = counts.filter((n) => n > 0).length;
  console.log(`  ${restaurants.length} restaurants, ${todo.length} with a website`);
  console.log(`  ${withPhotos} have photos (${Math.round((withPhotos / restaurants.length) * 100)}%), ${counts.reduce((a, b) => a + b, 0)} photos total`);
  console.log(`  no website: ${restaurants.length - todo.length} — add GOOGLE_PLACES_API_KEY for photos of these`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
