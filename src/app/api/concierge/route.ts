import { NextResponse } from "next/server";
import { askConcierge, type ChatTurn } from "@/lib/agent";

export const maxDuration = 30;

const MAX_PROMPT = 500;
const MAX_TURN = 1000;
const WINDOW_MS = 60_000;
const MAX_REQS = 10;
const hits = new Map<string, number[]>();

function throttled(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_REQS;
}

function cleanHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter((t): t is ChatTurn => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN) }))
    .slice(-6);
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

// POST { prompt: string, history?: ChatTurn[] }
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (throttled(ip)) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; history?: unknown };
  if (typeof body.prompt !== "string" || !body.prompt.trim()) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  return NextResponse.json(await askConcierge(body.prompt.trim().slice(0, MAX_PROMPT), cleanHistory(body.history)));
}
