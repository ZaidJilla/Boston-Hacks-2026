import { NextResponse } from "next/server";
import { getArrivals } from "@/lib/mbta";

export async function GET(req: Request) {
  const stop = new URL(req.url).searchParams.get("stop");
  if (!stop) return NextResponse.json({ error: "Missing stop" }, { status: 400 });
  return NextResponse.json(await getArrivals(stop));
}
