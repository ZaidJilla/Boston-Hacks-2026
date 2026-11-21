/**
 * data:gtfs — MBTA GTFS → data/stations.json + data/lines.json
 * Source: https://cdn.mbta.com/MBTA_GTFS.zip
 *
 * Output follows the shared contract in src/lib/types.ts:
 *   Station { id, name, lat, lng, lines: LineId[] }
 *   Line    { id: LineId, name, color, stopIds: string[] }   // LineId = red|orange|green|blue|silver
 * Extra fields (safe to ignore): Station.routes, Line.branches (per-route stop order, track shape,
 * and scheduled minutes between consecutive stops).
 *
 * Mattapan is folded into "red" (MBTA treats it as part of the Red Line).
 */
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import * as turf from "@turf/turf";
import { cachedFetch, round, writeJson } from "./lib/util";

const SRC = "https://cdn.mbta.com/MBTA_GTFS.zip";
const NETWORKS = new Set(["rapid_transit", "m_rapid_transit", "sl_rapid_transit"]);

type LineId = "red" | "orange" | "green" | "blue" | "silver";
const LINE_META: Record<LineId, { name: string; color: string }> = {
  red: { name: "Red Line", color: "#DA291C" },
  orange: { name: "Orange Line", color: "#ED8B00" },
  green: { name: "Green Line", color: "#00843D" },
  blue: { name: "Blue Line", color: "#003DA5" },
  silver: { name: "Silver Line", color: "#7C878E" },
};
const LINE_ORDER: LineId[] = ["red", "orange", "green", "blue", "silver"];

type Row = Record<string, string>;

function csv(zip: AdmZip, name: string): Row[] {
  const entry = zip.getEntry(name);
  if (!entry) throw new Error(`missing ${name}`);
  return parse(entry.getData().toString("utf8"), { columns: true, skip_empty_lines: true, bom: true });
}

/** Stream a big CSV entry line by line (stop_times.txt is ~110 MB). */
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

/** "25:03:00" → seconds (GTFS times can pass 24h). */
const toSec = (t: string) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

const isSubsequence = (small: string[], big: string[]) => big.join("|").includes(small.join("|"));

function lineOf(r: Row): LineId {
  const id = r.line_id.replace(/^line-/, "").toLowerCase();
  if (id === "mattapan") return "red";
  if (id.startsWith("sl")) return "silver";
  return id as LineId;
}

async function main() {
  console.log("data:gtfs");
  const zip = new AdmZip(await cachedFetch(SRC, "MBTA_GTFS.zip"));

  const routes = csv(zip, "routes.txt")
    .filter((r) => NETWORKS.has(r.network_id))
    .sort((a, b) => Number(a.route_sort_order) - Number(b.route_sort_order));
  const routeById = new Map(routes.map((r) => [r.route_id, r]));

  const stops = csv(zip, "stops.txt");
  const stopById = new Map(stops.map((s) => [s.stop_id, s]));
  const stationOf = (stopId: string) => stopById.get(stopId)?.parent_station || stopId;

  // direction 0 is enough for stop order; the other direction is the reverse
  const trips = csv(zip, "trips.txt").filter((t) => routeById.has(t.route_id) && t.direction_id === "0");
  const tripIds = new Set(trips.map((t) => t.trip_id));
  console.log(`  ${routes.length} routes, ${trips.length} direction-0 trips`);

  const tripStops = new Map<string, { seq: number; station: string; arr: number; dep: number }[]>();
  eachLine(zip, "stop_times.txt", (c, idx) => {
    const tripId = c[idx.trip_id];
    if (!tripIds.has(tripId)) return;
    const arr = tripStops.get(tripId) ?? [];
    arr.push({
      seq: Number(c[idx.stop_sequence]),
      station: stationOf(c[idx.stop_id]),
      arr: toSec(c[idx.arrival_time]),
      dep: toSec(c[idx.departure_time]),
    });
    tripStops.set(tripId, arr);
  });

  const shapePts = new Map<string, { seq: number; lat: number; lng: number }[]>();
  for (const s of csv(zip, "shapes.txt")) {
    const arr = shapePts.get(s.shape_id) ?? [];
    arr.push({ seq: Number(s.shape_pt_sequence), lat: Number(s.shape_pt_lat), lng: Number(s.shape_pt_lon) });
    shapePts.set(s.shape_id, arr);
  }

  type Pattern = { stops: string[]; count: number; shapes: Map<string, number>; hops: number[][] };
  const stationLines = new Map<string, Set<LineId>>();
  const stationRoutes = new Map<string, Set<string>>();

  const branchesByLine = new Map<LineId, ReturnType<typeof buildBranch>[]>();

  function buildBranch(r: Row, p: Pattern) {
    const shapeId = [...p.shapes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const pts = shapeId ? shapePts.get(shapeId) : undefined;
    const shape: [number, number][] = pts
      ? turf
          .simplify(turf.lineString(pts.sort((a, b) => a.seq - b.seq).map((q) => [q.lng, q.lat])), {
            tolerance: 0.00005,
            highQuality: true,
          })
          .geometry.coordinates.map(([lng, lat]) => [round(lat), round(lng)])
      : p.stops.map((s) => [round(Number(stopById.get(s)!.stop_lat)), round(Number(stopById.get(s)!.stop_lon))]);
    const segmentMinutes = p.hops.map((h) => Math.max(1, Math.round(median(h) / 60)));
    return {
      routeId: r.route_id,
      name: r.route_short_name ? `${r.route_long_name.replace(/ - .*/, "")} (${r.route_short_name})` : r.route_long_name,
      terminus: stopById.get(p.stops[p.stops.length - 1])?.stop_name ?? "",
      stops: p.stops,
      /** scheduled minutes from stops[i] to stops[i+1] (median across trips) */
      segmentMinutes,
      totalMinutes: segmentMinutes.reduce((a, b) => a + b, 0),
      shape,
    };
  }

  for (const r of routes) {
    const line = lineOf(r);
    const patterns = new Map<string, Pattern>();
    for (const t of trips.filter((t) => t.route_id === r.route_id)) {
      const st = tripStops.get(t.trip_id);
      if (!st || st.length < 2) continue;
      const ordered = st.sort((a, b) => a.seq - b.seq).filter((s, i, a) => s.station !== a[i - 1]?.station);
      const seq = ordered.map((s) => s.station);
      const key = seq.join("|");
      const p = patterns.get(key) ?? { stops: seq, count: 0, shapes: new Map(), hops: seq.slice(1).map((): number[] => []) };
      p.count++;
      ordered.slice(1).forEach((s, i) => p.hops[i].push(s.arr - ordered[i].dep));
      if (t.shape_id) p.shapes.set(t.shape_id, (p.shapes.get(t.shape_id) ?? 0) + 1);
      patterns.set(key, p);
    }
    const sorted = [...patterns.values()].sort((a, b) => b.count - a.count || b.stops.length - a.stops.length);
    const top = sorted[0]?.count ?? 0;
    // keep the main patterns: frequent ones that aren't just a short-turn of a kept one
    const kept: Pattern[] = [];
    for (const p of sorted) {
      if (p.count < top * 0.15) continue;
      if (kept.some((k) => isSubsequence(p.stops, k.stops))) continue;
      const shorter = kept.findIndex((k) => isSubsequence(k.stops, p.stops));
      if (shorter >= 0) kept.splice(shorter, 1);
      kept.push(p);
    }
    kept.sort((a, b) => b.stops.length - a.stops.length);

    for (const p of kept)
      for (const s of p.stops) {
        (stationLines.get(s) ?? stationLines.set(s, new Set()).get(s)!).add(line);
        (stationRoutes.get(s) ?? stationRoutes.set(s, new Set()).get(s)!).add(r.route_id);
      }
    branchesByLine.set(line, [...(branchesByLine.get(line) ?? []), ...kept.map((p) => buildBranch(r, p))]);
  }

  const lines = LINE_ORDER.filter((id) => branchesByLine.has(id)).map((id) => {
    const branches = branchesByLine.get(id)!;
    // Ordered stop list for the whole line: longest branch first, then each other branch's
    // stops that aren't on it yet, in that branch's order.
    const stopIds: string[] = [];
    for (const b of [...branches].sort((a, z) => z.stops.length - a.stops.length))
      for (const s of b.stops) if (!stopIds.includes(s)) stopIds.push(s);
    return { id, ...LINE_META[id], stopIds, branches };
  });

  const stations = [...stationLines.entries()]
    .map(([sid, ls]) => {
      const s = stopById.get(sid)!;
      return {
        id: sid,
        name: s.stop_name,
        lat: round(Number(s.stop_lat)),
        lng: round(Number(s.stop_lon)),
        lines: LINE_ORDER.filter((l) => ls.has(l)),
        routes: routes.map((r) => r.route_id).filter((r) => stationRoutes.get(sid)!.has(r)),
        wheelchair: s.wheelchair_boarding === "1",
        municipality: s.municipality || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  writeJson("stations.json", stations);
  writeJson("lines.json", lines);
  for (const l of lines) {
    console.log(`  ${l.id.padEnd(7)} ${l.stopIds.length} stops`);
    for (const b of l.branches)
      console.log(`    ${b.routeId.padEnd(9)} ${b.stops.length} stops → ${b.terminus}, ${b.totalMinutes} min`);
  }
  console.log(`  ${stations.length} stations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
