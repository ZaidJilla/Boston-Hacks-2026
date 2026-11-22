import { NextResponse } from "next/server";
import { planTrip, TripError } from "@/lib/trip";
import type { TripFailure } from "@/lib/tripTypes";

export const maxDuration = 30;

const WINDOW_MS = 60_000;
const MAX_REQS = 20;
const MAX_BODY = 20_000;
const hits = new Map<string, number[]>();

// Best-effort limiter (keyed on x-forwarded-for, which a caller can spoof). Protects the MBTA key's quota.
function throttled(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_REQS;
}

const fail = (error: string, status: number) => NextResponse.json({ ok: false, error } satisfies TripFailure, { status });

// POST a TripRequest (see src/lib/tripTypes.ts) and get a TripResult back.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (throttled(ip)) return fail("Too many requests. Try again in a minute.", 429);
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return fail("That request is too large.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("That request wasn't valid JSON.", 400);
  }
  try {
    return NextResponse.json(await planTrip(body));
  } catch (e) {
    if (e instanceof TripError) return fail(e.message, e.status);
    console.error("[trip] unexpected error:", e instanceof Error ? e.message : e);
    return fail("We couldn't plan that trip. Try again.", 500);
  }
}
