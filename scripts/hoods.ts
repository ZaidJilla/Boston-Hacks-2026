/**
 * data:hoods — Boston neighborhood polygons → data/neighborhoods.json
 * Source: BPDA Neighborhood Boundaries (data.boston.gov)
 */
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cachedFetch, round, slugify, writeJson } from "./lib/util";

const SRC =
  "https://data.boston.gov/dataset/bf1a7b50-4c72-4637-b0fa-11d632e3aff1/resource/e5849875-a6f6-4c9c-9d8a-5048b0fbd03e/download/boston_neighborhood_boundaries.geojson";

// Not reachable by T and has no restaurants, so it could never be unlocked.
const EXCLUDE = new Set(["harbor-islands"]);

// Distinct edge colors used when a neighborhood is unlocked.
const PALETTE = [
  "#e11d48", "#f97316", "#eab308", "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#db2777", "#65a30d", "#0d9488", "#9333ea", "#ea580c",
];

function roundCoords(c: any): any {
  return typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords);
}

async function main() {
  console.log("data:hoods");
  const raw = JSON.parse((await cachedFetch(SRC, "neighborhoods.geojson")).toString()) as FeatureCollection<
    Polygon | MultiPolygon
  >;

  const features = raw.features
    .map((f) => ({ f, id: slugify(String(f.properties?.name)) }))
    .filter(({ id }) => !EXCLUDE.has(id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ f, id }, i): Feature<Polygon | MultiPolygon> => {
      const simple = turf.simplify(f, { tolerance: 0.00008, highQuality: true });
      const center = turf.pointOnFeature(f).geometry.coordinates;
      return {
        type: "Feature",
        properties: {
          id,
          name: String(f.properties?.name),
          color: PALETTE[i % PALETTE.length],
          center: [round(center[1]), round(center[0])], // [lat, lng] for Leaflet
          sqmiles: f.properties?.sqmiles ?? null,
        },
        geometry: { ...simple.geometry, coordinates: roundCoords(simple.geometry.coordinates) } as
          | Polygon
          | MultiPolygon,
      };
    });

  writeJson("neighborhoods.json", { type: "FeatureCollection", features });
  console.log(`  ${features.length} neighborhoods`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
