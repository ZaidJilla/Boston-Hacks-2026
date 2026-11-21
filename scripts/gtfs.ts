/**
 * data:gtfs — MBTA GTFS → data/stations.json + data/lines.json
 * Source: https://cdn.mbta.com/MBTA_GTFS.zip
 *
 * Lines covered: Red, Mattapan, Orange, Blue, Green B/C/D/E, Silver (SL1–SL5).
 * Each line lists its ordered stop patterns ("branches"); Red has Ashmont + Braintree.
 */
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import * as turf from "@turf/turf";
import { cachedFetch, round, slugify, writeJson } from "./lib/util";

const SRC = "https://cdn.mbta.com/MBTA_GTFS.zip";
const NETWORKS = new Set(["rapid_transit", "m_rapid_transit", "sl_rapid_transit"]);

type Row = Record<string, string>;

function csv(zip: AdmZip, name: string): Row[] {
  const entry = zip.getEntry(name);
  if (!entry) throw new Error(`missing ${name}`);
  return parse(entry.getData().toString("utf8"), { columns: true, skip_empty_lines: true, bom: true });
}

/** Stream a big CSV entry line by line, calling fn only for rows that pass the cheap prefilter. */
function eachLine(zip: AdmZip, name: string, fn: (cols: string[], idx: Record<string, number>) => void) {
  const text = zip.getEntry(name)!.getData().toString("utf8");
  let start = text.indexOf("\n");
  const header = text.slice(0, start).replace(/^﻿/, "").trim().split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  start++;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, "");
    if (line) fn(line.split(","), idx); // stop_times has no quoted commas
    start = end + 1;
  }
}

function isSubsequence(small: string[], big: string[]) {
  const s = small.join("|");
  return big.join("|").includes(s);
}

async function main() {
  console.log("data:gtfs");
  const zip = new AdmZip(await cachedFetch(SRC, "MBTA_GTFS.zip"));

  const routes = csv(zip, "routes.txt").filter((r) => NETWORKS.has(r.network_id));
  const routeById = new Map(routes.map((r) => [r.route_id, r]));
  const lineIdOf = (r: Row) => slugify(r.route_short_name && r.network_id === "sl_rapid_transit" ? r.route_short_name : r.route_id);

  const stops = csv(zip, "stops.txt");
  const stopById = new Map(stops.map((s) => [s.stop_id, s]));
  const stationOf = (stopId: string) => {
    const s = stopById.get(stopId);
    return s?.parent_station || stopId;
  };

  // trips (direction 0 only — enough to get the stop order; the other direction is the reverse)
  const trips = csv(zip, "trips.txt").filter((t) => routeById.has(t.route_id) && t.direction_id === "0");
  const tripInfo = new Map(trips.map((t) => [t.trip_id, t]));
  console.log(`  ${routes.length} routes, ${trips.length} direction-0 trips`);

  const tripStops = new Map<string, { seq: number; station: string }[]>();
  eachLine(zip, "stop_times.txt", (c, idx) => {
    const tripId = c[idx.trip_id];
    if (!tripInfo.has(tripId)) return;
    const arr = tripStops.get(tripId) ?? [];
    arr.push({ seq: Number(c[idx.stop_sequence]), station: stationOf(c[idx.stop_id]) });
    tripStops.set(tripId, arr);
  });

  // shapes
  const shapePts = new Map<string, { seq: number; lat: number; lng: number }[]>();
  for (const s of csv(zip, "shapes.txt")) {
    const arr = shapePts.get(s.shape_id) ?? [];
    arr.push({ seq: Number(s.shape_pt_sequence), lat: Number(s.shape_pt_lat), lng: Number(s.shape_pt_lon) });
    shapePts.set(s.shape_id, arr);
  }

  const stationLines = new Map<string, Set<string>>();
  const lines = routes
    .sort((a, b) => Number(a.route_sort_order) - Number(b.route_sort_order))
    .map((r) => {
      const id = lineIdOf(r);
      // group trips by their stop pattern
      const patterns = new Map<string, { stops: string[]; count: number; shapes: Map<string, number> }>();
      for (const t of trips.filter((t) => t.route_id === r.route_id)) {
        const st = tripStops.get(t.trip_id);
        if (!st || st.length < 2) continue;
        const ordered = st.sort((a, b) => a.seq - b.seq).map((s) => s.station);
        const seq = ordered.filter((s, i) => s !== ordered[i - 1]);
        const key = seq.join("|");
        const p = patterns.get(key) ?? { stops: seq, count: 0, shapes: new Map() };
        p.count++;
        if (t.shape_id) p.shapes.set(t.shape_id, (p.shapes.get(t.shape_id) ?? 0) + 1);
        patterns.set(key, p);
      }
      const sorted = [...patterns.values()].sort((a, b) => b.count - a.count || b.stops.length - a.stops.length);
      const top = sorted[0]?.count ?? 0;
      // keep the main patterns: frequent ones that aren't just a short-turn of a kept one
      const kept: typeof sorted = [];
      for (const p of sorted) {
        if (p.count < top * 0.15) continue;
        if (kept.some((k) => isSubsequence(p.stops, k.stops))) continue;
        // a longer variant replaces a kept short-turn
        const shorter = kept.findIndex((k) => isSubsequence(k.stops, p.stops));
        if (shorter >= 0) kept.splice(shorter, 1);
        kept.push(p);
      }
      kept.sort((a, b) => b.stops.length - a.stops.length);

      for (const p of kept)
        for (const s of p.stops) {
          const set = stationLines.get(s) ?? new Set();
          set.add(id);
          stationLines.set(s, set);
        }

      const branches = kept.map((p) => {
        const last = stopById.get(p.stops[p.stops.length - 1]);
        const shapeId = [...p.shapes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        let shape: [number, number][] = [];
        const pts = shapeId ? shapePts.get(shapeId) : undefined;
        if (pts) {
          const ls = turf.lineString(pts.sort((a, b) => a.seq - b.seq).map((q) => [q.lng, q.lat]));
          shape = turf
            .simplify(ls, { tolerance: 0.00005, highQuality: true })
            .geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)] as [number, number]);
        } else {
          shape = p.stops.map((s) => {
            const st = stopById.get(s)!;
            return [round(Number(st.stop_lat)), round(Number(st.stop_lon))];
          });
        }
        return { terminus: last?.stop_name ?? "", stops: p.stops, shape };
      });

      return {
        id,
        routeId: r.route_id,
        name: r.route_long_name,
        short: r.route_short_name || r.route_long_name.replace(/ Line$/, ""),
        group: r.line_id.replace(/^line-/, "").replace(/^SL.*/, "Silver").toLowerCase(),
        color: `#${r.route_color}`,
        textColor: `#${r.route_text_color}`,
        stops: branches[0]?.stops ?? [],
        branches,
      };
    })
    .filter((l) => l.stops.length > 0);

  const stations = [...stationLines.entries()]
    .map(([sid, ls]) => {
      const s = stopById.get(sid)!;
      return {
        id: sid,
        name: s.stop_name,
        lat: round(Number(s.stop_lat)),
        lng: round(Number(s.stop_lon)),
        lines: lines.map((l) => l.id).filter((l) => ls.has(l)),
        wheelchair: s.wheelchair_boarding === "1",
        municipality: s.municipality || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  writeJson("stations.json", stations);
  writeJson("lines.json", lines);
  for (const l of lines)
    console.log(`  ${l.id.padEnd(9)} ${l.branches.map((b) => `${b.stops.length} stops → ${b.terminus}`).join("; ")}`);
  console.log(`  ${stations.length} stations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
