"use client";
/**
 * The signed-in player's unlocked neighborhoods and visited restaurants, for the fog and ranks.
 *
 * Reads GET /api/profile (Person 2, feat/backend). Until that endpoint is on main the request
 * 404s, and demo mode falls back to a fixed set so the fog still has something to reveal.
 * Refetches whenever the map mounts, so coming back from a check-in shows the new unlock.
 */
import { useEffect, useState } from "react";
import { useUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/config";
import { getClientAuth } from "@/lib/firebase";

const DEMO_UNLOCKED = ["fenway", "back-bay", "north-end"];

/** The slice of the /api/profile response the map uses. */
interface ProfileSlice {
  uid: string;
  points: number;
  neighborhoods: { id: string; unlocked: boolean }[];
  visitedRestaurantIds: string[];
}

export interface UnlockState {
  unlocked: Set<string>;
  checkins: Set<string>;
  /** Total points: the overall rank is based on this. */
  points: number;
  /** Whose progress this is (used to remember the last rank seen). */
  uid: string | null;
  /** False until the first answer (or fallback) is in, so a rank-up isn't judged on empty data. */
  loaded: boolean;
  /** "profile" = real data from the server, "demo" = the fixed fallback set. */
  source: "profile" | "demo" | "none";
}

const EMPTY: UnlockState = { unlocked: new Set(), checkins: new Set(), points: 0, uid: null, loaded: false, source: "none" };

export function useUnlocked(): UnlockState {
  const { user } = useUser();
  const [state, setState] = useState<UnlockState>(EMPTY);

  useEffect(() => {
    if (!user) {
      setState({ ...EMPTY, loaded: true });
      return;
    }
    let alive = true;
    (async () => {
      let next: UnlockState | null = null;
      try {
        const token = await getClientAuth()?.currentUser?.getIdToken().catch(() => undefined);
        const res = await fetch("/api/profile", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        if (res.ok) {
          const p = (await res.json()) as ProfileSlice;
          next = {
            unlocked: new Set(p.neighborhoods.filter((n) => n.unlocked).map((n) => n.id)),
            checkins: new Set(p.visitedRestaurantIds),
            points: p.points,
            uid: p.uid,
            loaded: true,
            source: "profile",
          };
        }
      } catch {
        /* fall through to the fallback */
      }
      next ??= {
        unlocked: new Set(DEMO_MODE ? DEMO_UNLOCKED : []),
        checkins: new Set(),
        points: 0,
        uid: user.uid,
        loaded: true,
        source: DEMO_MODE ? "demo" : "none",
      };
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  return state;
}
