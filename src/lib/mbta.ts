// Server only. Never throws: falls back to canned arrivals.
import { demoArrivals } from "./demo";
import type { Arrival, LineId } from "./types";

const ROUTE_TO_LINE: Record<string, LineId> = {
  Red: "red", Orange: "orange", Blue: "blue",
  "Green-B": "green", "Green-C": "green", "Green-D": "green", "Green-E": "green",
};

export async function getArrivals(stopId: string): Promise<Arrival[]> {
  try {
    const key = process.env.MBTA_API_KEY;
    const url = `https://api-v3.mbta.com/predictions?filter[stop]=${encodeURIComponent(stopId)}&sort=arrival_time&page[limit]=6&include=route,trip${key ? `&api_key=${key}` : ""}`;
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) return demoArrivals;
    const json = await res.json();
    const now = Date.now();
    const out: Arrival[] = (json.data ?? [])
      .filter((p: any) => p.attributes?.arrival_time)
      .map((p: any) => ({
        line: ROUTE_TO_LINE[p.relationships?.route?.data?.id] ?? "silver",
        headsign: p.attributes?.headsign ?? "",
        minutes: Math.max(0, Math.round((new Date(p.attributes.arrival_time).getTime() - now) / 60000)),
      }));
    return out.length ? out : demoArrivals;
  } catch {
    return demoArrivals;
  }
}
