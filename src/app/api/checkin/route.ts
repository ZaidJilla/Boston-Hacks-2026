import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/config";
import { getRestaurant, getStation } from "@/lib/data";
import { distanceKm, distanceMeters } from "@/lib/geo";
import { verifyReceipt } from "@/lib/gemini";
import { logCheckin, mintBadge } from "@/lib/solana";
import { mem } from "@/lib/store";
import { CHECKIN_RADIUS_M, co2SavedKg, isUnlocked, pointsForCheckin } from "@/lib/scoring";
import type { CheckinRequest, CheckinResult } from "@/lib/types";
import { DEFAULT_ORIGIN } from "@/lib/config";

const fail = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error, pointsEarned: 0, totalPoints: 0, co2SavedKg: 0 } satisfies CheckinResult, { status });

// TODO(Person 2): when getPool() is configured, do this in one Postgres transaction against Tiger Data,
// handle line quests, and enforce auth. This version runs on the in-memory store.
export async function POST(req: Request) {
  const body = (await req.json()) as CheckinRequest & { uid?: string; displayName?: string; college?: string };
  const uid = body.uid ?? "demo-user";
  const r = getRestaurant(body.restaurantId);
  if (!r) return fail("Restaurant not found", 404);

  const simulate = DEMO_MODE && body.simulate;
  if (!simulate) {
    if (body.lat == null || body.lng == null) return fail("Location required");
    if (distanceMeters(body.lat, body.lng, r.lat, r.lng) > CHECKIN_RADIUS_M)
      return fail(`You need to be within ${CHECKIN_RADIUS_M} m of the restaurant`);
    const verdict = await verifyReceipt(body.receiptBase64, r.name);
    if (!verdict.valid) return fail(verdict.reason ?? "Receipt not verified");
  }

  if (mem.checkins.some((c) => c.uid === uid && c.restaurantId === r.id))
    return fail("Already checked in here");

  const user = mem.users.get(uid) ?? {
    displayName: body.displayName ?? "Demo Student",
    email: "",
    college: body.college ?? "Northeastern",
    points: 0, unlocked: [], co2SavedKg: 0, createdAt: Date.now(),
  };

  mem.checkins.push({
    uid, restaurantId: r.id, neighborhood: r.neighborhood, nearestStopId: r.nearestStopId,
    lat: r.lat, lng: r.lng, verified: true, createdAt: Date.now(),
  });
  const distinct = new Set(mem.checkins.filter((c) => c.uid === uid && c.neighborhood === r.neighborhood).map((c) => c.restaurantId)).size;
  const newlyUnlocked = isUnlocked(distinct) && !user.unlocked.includes(r.neighborhood);

  const station = getStation(r.nearestStopId);
  const trip = station ? distanceKm(DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng, r.lat, r.lng) : 0;
  const co2 = co2SavedKg(trip, "transit");

  const pointsEarned = pointsForCheckin({ isChain: r.isChain, unlockedNeighborhood: newlyUnlocked, questCompleted: false });
  user.points += pointsEarned;
  user.co2SavedKg += co2;

  let badgeMint: string | undefined;
  if (newlyUnlocked) {
    user.unlocked.push(r.neighborhood);
    badgeMint = await mintBadge(uid, r.neighborhood);
  }
  const txSignature = await logCheckin({ uid, restaurantId: r.id, neighborhood: r.neighborhood });
  mem.users.set(uid, user);

  return NextResponse.json({
    ok: true, pointsEarned, totalPoints: user.points,
    unlockedNeighborhood: newlyUnlocked ? r.neighborhood : undefined,
    badgeMint, co2SavedKg: co2, txSignature,
  } satisfies CheckinResult);
}
