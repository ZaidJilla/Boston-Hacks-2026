import { NextResponse } from "next/server";
import { askConcierge } from "@/lib/agent";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  return NextResponse.json(await askConcierge(String(prompt)));
}
