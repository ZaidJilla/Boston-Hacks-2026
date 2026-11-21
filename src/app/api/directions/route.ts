import { NextResponse } from "next/server";
import { getTransitRoute } from "@/lib/routes";

export async function POST(req: Request) {
  const { origin, dest } = await req.json();
  if (!dest) return NextResponse.json({ error: "Missing dest" }, { status: 400 });
  return NextResponse.json(await getTransitRoute(origin, dest));
}
