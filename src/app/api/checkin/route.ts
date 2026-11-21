import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/config";
import { getRestaurant, getStation } from "@/lib/data";
import { distanceKm, distanceMeters } from "@/lib/geo";
import { verifyReceipt } from "@/lib/gemini";
import { logCheckin, mintBadge } from "@/lib/solana";
import { mem } from "@/lib/store";
import { verifyIdToken } from "@/lib/authServer";
import { collegeFromEmail } from "@/lib/colleges";
import { CHECKIN_RADIUS_M, co2SavedKg, isUnlocked, pointsForCheckin } from "@/lib/scoring";
import type { CheckinRequest, CheckinResult } from "@/lib/types";
import { DEFAULT_ORIGIN } from "@/lib/config";

const inFlight = new Set<string>();

const fail = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error, pointsEarned: 0, totalPoints: 0, co2SavedKg: 0 } satisfies CheckinResult, { status });

// TODO(Person 2): when getPool() is configured, do this in one Postgres transaction against Tiger Data,
// handle line quests, and enforce auth. This version runs on the in-memory store.
export async function POST(req: Request) {
  const body = (await req.json()) as CheckinRequest;

  // Identity comes only from a verified Firebase ID token, never from the body.
  // A token that was sent but fails verification (e.g. expired) is rejected, never downgraded to demo.
  const authHeader = req.headers.get("authorization");
  const verified = authHeader ? await verifyIdToken(authHeader.replace(/^Bearer\s+/i, "")) : null;
  if (authHeader && !verified) return fail("Your session expired. Sign in again.", 401);
  if (!verified && !DEMO_MODE) return fail("Sign in to check in", 401);
  const uid = verified?.uid ?? "demo-user";
  const displayName = verified ? verified.name || "Student" : "Demo Student";
  const college = verified ? collegeFromEmail(verified.email) : "Northeastern";
  const email = verified?.email ?? "";

  const r = getRestaurant(body.restaurantId);
  if (!r) return fail("Restaurant not found", 404);

  // Cheap duplicate check first, and an in-flight lock so concurrent requests can't both pass it.
  const lockKey = `${uid}:${r.id}`;
  if (mem.checkins.some((c) => c.uid === uid && c.restaurantId === r.id) || inFlight.has(lockKey))
    return fail("Already checked in here");
  inFlight.add(lockKey);
  try {
    return await process(body, r, uid, { displayName, email, college });
  } finally {
    inFlight.delete(lockKey);
  }
}

async function process(
  body: CheckinRequest,
  r: NonNullable<ReturnType<typeof getRestaurant>>,
  uid: string,
  who: { displayName: string; email: string; college: string },
) {
  const simulate = DEMO_MODE && body.simulate;
  if (!simulate) {
    if (body.lat == null || body.lng == null) return fail("Location required");
    if (distanceMeters(body.lat, body.lng, r.lat, r.lng) > CHECKIN_RADIUS_M)
      return fail(`You need to be within ${CHECKIN_RADIUS_M} m of the restaurant`);
    const verdict = await verifyReceipt(body.receiptBase64, r.name);
    if (!verdict.valid) return fail(verdict.reason ?? "Receipt not verified");
  }

  const user = mem.users.get(uid) ?? {
    ...who,
    points: 0, unlocked: [], co2SavedKg: 0, createdAt: Date.now(),
  };

  const priorInHood = new Set(mem.checkins.filter((c) => c.uid === uid && c.neighborhood === r.neighborhood).map((c) => c.restaurantId));
  const newlyUnlocked = isUnlocked(priorInHood.add(r.id).size) && !user.unlocked.includes(r.neighborhood);

  const station = getStation(r.nearestStopId);
  const trip = station ? distanceKm(DEFAULT_ORIGIN.lat, DEFAULT_ORIGIN.lng, r.lat, r.lng) : 0;
  const co2 = co2SavedKg(trip, "transit");
  const pointsEarned = pointsForCheckin({ isChain: r.isChain, unlockedNeighborhood: newlyUnlocked, questCompleted: false });

  // On-chain calls can fail; the check-in itself still counts, so they never block saving state.
  let badgeMint: string | undefined;
  if (newlyUnlocked) badgeMint = await mintBadge(uid, r.neighborhood).catch(() => undefined);
  const txSignature = await logCheckin({ uid, restaurantId: r.id, neighborhood: r.neighborhood }).catch(() => undefined);

  // Write check-in and user state together, after all awaits.
  mem.checkins.push({
    uid, restaurantId: r.id, neighborhood: r.neighborhood, nearestStopId: r.nearestStopId,
    lat: r.lat, lng: r.lng, verified: true, createdAt: Date.now(),
  });
  user.points += pointsEarned;
  user.co2SavedKg += co2;
  if (newlyUnlocked) user.unlocked.push(r.neighborhood);
  mem.users.set(uid, user);

  return NextResponse.json({
    ok: true, pointsEarned, totalPoints: user.points,
    unlockedNeighborhood: newlyUnlocked ? r.neighborhood : undefined,
    badgeMint, co2SavedKg: co2, txSignature,
  } satisfies CheckinResult);
}
