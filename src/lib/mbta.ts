// Server only. MBTA V3 predictions. Never throws. A real empty response returns []; a hard failure
// (network error, bad status) falls back to canned arrivals, per the demo rule in CLAUDE.md.
import { demoArrivals } from "./demo";
import { serviceQuery } from "./clock";
import type { Arrival, LineId } from "./types";

const failed = (): Arrival[] => demoArrivals;

export function routeToLine(routeId: string | undefined): LineId {
  if (!routeId) return "silver";
  if (routeId.startsWith("Green")) return "green";
  if (routeId === "Red" || routeId === "Mattapan") return "red";
  if (routeId === "Orange") return "orange";
  if (routeId === "Blue") return "blue";
  return "silver"; // Silver Line routes are numeric ids (741, 742, ...)
}

const SILVER_LINE = new Set(["741", "742", "743", "746", "749", "751"]);

export async function getArrivals(stopId: string): Promise<Arrival[]> {
  try {
    const key = process.env.MBTA_API_KEY;
    const params = new URLSearchParams({
      "filter[stop]": stopId,
      "filter[route_type]": "0,1,3", // light rail, subway, and bus (includes Silver Line)
      sort: "arrival_time",
      "page[limit]": "8",
      include: "trip",
    });
    if (key) params.set("api_key", key);
    const res = await fetch(`https://api-v3.mbta.com/predictions?${params}`, { cache: "no-store" });
    if (!res.ok) return failed();
    const json = await res.json();

    const headsigns = new Map<string, string>();
    for (const inc of json.included ?? []) {
      if (inc.type === "trip") headsigns.set(inc.id, inc.attributes?.headsign ?? "");
    }

    const now = Date.now();
    const out: Arrival[] = [];
    for (const p of json.data ?? []) {
      const t = p.attributes?.arrival_time ?? p.attributes?.departure_time;
      if (!t) continue;
      const routeId: string | undefined = p.relationships?.route?.data?.id;
      if (routeId && /^\d/.test(routeId) && !SILVER_LINE.has(routeId)) continue; // skip regular buses
      const minutes = Math.round((new Date(t).getTime() - now) / 60000);
      if (minutes < 0) continue;
      out.push({
        line: routeToLine(routeId),
        headsign: headsigns.get(p.relationships?.trip?.data?.id) ?? "",
        minutes,
      });
    }
    return out.slice(0, 6);
  } catch {
    return failed();
  }
}

const mbtaUrl = (path: string, params: Record<string, string>) => {
  const q = new URLSearchParams(params);
  if (process.env.MBTA_API_KEY) q.set("api_key", process.env.MBTA_API_KEY);
  return `https://api-v3.mbta.com/${path}?${q}`;
};

/** Minutes until the next vehicle on a route at a stop, or null if unknown. */
export async function getNextDeparture(stopId: string, routeId: string, toStopId?: string): Promise<number | null> {
  try {
    const get = async (stop: string, limit: string) => {
      const res = await fetch(
        mbtaUrl("predictions", { "filter[stop]": stop, "filter[route]": routeId, sort: "departure_time", "page[limit]": limit }),
        { cache: "no-store", signal: AbortSignal.timeout(4000) },
      );
      return res.ok ? (((await res.json()).data ?? []) as any[]) : null;
    };
    // Direction: only count trips that also call at the stop where the rider gets off.
    const [board, alight] = await Promise.all([get(stopId, toStopId ? "10" : "3"), toStopId ? get(toStopId, "20") : null]);
    if (!board) return null;
    // Keep a trip only if it reaches the alighting stop after the boarding stop (the other direction
    // calls at both stops too, in the opposite order).
    let after: Map<string, number> | null = null;
    if (toStopId) {
      if (!alight) return null;
      after = new Map(alight.map((p) => [p.relationships?.trip?.data?.id, Number(p.attributes?.stop_sequence)]));
    }
    const now = Date.now();
    for (const p of board) {
      if (after) {
        const seq = after.get(p.relationships?.trip?.data?.id);
        const mine = Number(p.attributes?.stop_sequence);
        if (seq === undefined || (Number.isFinite(seq) && Number.isFinite(mine) && !(seq > mine))) continue;
      }
      const t = p.attributes?.departure_time ?? p.attributes?.arrival_time;
      if (!t) continue;
      const m = Math.round((new Date(t).getTime() - now) / 60000);
      if (m >= 0) return m;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Minutes from `at` until the next scheduled departure on a route at a stop, from the MBTA timetable
 * (not live predictions), so it works for a leg that starts hours from now. Only counts trips that
 * also call at `toStopId`, which keeps it to the right direction. Returns "none" when the timetable
 * has no more trips that service day (the last train has gone), or null when we couldn't find out.
 */
export async function getScheduledDeparture(
  stopId: string,
  routeId: string,
  toStopId: string | undefined,
  at: Date,
): Promise<number | "none" | null> {
  try {
    const { date, minTime } = serviceQuery(at);
    const fetchSchedules = async (params: Record<string, string>) => {
      const res = await fetch(mbtaUrl("schedules", params), { cache: "no-store", signal: AbortSignal.timeout(4000) });
      return res.ok ? (((await res.json()).data ?? []) as any[]) : null;
    };
    const board = await fetchSchedules({
      "filter[stop]": stopId, "filter[route]": routeId, "filter[date]": date, "filter[min_time]": minTime,
      sort: "departure_time", "page[limit]": toStopId ? "12" : "4",
    });
    if (!board) return null;
    if (!board.length) {
      // An empty answer could be a flaky response, so before saying the last train has gone, check
      // the day's final departure really is earlier than this time.
      const last = await fetchSchedules({
        "filter[stop]": stopId, "filter[route]": routeId, "filter[date]": date, sort: "-departure_time", "page[limit]": "1",
      });
      if (!last) return null;
      const t = last[0]?.attributes?.departure_time ?? last[0]?.attributes?.arrival_time;
      if (!t || new Date(t).getTime() <= at.getTime()) return "none";
      return null;
    }

    // Direction: ask for those same trips at the stop where the rider gets off, and keep a trip only if
    // it reaches that stop AFTER the boarding stop. Just calling at both is not enough: a train heading
    // the other way calls at both too, in the opposite order.
    let after: Map<string, number> | null = null;
    if (toStopId) {
      const ids = [...new Set(board.map((p) => p.relationships?.trip?.data?.id).filter(Boolean))];
      // filter[date] matters: without it the API looks only at today's service day, so a trip tomorrow matches nothing.
      const there = await fetchSchedules({ "filter[trip]": ids.join(","), "filter[stop]": toStopId, "filter[date]": date, "page[limit]": String(ids.length * 2) });
      if (!there) return null;
      after = new Map(there.map((p) => [p.relationships?.trip?.data?.id, Number(p.attributes?.stop_sequence)]));
    }
    for (const p of board) {
      const trip = p.relationships?.trip?.data?.id;
      if (after) {
        const seq = after.get(trip);
        if (seq === undefined || !(seq > Number(p.attributes?.stop_sequence))) continue;
      }
      const t = p.attributes?.departure_time ?? p.attributes?.arrival_time;
      if (!t) continue;
      const m = Math.round((new Date(t).getTime() - at.getTime()) / 60000);
      if (m >= -1) return Math.max(0, m);
    }
    return null; // the next few trips don't go where the rider is going: don't claim service ended
  } catch {
    return null;
  }
}

const ALERT_EFFECTS = new Set(["DELAY", "SUSPENSION", "SHUTTLE", "DETOUR", "STATION_CLOSURE", "STOP_CLOSURE", "CANCELLATION", "SERVICE_CHANGE"]);
const alertCache = new Map<string, { at: number; data: any[] }>();

/**
 * Current service alerts that affect this trip: delays, shuttles, closures. An alert counts if it
 * names one of the trip's stops, or names no stops at all (a route-wide alert). Never throws.
 */
export async function getAlerts(routeIds: string[], stopIds: string[] = []): Promise<string[]> {
  if (!routeIds.length) return [];
  try {
    const key = [...routeIds].sort().join(",");
    let data = alertCache.get(key);
    if (!data || Date.now() - data.at > 60_000) {
      const res = await fetch(
        mbtaUrl("alerts", { "filter[route]": key, "filter[datetime]": "NOW", "filter[activity]": "BOARD,EXIT,RIDE" }),
        { cache: "no-store", signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) return [];
      data = { at: Date.now(), data: (await res.json()).data ?? [] };
      alertCache.set(key, data);
    }
    const mine = new Set(stopIds);
    const headers = data.data
      .filter((a: any) => ALERT_EFFECTS.has(a.attributes?.effect))
      .filter((a: any) => {
        const stops = (a.attributes?.informed_entity ?? []).map((e: any) => e.stop).filter(Boolean);
        return !stops.length || !mine.size || stops.some((s: string) => mine.has(s));
      })
      .map((a: any) => String(a.attributes?.header ?? "").trim())
      .filter(Boolean);
    return [...new Set<string>(headers)].slice(0, 3);
  } catch {
    return [];
  }
}
