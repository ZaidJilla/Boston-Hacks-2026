import { NextResponse } from "next/server";
import { getHome, setHome } from "@/lib/home";
import { resolveIdentity } from "@/lib/identity";
import type { HomeResult } from "@/lib/types";

const body = (home: ReturnType<typeof getHome>, extra: Partial<HomeResult> = {}) =>
  NextResponse.json({ ok: true, ...home, ...extra } satisfies HomeResult);

const fail = (error: string, status: number) =>
  NextResponse.json(
    { ok: false, error, neighborhood: null, stationId: null, canChange: false, season: "" } satisfies HomeResult,
    { status },
  );

export async function GET(req: Request) {
  const who = await resolveIdentity(req);
  if ("error" in who) return fail(who.error, who.status);
  return body(getHome(who.uid));
}

export async function POST(req: Request) {
  const who = await resolveIdentity(req);
  if ("error" in who) return fail(who.error, who.status);
  const { neighborhood } = (await req.json().catch(() => ({}))) as { neighborhood?: string };
  const res = setHome(who, String(neighborhood ?? ""));
  return res.ok ? body(res.home) : fail(res.error, 400);
}
