// POST /api/checkin
// 1. who (auth) -> 2. proof: within 50 m OR a receipt Gemini verifies -> 3. store (one transaction)
// -> 4. respond.
import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/authServer";
import { DEMO_MODE } from "@/lib/config";
import { getRestaurant } from "@/lib/data";
import { distanceMeters } from "@/lib/geo";
import { verifyReceipt } from "@/lib/gemini";
import { badgeCard, factsFrom, newBadges } from "@/lib/badges";
import { getHome } from "@/lib/home";
import { distanceFromHome } from "@/lib/economy";
import { CHECKIN_RADIUS_M } from "@/lib/scoring";
import { checkinFacts, getStore } from "@/lib/store";
import type { CheckinRequest, CheckinResult } from "@/lib/types";

export const runtime = "nodejs"; // pg + firebase-admin need Node, not Edge

// Any uid/displayName/college in the body is ignored: identity comes only from the token.
type Body = CheckinRequest;

const fail = (error: string, status = 400) =>
  NextResponse.json(
    { ok: false, error, pointsEarned: 0, totalPoints: 0, co2SavedKg: 0 } satisfies CheckinResult,
    { status },
  );

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("Invalid request");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request");

  // 1. Who. No body hints: without a token (demo mode only) this is always the demo player,
  // so nobody can write to, rename, or add points to another player's account.
  const auth = await userFromRequest(req);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;

  const r = body.restaurantId ? getRestaurant(body.restaurantId) : undefined;
  if (!r) return fail("Restaurant not found", 404);

  // Cheap duplicate check before spending a Gemini call. The transaction re-checks for real.
  const store = getStore();
  try {
    if (await store.hasVisited(user.uid, r.id)) return fail("You already checked in here", 409);
  } catch (err) {
    console.error("hasVisited failed", err); // not fatal: recordCheckin enforces it anyway
  }

  if (body.simulate && !DEMO_MODE) return fail("Simulated check-ins are off", 403);
  const simulate = DEMO_MODE && body.simulate === true;

  let lat = r.lat;
  let lng = r.lng;
  if (!simulate) {
    // 2. Proof. Either you are within CHECKIN_RADIUS_M of the restaurant, or you scan a receipt that
    // Gemini verifies (right place, today). Some people don't get a receipt, and some can't share
    // location, so one is enough.
    const hasPos = typeof body.lat === "number" && typeof body.lng === "number";
    const meters = hasPos ? distanceMeters(body.lat!, body.lng!, r.lat, r.lng) : null;
    if (meters !== null && meters <= CHECKIN_RADIUS_M) {
      lat = body.lat!;
      lng = body.lng!;
    } else if (body.receiptBase64) {
      const verdict = await verifyReceipt(body.receiptBase64, r.name);
      if (!verdict.valid) return fail(verdict.reason ?? "Receipt not verified", 422);
    } else {
      return fail(
        meters === null
          ? `Turn on location and be within ${CHECKIN_RADIUS_M} m, or scan a receipt`
          : `You're ${Math.round(meters)} m away. Get within ${CHECKIN_RADIUS_M} m, or scan a receipt`,
        403,
      );
    }
  }

  const { lines, co2SavedKg: co2 } = checkinFacts(r);

  // 3. Store. The badge shelf is worked out from progress, so compare it before and after.
  const homeStation = getHome(user.uid).stationId;
  let outcome;
  let earned: ReturnType<typeof badgeCard>[] = [];
  try {
    const before = factsFrom(await store.getProfile(user), homeStation);
    outcome = await store.recordCheckin({ user, restaurant: r, lines, lat, lng, co2SavedKg: co2, distance: distanceFromHome(user.uid, r) });
    if (outcome.ok) {
      try {
        earned = newBadges(before, factsFrom(await store.getProfile(user), homeStation)).map(badgeCard);
      } catch (err) {
        console.error("badge check failed", err); // the check-in is saved; just no badge announcement
      }
    }
  } catch (err) {
    console.error("recordCheckin failed", err);
    return fail("Couldn't save your check-in, try again", 500);
  }
  if (!outcome.ok) return fail("You already checked in here", 409);

  // 4. Respond
  return NextResponse.json({
    ok: true,
    pointsEarned: outcome.pointsEarned,
    breakdown: outcome.breakdown,
    totalPoints: outcome.totalPoints,
    unlockedNeighborhood: outcome.unlockedNeighborhood,
    questCompleted: outcome.questCompleted,
    newBadges: earned,
    co2SavedKg: co2,
  } satisfies CheckinResult);
}
