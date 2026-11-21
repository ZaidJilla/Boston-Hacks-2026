"use client";
/**
 * TEMPORARY STUB — Person 2 owns the real `useUser()` hook.
 *
 * When theirs lands, delete this file's body and re-export theirs, e.g.
 *   export { useUser } from "@/lib/useUser";
 * The map only relies on the `MapUser` shape below:
 *   - `user.unlockedNeighborhoods`: neighborhood ids from data/neighborhoods.json (e.g. "back-bay")
 *   - `user.checkins`: optional, used to show "2/3 eaten" progress on fogged neighborhoods
 */
import { useMemo } from "react";

export interface MapUser {
  id: string;
  name: string;
  unlockedNeighborhoods: string[];
  /** restaurant ids the user has checked in at */
  checkins?: string[];
}

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const DEMO_USER: MapUser = {
  id: "demo",
  name: "Demo Student",
  unlockedNeighborhoods: ["fenway", "back-bay", "north-end"],
  checkins: [],
};

export function useUser(): { user: MapUser | null; loading: boolean } {
  return useMemo(() => ({ user: DEMO_MODE ? DEMO_USER : null, loading: false }), []);
}
