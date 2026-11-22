// Server only. Google Routes API (TRANSIT) when a key is set, otherwise a computed estimate
// from our own station data. Never throws.
import { DEFAULT_ORIGIN } from "./config";
import { getStation } from "./data";
import { distanceKm, distanceMeters } from "./geo";
import { getAlerts, getNextDeparture } from "./mbta";
import { plan } from "./planner";
import { nearestStation } from "./search";
import type { LineId, RouteResult, RouteStep } from "./types";

type LatLng = { lat: number; lng: number };
const WALK_M_PER_MIN = 80;
const MAX_WALK_ONLY_MIN = 40; // never suggest walking longer than this when a transit route exists

function lineFromName(name: string | undefined): LineId | undefined {
  const n = (name ?? "").toLowerCase();
  return (["red", "orange", "green", "blue", "silver"] as LineId[]).find((l) => n.includes(l));
}

/** Estimate when there is no API key: walk to the nearest stop, ride, walk the last bit. */
export function estimateRoute(origin: LatLng, dest: LatLng, destStopId?: string): RouteResult {
  const a = nearestStation(origin.lat, origin.lng);
  const b = (destStopId && getStation(destStopId)) || nearestStation(dest.lat, dest.lng);
  const walk1 = Math.max(1, Math.round((distanceKm(origin.lat, origin.lng, a.lat, a.lng) * 1000) / WALK_M_PER_MIN));
  const walk2 = Math.max(1, Math.round((distanceKm(b.lat, b.lng, dest.lat, dest.lng) * 1000) / WALK_M_PER_MIN));
  const totalKm = distanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const steps: RouteStep[] = [];

  if (walk1 > 30 || walk2 > 30) {
    return {
      durationMin: 0,
      distanceKm: Math.round(totalKm * 10) / 10,
      steps: [{ label: "This is too far from a T stop. Try a rideshare.", minutes: 0 }],
    };
  }

  if (a.id === b.id || totalKm < 0.6) {
    const m = Math.max(1, Math.round((totalKm * 1000) / WALK_M_PER_MIN));
    steps.push({ label: `Walk ${m} min`, minutes: m });
  } else {
    const line = a.lines.find((l) => b.lines.includes(l)) ?? b.lines[0];
    const ride = Math.max(3, Math.round(distanceKm(a.lat, a.lng, b.lat, b.lng) * 3));
    steps.push({ label: `Walk ${walk1} min to ${a.name}`, minutes: walk1 });
    steps.push({ line, label: `${line[0].toUpperCase()}${line.slice(1)} Line to ${b.name}`, minutes: ride });
    steps.push({ label: `Walk ${walk2} min`, minutes: walk2 });
  }
  return {
    durationMin: steps.reduce((n, s) => n + s.minutes, 0),
    distanceKm: Math.round(totalKm * 10) / 10,
    steps,
  };
}

/** Free planner: our own search over MBTA GTFS (subway, light rail, bus) plus live waits and alerts. */
async function gtfsRoute(o: LatLng, dest: LatLng): Promise<RouteResult | null> {
  const meters = distanceMeters(o.lat, o.lng, dest.lat, dest.lng);
  const walkMin = Math.max(1, Math.round((meters * 1.3) / 80));
  const km = Math.round(meters / 100) / 10;
  const walkOnly: RouteResult = {
    durationMin: walkMin, distanceKm: km, source: "gtfs",
    steps: [{ mode: "walk", label: `Walk ${walkMin} min`, minutes: walkMin }],
  };
  if (walkMin <= 10) return walkOnly; // not worth waiting for a train

  const p = plan(o, dest);
  if (!p) return null;
  if (walkMin <= p.durationMin && walkMin <= MAX_WALK_ONLY_MIN) return walkOnly;
  const steps = p.steps.map((s) => ({ ...s }));
  let duration = p.durationMin;

  // Swap the planned wait for the live one on the first ride.
  const fb = p.firstBoard;
  const [live, alerts] = await Promise.all([
    fb ? getNextDeparture(fb.stopId, fb.routeId, fb.toStopId) : Promise.resolve(null),
    getAlerts(p.routeIds, p.stopIds),
  ]);
  if (fb && live !== null) {
    const step = steps[fb.stepIndex];
    step.label += live <= 0 ? " · arriving now" : ` · next in ${live} min`;
    // A very long gap is more likely a gap in the data than a real wait, so don't let it
    // distort the trip time. The label above still shows it and the alerts explain real outages.
    if (live <= 45) {
      const delta = live - Math.round(fb.plannedWaitMin);
      step.minutes = Math.max(1, step.minutes + delta);
      duration = Math.max(1, duration + delta);
    }
  }
  return { durationMin: duration, distanceKm: km, steps, alerts, source: "gtfs" };
}

export async function getTransitRoute(
  origin: LatLng | undefined,
  dest: LatLng,
  destStopId?: string,
): Promise<RouteResult> {
  const o = origin ?? DEFAULT_ORIGIN;
  const own = await gtfsRoute(o, dest).catch(() => null);
  if (own) return own;
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) return { ...estimateRoute(o, dest, destStopId), source: "estimate" };
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
        destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
        travelMode: "TRANSIT",
      }),
    });
    if (!res.ok) return estimateRoute(o, dest, destStopId);
    const r = (await res.json()).routes?.[0];
    if (!r) return estimateRoute(o, dest, destStopId);

    const steps: RouteStep[] = (r.legs?.[0]?.steps ?? []).map((s: any): RouteStep => {
      const minutes = Math.max(1, Math.round(parseInt(s.staticDuration ?? "0") / 60));
      const td = s.transitDetails;
      if (td) {
        const name = td.transitLine?.name ?? td.transitLine?.nameShort;
        return {
          line: lineFromName(name) ?? "silver",
          label: `${name ?? "Transit"} to ${td.stopDetails?.arrivalStop?.name ?? "stop"}`,
          minutes,
        };
      }
      return { label: s.navigationInstruction?.instructions ?? `Walk ${minutes} min`, minutes };
    });

    return {
      durationMin: Math.round(parseInt(r.duration) / 60),
      distanceKm: Math.round(r.distanceMeters / 100) / 10,
      steps: steps.length ? steps : estimateRoute(o, dest, destStopId).steps,
      source: "google",
    };
  } catch {
    return estimateRoute(o, dest, destStopId);
  }
}
