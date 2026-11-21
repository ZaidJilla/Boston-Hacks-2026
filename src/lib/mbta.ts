// Server only. MBTA V3 predictions. Never throws: falls back to canned arrivals.
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

export async function getArrivals(stopId: string): Promise<Arrival[]> {
  try {
    const key = process.env.MBTA_API_KEY;
    const params = new URLSearchParams({
      "filter[stop]": stopId,
      "filter[route_type]": "0,1", // light rail and subway
      sort: "arrival_time",
      "page[limit]": "8",
      include: "trip",
    });
    if (key) params.set("api_key", key);
    const res = await fetch(`https://api-v3.mbta.com/predictions?${params}`, { cache: "no-store" });
    if (!res.ok) return demoArrivals;
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
      const minutes = Math.round((new Date(t).getTime() - now) / 60000);
      if (minutes < 0) continue;
      out.push({
        line: routeToLine(p.relationships?.route?.data?.id),
        headsign: headsigns.get(p.relationships?.trip?.data?.id) ?? "",
        minutes,
      });
    }
    return out.length ? out.slice(0, 6) : demoArrivals;
  } catch {
    return demoArrivals;
  }
}
