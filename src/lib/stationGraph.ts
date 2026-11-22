// Subway station graph for "how far from home" scoring. Server or client safe.
//
// Nodes are GTFS parent stations, so a transfer station (Park Street, Downtown Crossing, State...)
// is already one node. Two stations are connected when they are consecutive on any route pattern in
// data/lines.json. Silver Line (bus rapid transit) is left out: this graph is the subway only.
// It is tiny (about 120 nodes), so BFS per source is instant and cached; nothing to precompute.
import { distanceM, lines, neighborhoodById, stations } from "./geo";
import type { LineId } from "./types";

const SUBWAY: LineId[] = ["red", "orange", "green", "blue"];

const adjacency = new Map<string, Set<string>>();
const link = (a: string, b: string) => {
  if (a === b) return;
  (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a)!).add(b);
  (adjacency.get(b) ?? adjacency.set(b, new Set()).get(b)!).add(a);
};
for (const line of lines.filter((l) => SUBWAY.includes(l.id)))
  for (const branch of line.branches) for (let i = 1; i < branch.stops.length; i++) link(branch.stops[i - 1], branch.stops[i]);

export const graphStationIds = [...adjacency.keys()];
export const inGraph = (stationId: string) => adjacency.has(stationId);

const distCache = new Map<string, Map<string, number>>();
function distancesFrom(source: string): Map<string, number> {
  const hit = distCache.get(source);
  if (hit) return hit;
  const dist = new Map<string, number>([[source, 0]]);
  const queue = [source];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const next of adjacency.get(cur) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(cur)! + 1);
      queue.push(next);
    }
  }
  distCache.set(source, dist);
  return dist;
}

/**
 * Fewest stops between two stations on the subway. Riding Fenway to Kenmore is 1 stop; a transfer
 * adds no stop of its own. Returns null if either station is not on the subway graph (for example a
 * Silver Line-only stop) or the two are not connected.
 */
export function stopsBetween(stationA: string, stationB: string): number | null {
  if (!adjacency.has(stationA) || !adjacency.has(stationB)) return null;
  return distancesFrom(stationA).get(stationB) ?? null;
}

/** Closest subway station to a point. */
export function nearestSubwayStation(lat: number, lng: number): string {
  let best = graphStationIds[0];
  let bestM = Infinity;
  for (const s of stations) {
    if (!adjacency.has(s.id)) continue;
    const m = distanceM({ lat, lng }, s);
    if (m < bestM) [best, bestM] = [s.id, m];
  }
  return best;
}

/** Home station for a neighborhood: the subway station nearest its center. */
export function homeStationFor(neighborhoodId: string): string | null {
  const center = neighborhoodById.get(neighborhoodId)?.properties.center;
  return center ? nearestSubwayStation(center[0], center[1]) : null;
}
