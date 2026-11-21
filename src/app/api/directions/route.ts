import { NextResponse } from "next/server";
import { getRestaurant } from "@/lib/data";
import { getTransitRoute } from "@/lib/routes";

// POST { origin?: {lat,lng}, restaurantId } or { origin?, dest: {lat,lng} }
export async function POST(req: Request) {
  const { origin, dest, restaurantId } = await req.json();
  const r = restaurantId ? getRestaurant(restaurantId) : undefined;
  const target = r ? { lat: r.lat, lng: r.lng } : dest;
  if (!target) return NextResponse.json({ error: "Missing restaurantId or dest" }, { status: 400 });
  return NextResponse.json(await getTransitRoute(origin, target, r?.nearestStopId));
}
