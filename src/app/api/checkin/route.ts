// POST /api/checkin
// 1. who (auth) -> 2. where (75 m) -> 3. proof (Gemini receipt) -> 4. store (one transaction)
// -> 5. Solana side effects (after commit, never block) -> 6. respond.
import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/authServer";
import { DEMO_MODE } from "@/lib/config";
import { getRestaurant } from "@/lib/data";
import { distanceMeters } from "@/lib/geo";
import { verifyReceipt } from "@/lib/gemini";
import { CHECKIN_RADIUS_M } from "@/lib/scoring";
import { logCheckin, mintBadge } from "@/lib/solana";
import { checkinFacts, getStore } from "@/lib/store";
import type { CheckinRequest, CheckinResult } from "@/lib/types";

export const runtime = "nodejs"; // pg + firebase-admin need Node, not Edge

type Body = CheckinRequest & { uid?: string; displayName?: string; college?: string };

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

  // 1. Who
  const user = await userFromRequest(req, { uid: body.uid, displayName: body.displayName, college: body.college });
  if (!user) return fail("Sign in to check in", 401);

  const r = body.restaurantId ? getRestaurant(body.restaurantId) : undefined;
  if (!r) return fail("Restaurant not found", 404);

  if (body.simulate && !DEMO_MODE) return fail("Simulated check-ins are off", 403);
  const simulate = DEMO_MODE && body.simulate === true;

  let lat = r.lat;
  let lng = r.lng;
  if (!simulate) {
    // 2. Where
    if (typeof body.lat !== "number" || typeof body.lng !== "number") return fail("Turn on location to check in");
    const meters = distanceMeters(body.lat, body.lng, r.lat, r.lng);
    if (meters > CHECKIN_RADIUS_M) {
      return fail(`You're ${Math.round(meters)} m away. Get within ${CHECKIN_RADIUS_M} m to check in`, 403);
    }
    lat = body.lat;
    lng = body.lng;

    // 3. Proof
    const verdict = await verifyReceipt(body.receiptBase64, r.name);
    if (!verdict.valid) return fail(verdict.reason ?? "Receipt not verified", 422);
  }

  const { lines, co2SavedKg: co2 } = checkinFacts(r);

  // 4. Store
  const store = getStore();
  let outcome;
  try {
    outcome = await store.recordCheckin({ user, restaurant: r, lines, lat, lng, co2SavedKg: co2 });
  } catch (err) {
    console.error("recordCheckin failed", err);
    return fail("Couldn't save your check-in, try again", 500);
  }
  if (!outcome.ok) return fail("You already checked in here", 409);

  // 5. Solana (both never throw and fall back to fake values without keys)
  const [txSignature, badgeMint] = await Promise.all([
    logCheckin({ uid: user.uid, restaurantId: r.id, neighborhood: r.neighborhood, t: Date.now() }),
    outcome.unlockedNeighborhood ? mintBadge(user.uid, outcome.unlockedNeighborhood) : Promise.resolve(undefined),
  ]);
  await Promise.all([
    store.attachTxSignature(outcome.checkinId, txSignature),
    badgeMint && outcome.unlockedNeighborhood
      ? store.attachBadgeMint(user.uid, outcome.unlockedNeighborhood, badgeMint)
      : undefined,
  ]).catch((err) => console.error("attach Solana refs failed", err));

  // 6. Respond
  return NextResponse.json({
    ok: true,
    pointsEarned: outcome.pointsEarned,
    totalPoints: outcome.totalPoints,
    unlockedNeighborhood: outcome.unlockedNeighborhood,
    badgeMint,
    questCompleted: outcome.questCompleted,
    co2SavedKg: co2,
    txSignature,
  } satisfies CheckinResult);
}
