// Server only. MBTA V3 predictions. Never throws. A real empty response returns []; canned arrivals
// are used only in demo mode when the live call fails.
const failed = (): Arrival[] => (DEMO_MODE ? demoArrivals : []);
import { DEMO_MODE } from "./config";
import { demoArrivals } from "./demo";
import type { Arrival, LineId } from "./types";

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
export async function getNextDeparture(stopId: string, routeId: string): Promise<number | null> {
  try {
    const res = await fetch(
      mbtaUrl("predictions", { "filter[stop]": stopId, "filter[route]": routeId, sort: "departure_time", "page[limit]": "3" }),
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const now = Date.now();
    for (const p of (await res.json()).data ?? []) {
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
