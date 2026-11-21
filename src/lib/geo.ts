import { distance, point } from "@turf/turf";

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distance(point([aLng, aLat]), point([bLng, bLat]), { units: "kilometers" }) * 1000;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distanceMeters(aLat, aLng, bLat, bLng) / 1000;
}
