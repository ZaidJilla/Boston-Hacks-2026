// Server only. Google Routes API (TRANSIT). Never throws: falls back to canned route.
import { DEFAULT_ORIGIN } from "./config";
import { demoRoute } from "./demo";
import type { RouteResult } from "./types";

export async function getTransitRoute(
  origin: { lat: number; lng: number } | undefined,
  dest: { lat: number; lng: number },
): Promise<RouteResult> {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) return demoRoute;
  const o = origin ?? DEFAULT_ORIGIN;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.steps",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
        destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
        travelMode: "TRANSIT",
      }),
    });
    if (!res.ok) return demoRoute;
    const json = await res.json();
    const r = json.routes?.[0];
    if (!r) return demoRoute;
    // TODO(Person 3): map r.legs[0].steps into RouteStep[] with line colors.
    return {
      durationMin: Math.round(parseInt(r.duration) / 60),
      distanceKm: Math.round(r.distanceMeters / 100) / 10,
      steps: demoRoute.steps,
    };
  } catch {
    return demoRoute;
  }
}
