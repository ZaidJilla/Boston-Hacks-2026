// GET /api/profile — the signed-in player's progress (demo player in demo mode).
// Send `Authorization: Bearer <Firebase ID token>`. In demo mode, `?uid=` views any player.
import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/authServer";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get("uid") ?? undefined;
  const user = await userFromRequest(req, { uid });
  if (!user) return NextResponse.json({ error: "Sign in to see your profile" }, { status: 401 });

  try {
    return NextResponse.json(await getStore().getProfile(user));
  } catch (err) {
    console.error("getProfile failed", err);
    return NextResponse.json({ error: "Couldn't load your profile, try again" }, { status: 500 });
  }
}
