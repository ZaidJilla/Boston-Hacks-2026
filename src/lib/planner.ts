// Server only. Trip planner over data/graph.json (built from MBTA GTFS by scripts/graph.ts).
// Dijkstra over (stop, route) states: riding a route costs its mean GTFS ride time, boarding a
// route costs half its headway, and walking links connect nearby stops and the trip endpoints.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { distanceMeters } from "./geo";
import type { RouteStep } from "./types";

interface GraphFile {
  routes: { id: string; short: string; long: string; type: number; color: string; line?: string; headwayMin: number }[];
  nodes: [string, number, number, string][];
  edges: [number, number, number, number][];
  aliases?: [string, number][];
}
interface Edge { to: number; route: number; sec: number }

interface Loaded {
  g: GraphFile;
  out: Edge[][];
  routesAt: number[][];
  grid: Map<string, number[]>;
  aliasesOf: Map<number, string[]>;
}

const WALK_M_PER_MIN = 80;
const DETOUR = 1.3; // streets are not straight lines
const CELL = 0.004; // degrees, about 440 m
const TRANSFER_WALK_M = 250;
const ENDPOINT_WALK_M = 1000;
const MAX_MIN = 150;

let cache: Loaded | null | undefined;

function load(): Loaded | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), "data", "graph.json");
  if (!existsSync(file)) return (cache = null);
  const g = JSON.parse(readFileSync(file, "utf8")) as GraphFile;
  const out: Edge[][] = g.nodes.map(() => []);
  const routeSets: Set<number>[] = g.nodes.map(() => new Set());
  for (const [a, b, r, sec] of g.edges) {
    out[a].push({ to: b, route: r, sec });
    routeSets[a].add(r);
  }
  const grid = new Map<string, number[]>();
  g.nodes.forEach(([, lat, lng], i) => {
    const k = `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const aliasesOf = new Map<number, string[]>();
  for (const [id, idx] of g.aliases ?? []) (aliasesOf.get(idx) ?? aliasesOf.set(idx, []).get(idx)!).push(id);
  return (cache = { g, out, routesAt: routeSets.map((s) => [...s]), grid, aliasesOf });
}

export const plannerReady = () => load() !== null;

const walkMin = (meters: number) => (meters * DETOUR) / WALK_M_PER_MIN;

function near(L: Loaded, lat: number, lng: number, maxM: number, limit: number) {
  const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL);
  // Cells are fixed in degrees, so a longitude cell is narrower than a latitude cell.
  const cellLatM = CELL * 111_320;
  const reachY = Math.ceil(maxM / cellLatM);
  const reachX = Math.ceil(maxM / (cellLatM * Math.cos((lat * Math.PI) / 180)));
  const found: { i: number; m: number }[] = [];
  for (let dy = -reachY; dy <= reachY; dy++)
    for (let dx = -reachX; dx <= reachX; dx++)
      for (const i of L.grid.get(`${cy + dy},${cx + dx}`) ?? []) {
        const m = distanceMeters(lat, lng, L.g.nodes[i][1], L.g.nodes[i][2]);
        if (m <= maxM && L.routesAt[i].length) found.push({ i, m });
      }
  return found.sort((a, b) => a.m - b.m).slice(0, limit);
}

// tiny binary min-heap
class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(c: number, s: number) {
    const a = this.a; a.push([c, s]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop(): [number, number] {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

export interface Plan {
  steps: RouteStep[];
  durationMin: number;
  routeIds: string[];
  /** Every stop id the rider boards, passes, or exits at (stations plus their platform ids). */
  stopIds: string[];
  /** First ride, so live predictions can replace the planned wait. */
  firstBoard?: { stopId: string; toStopId: string; routeId: string; plannedWaitMin: number; stepIndex: number };
}

type Prev = { from: number; kind: "start" | "board" | "ride" | "alight" | "walk"; min: number };

export function plan(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): Plan | null {
  const L = load();
  if (!L) return null;
  const { g, out, routesAt, aliasesOf } = L;
  const R = g.routes.length;
  const WALK = R; // slot meaning "on foot / just got off"
  const sid = (node: number, slot: number) => node * (R + 1) + slot;

  const starts = near(L, origin.lat, origin.lng, ENDPOINT_WALK_M, 20);
  const ends = new Map(near(L, dest.lat, dest.lng, ENDPOINT_WALK_M, 20).map((e) => [e.i, walkMin(e.m)]));
  if (!starts.length || !ends.size) return null;

  const boardCost = (r: number) => Math.min(15, Math.max(1, g.routes[r].headwayMin / 2));
  const dist = new Map<number, number>();
  const prev = new Map<number, Prev>();
  const heap = new Heap();
  for (const s of starts) {
    const c = walkMin(s.m), id = sid(s.i, WALK);
    if (c < (dist.get(id) ?? Infinity)) { dist.set(id, c); prev.set(id, { from: -1, kind: "start", min: c }); heap.push(c, id); }
  }

  const relax = (to: number, cost: number, p: Prev) => {
    if (cost < (dist.get(to) ?? Infinity) && cost <= MAX_MIN) { dist.set(to, cost); prev.set(to, p); heap.push(cost, to); }
  };

  let best = Infinity, bestState = -1;
  while (heap.size) {
    const [cost, id] = heap.pop();
    if (cost > (dist.get(id) ?? Infinity) || cost >= best) continue;
    const node = Math.floor(id / (R + 1)), slot = id % (R + 1);

    if (slot === WALK) {
      const wEnd = ends.get(node);
      if (wEnd !== undefined && cost + wEnd < best) { best = cost + wEnd; bestState = id; }
      for (const r of routesAt[node]) relax(sid(node, r), cost + boardCost(r), { from: id, kind: "board", min: boardCost(r) });
      for (const n of near(L, g.nodes[node][1], g.nodes[node][2], TRANSFER_WALK_M, 12)) {
        if (n.i === node) continue;
        const w = walkMin(n.m);
        relax(sid(n.i, WALK), cost + w, { from: id, kind: "walk", min: w });
      }
    } else {
      relax(sid(node, WALK), cost, { from: id, kind: "alight", min: 0 });
      for (const e of out[node]) if (e.route === slot) relax(sid(e.to, slot), cost + e.sec / 60, { from: id, kind: "ride", min: e.sec / 60 });
    }
  }
  if (bestState < 0) return null;

  // walk the path back, then rebuild forward as steps
  const path: { id: number; p: Prev }[] = [];
  for (let id = bestState; id !== -1; id = prev.get(id)!.from) path.push({ id, p: prev.get(id)! });
  path.reverse();

  const nodeName = (id: number) => g.nodes[Math.floor(id / (R + 1))][3];
  const steps: RouteStep[] = [];
  const routeIds: string[] = [];
  let firstBoard: Plan["firstBoard"];
  let walkAcc = 0, walkTo = "";
  let ride: { r: number; wait: number; min: number } | null = null;

  const flushWalk = () => {
    if (walkAcc > 0.5) steps.push({ mode: "walk", label: `Walk ${Math.max(1, Math.round(walkAcc))} min to ${walkTo}`, minutes: Math.max(1, Math.round(walkAcc)) });
    walkAcc = 0;
  };

  for (const { id, p } of path) {
    const slot = id % (R + 1);
    if (p.kind === "start" || p.kind === "walk") { walkAcc += p.min; walkTo = nodeName(id); }
    else if (p.kind === "board") { flushWalk(); ride = { r: slot, wait: p.min, min: 0 }; }
    else if (p.kind === "ride") ride!.min += p.min;
    else if (p.kind === "alight" && ride) {
      const rt = g.routes[ride.r];
      const subway = rt.type !== 3 || Boolean(rt.line && rt.line !== "silver");
      const name = rt.line && rt.line !== "silver" ? `${rt.line[0].toUpperCase()}${rt.line.slice(1)} Line${rt.id.startsWith("Green") ? ` ${rt.id.slice(-1)}` : ""}` : rt.line === "silver" ? `Silver Line ${rt.short}` : `Bus ${rt.short}`;
      steps.push({
        line: rt.line as RouteStep["line"],
        mode: subway ? "subway" : "bus",
        routeShort: rt.line && rt.line !== "silver" ? undefined : rt.short,
        color: rt.color,
        label: `${name} to ${nodeName(id)}`,
        minutes: Math.max(1, Math.round(ride.wait + ride.min)),
      });
      routeIds.push(rt.id);
      if (!firstBoard) {
        const boardIdx = steps.length - 1;
        firstBoard = { stopId: "", toStopId: g.nodes[Math.floor(id / (R + 1))][0], routeId: rt.id, plannedWaitMin: ride.wait, stepIndex: boardIdx };
      }
      ride = null;
    }
  }
  // flush any transfer or start walk still pending, then add the final walk to the destination
  flushWalk();
  walkAcc =ends.get(Math.floor(bestState / (R + 1))) ?? 0;
  walkTo = "your destination";
  flushWalk();

  // fill in the first boarding stop id for live predictions
  if (firstBoard) {
    const b = path.find((q) => q.p.kind === "board");
    if (b) firstBoard.stopId = g.nodes[Math.floor(b.p.from / (R + 1))][0];
  }

  const rideNodes = new Set<number>();
  for (const { id, p } of path) if (p.kind === "ride" || p.kind === "board" || p.kind === "alight") rideNodes.add(Math.floor(id / (R + 1)));
  const stopIds = [...rideNodes].flatMap((i) => [g.nodes[i][0], ...(aliasesOf.get(i) ?? [])]);

  return { steps, durationMin: Math.round(best), routeIds: [...new Set(routeIds)], stopIds, firstBoard };
}
