// Builds data/graph.json, the routing graph for the trip planner (subway, light rail, bus).
// Run: npm run data:graph. Downloads the MBTA GTFS zip once into scripts/.cache (gitignored).
//
// Output (compact, index based):
//   routes: [{ id, short, long, type, color, line?, headwayMin }]
//   nodes:  [[stopId, lat, lng, name]]            (child platforms are merged into their parent station)
//   edges:  [fromIdx, toIdx, routeIdx, seconds]   (one directed edge per consecutive stop pair, mean ride time)
//
// Times come from a representative weekday (next Tuesday's active services).
import AdmZip from "adm-zip";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";

const GTFS_URL = "https://cdn.mbta.com/MBTA_GTFS.zip";
const CACHE = "scripts/.cache/MBTA_GTFS.zip";
const KEEP_TYPES = new Set(["0", "1", "3"]); // light rail, subway, bus. No commuter rail or ferry.

type Row = Record<string, string>;
const csv = (zip: AdmZip, name: string): Row[] => {
  const e = zip.getEntry(name);
  return e ? parseSync(e.getData(), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) : [];
};
const secs = (t: string) => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

function lineFor(id: string): string | undefined {
  if (id.startsWith("Green")) return "green";
  if (id === "Red" || id === "Mattapan") return "red";
  if (id === "Orange") return "orange";
  if (id === "Blue") return "blue";
  if (/^7(4[1-9]|5\d)$/.test(id)) return "silver"; // Silver Line
  return undefined;
}

function nextTuesday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
  return d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

async function main() {
  if (!existsSync(CACHE)) {
    console.log("Downloading MBTA GTFS...");
    mkdirSync("scripts/.cache", { recursive: true });
    const res = await fetch(GTFS_URL);
    if (!res.ok) throw new Error(`GTFS download failed: ${res.status}`);
    writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const zip = new AdmZip(CACHE);

  // routes
  const routeRows = csv(zip, "routes.txt").filter((r) => KEEP_TYPES.has(r.route_type));
  const routeInfo = new Map<string, { idx: number; row: Row }>();
  routeRows.forEach((r, i) => routeInfo.set(r.route_id, { idx: i, row: r }));

  // active services on a representative weekday
  const date = ymd(nextTuesday());
  const active = new Set<string>();
  for (const c of csv(zip, "calendar.txt"))
    if (c.tuesday === "1" && c.start_date <= date && date <= c.end_date) active.add(c.service_id);
  for (const c of csv(zip, "calendar_dates.txt")) {
    if (c.date !== date) continue;
    if (c.exception_type === "1") active.add(c.service_id);
    else if (c.exception_type === "2") active.delete(c.service_id);
  }
  if (!active.size) for (const c of csv(zip, "calendar.txt")) if (c.tuesday === "1") active.add(c.service_id);
  console.log(`Reference date ${date}, ${active.size} active services`);

  const tripRoute = new Map<string, { route: string; dir: string }>();
  for (const t of csv(zip, "trips.txt"))
    if (routeInfo.has(t.route_id) && active.has(t.service_id)) tripRoute.set(t.trip_id, { route: t.route_id, dir: t.direction_id });

  // stops -> nodes (merge platforms into parent stations)
  const stopRows = csv(zip, "stops.txt");
  const byId = new Map(stopRows.map((s) => [s.stop_id, s]));
  const nodeOf = (stopId: string) => {
    const s = byId.get(stopId);
    return s?.parent_station || stopId;
  };

  // stream stop_times, one trip at a time (file is sorted by trip_id)
  const edgeAgg = new Map<string, { from: string; to: string; route: string; sum: number; n: number }>();
  const peakStarts = new Map<string, number>(); // route|dir -> trips leaving first stop 12:00-14:00
  let cur = "";
  let buf: { seq: number; node: string; arr: number; dep: number }[] = [];

  const flush = () => {
    const tr = tripRoute.get(cur);
    if (tr && buf.length > 1) {
      buf.sort((a, b) => a.seq - b.seq);
      const first = buf[0].dep;
      if (first >= 12 * 3600 && first < 14 * 3600) {
        const k = `${tr.route}|${tr.dir}`;
        peakStarts.set(k, (peakStarts.get(k) ?? 0) + 1);
      }
      for (let i = 1; i < buf.length; i++) {
        const a = buf[i - 1], b = buf[i];
        const dt = b.arr - a.dep;
        if (a.node === b.node || dt <= 0 || dt > 3600) continue;
        const key = `${a.node}>${b.node}>${tr.route}`;
        const e = edgeAgg.get(key);
        if (e) { e.sum += dt; e.n++; } else edgeAgg.set(key, { from: a.node, to: b.node, route: tr.route, sum: dt, n: 1 });
      }
    }
    buf = [];
  };

  const entry = zip.getEntry("stop_times.txt");
  if (!entry) throw new Error("stop_times.txt missing");
  const parser = Readable.from([entry.getData()]).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const r of parser as AsyncIterable<Row>) {
    if (r.trip_id !== cur) { flush(); cur = r.trip_id; }
    if (!tripRoute.has(cur) || !r.arrival_time || !r.departure_time) continue;
    buf.push({ seq: Number(r.stop_sequence), node: nodeOf(r.stop_id), arr: secs(r.arrival_time), dep: secs(r.departure_time) });
  }
  flush();

  // headway per route = 120 min / mean peak trips per direction
  const headway = (routeId: string) => {
    const counts = ["0", "1"].map((d) => peakStarts.get(`${routeId}|${d}`) ?? 0).filter((n) => n > 0);
    if (!counts.length) return 30;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    return Math.min(60, Math.max(2, Math.round(120 / mean)));
  };

  // assemble compact output
  const nodeIdx = new Map<string, number>();
  const nodes: [string, number, number, string][] = [];
  const idxOf = (id: string) => {
    let i = nodeIdx.get(id);
    if (i === undefined) {
      const s = byId.get(id);
      i = nodes.length;
      nodeIdx.set(id, i);
      nodes.push([id, Math.round(Number(s?.stop_lat) * 1e5) / 1e5, Math.round(Number(s?.stop_lon) * 1e5) / 1e5, s?.stop_name ?? id]);
    }
    return i;
  };
  const edges: [number, number, number, number][] = [];
  const usedRoutes = new Set<string>();
  for (const e of edgeAgg.values()) {
    edges.push([idxOf(e.from), idxOf(e.to), routeInfo.get(e.route)!.idx, Math.round(e.sum / e.n)]);
    usedRoutes.add(e.route);
  }
  const routes = routeRows.map((r) => ({
    id: r.route_id,
    short: r.route_short_name || r.route_long_name,
    long: r.route_long_name,
    type: Number(r.route_type),
    color: r.route_color ? `#${r.route_color}` : "#7C878E",
    line: lineFor(r.route_id),
    headwayMin: headway(r.route_id),
  }));

  // child platform ids -> node index, so alerts that name a platform match our merged stations
  const aliases: [string, number][] = [];
  for (const s of stopRows) {
    const idx = s.parent_station ? nodeIdx.get(s.parent_station) : undefined;
    if (idx !== undefined) aliases.push([s.stop_id, idx]);
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/graph.json", JSON.stringify({ generated: new Date().toISOString(), referenceDate: date, routes, nodes, edges, aliases }));
  console.log(`Wrote data/graph.json: ${routes.length} routes (${usedRoutes.size} with service), ${nodes.length} stops, ${edges.length} edges`);
}

main().catch((e) => { console.error(e); process.exit(1); });
