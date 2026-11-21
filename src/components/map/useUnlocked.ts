"use client";
/**
 * Which neighborhoods the signed-in user has unlocked, for the fog.
 *
 * `useUser()` (src/lib/auth.tsx) only has uid/name/email/college; unlocks live on the server
 * (users.unlocked / the unlocks table). Until there's an endpoint for them, demo mode shows a
 * fixed set so the fog has something to reveal.
 * TODO(Person 2): expose the user's unlocks + check-ins (e.g. GET /api/me → { unlocked, checkins })
 * and fetch it here. Nothing else in the map needs to change.
 */
import { useMemo } from "react";
import { useUser } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/config";

const DEMO_UNLOCKED = ["fenway", "back-bay", "north-end"];

export function useUnlocked(): { unlocked: Set<string>; checkins: Set<string>; signedIn: boolean } {
  const { user } = useUser();
  return useMemo(
    () => ({
      unlocked: new Set(user && DEMO_MODE ? DEMO_UNLOCKED : []),
      checkins: new Set<string>(),
      signedIn: Boolean(user),
    }),
    [user],
  );
}
