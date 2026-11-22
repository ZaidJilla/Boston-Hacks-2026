"use client";
/**
 * "What would this visit earn me?" Worked out in the browser from the player's home and history, so the
 * map, the peek card and the restaurant page can show "+95 for you" before you go. The server applies
 * the same rules (lib/scoring.ts) when you check in.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth";
import { distanceMultiplier, scoreCheckin } from "@/lib/scoring";
import { stopsBetween } from "@/lib/stationGraph";
import type { HomeResult, LineId, Profile } from "@/lib/types";

export interface PointsContext {
  homeStationId: string | null;
  homeHood: string | null;
  /** neighborhoods you have eaten in at least once */
  visitedHoods: Set<string>;
  /** lines you have visited */
  visitedLines: Set<LineId>;
}

export interface Previewable {
  neighborhood: string;
  nearestStopId: string;
  isChain: boolean;
  nearestStation: { lines: LineId[] };
}

export interface Preview {
  total: number;
  multiplier: number;
  stopsFromHome: number | null;
  newNeighborhood: boolean;
  newLine: boolean;
  inHome: boolean;
}

export function previewFor(ctx: PointsContext, r: Previewable): Preview {
  const stopsFromHome = ctx.homeStationId ? stopsBetween(ctx.homeStationId, r.nearestStopId) : null;
  const inHome = ctx.homeHood !== null && ctx.homeHood === r.neighborhood;
  const newNeighborhood = !ctx.visitedHoods.has(r.neighborhood);
  const newLine = r.nearestStation.lines.some((l) => !ctx.visitedLines.has(l));
  const b = scoreCheckin({
    isChain: r.isChain, unlockedNeighborhood: false, questCompleted: false,
    stopsFromHome, inHomeNeighborhood: inHome, newNeighborhood, newLine,
  });
  return { total: b.total, multiplier: distanceMultiplier(stopsFromHome, inHome), stopsFromHome, newNeighborhood, newLine, inHome };
}

export function usePointsContext(): PointsContext | null {
  const { user, getIdToken } = useUser();
  const [ctx, setCtx] = useState<PointsContext | null>(null);

  useEffect(() => {
    if (!user) {
      setCtx(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const token = await getIdToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const [p, h] = await Promise.all([
          fetch("/api/profile", { headers, cache: "no-store" }),
          fetch("/api/home", { headers, cache: "no-store" }),
        ]);
        if (!p.ok) return;
        const profile = (await p.json()) as Profile;
        const home = h.ok ? ((await h.json()) as HomeResult) : null;
        if (!alive) return;
        setCtx({
          homeStationId: home?.stationId ?? null,
          homeHood: home?.neighborhood ?? null,
          visitedHoods: new Set(profile.neighborhoods.filter((n) => n.visited > 0 || n.unlocked).map((n) => n.id)),
          visitedLines: new Set(profile.quests.filter((q) => q.stops > 0).map((q) => q.line)),
        });
      } catch {
        /* no preview: nothing else depends on it */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, getIdToken]);

  return ctx;
}
