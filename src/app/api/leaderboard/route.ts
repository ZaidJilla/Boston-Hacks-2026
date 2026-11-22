// GET /api/leaderboard?tab=citywide|hood&hood=<neighborhood id>&limit=<n>  (JSON, ranks included)
import { NextResponse } from "next/server";
import { byNeighborhood, citywide, withRanks } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  const hood = url.searchParams.get("hood");
  const rows = url.searchParams.get("tab") === "hood" && hood ? await byNeighborhood(hood, limit) : await citywide(limit);
  return NextResponse.json(await withRanks(rows));
}
