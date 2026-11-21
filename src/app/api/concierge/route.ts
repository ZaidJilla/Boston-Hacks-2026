import { NextResponse } from "next/server";
import { askConcierge, type ChatTurn } from "@/lib/agent";

export const maxDuration = 30;

// POST { prompt: string, history?: ChatTurn[] }
export async function POST(req: Request) {
  const { prompt, history } = (await req.json()) as { prompt?: string; history?: ChatTurn[] };
  if (!prompt?.trim()) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  return NextResponse.json(await askConcierge(prompt.trim(), Array.isArray(history) ? history : []));
}
