// Server only. A user's home base: the neighborhood they call home and its nearest subway station.
// Runs on the in-memory store, like /api/checkin. TODO(Person 2): mirror to Tiger Data when
// getPool() is configured (columns are in db/schema.sql).
import { DEMO_MODE } from "./config";
import { neighborhoodById } from "./geo";
import type { Identity } from "./identity";
import { canChangeHome, seasonOf } from "./scoring";
import { homeStationFor } from "./stationGraph";
import { mem } from "./store";
import type { HomeState } from "./types";

/** Demo mode: the demo user's home is Fenway until they pick another. */
export const DEMO_HOME = "fenway";

export function getHome(uid: string): HomeState {
  const user = mem.users.get(uid);
  const season = seasonOf();
  const stored = user?.homeNeighborhood;
  const neighborhood = stored ?? (DEMO_MODE && uid === "demo-user" ? DEMO_HOME : null);
  return {
    neighborhood,
    stationId: user?.homeStationId ?? (neighborhood ? homeStationFor(neighborhood) : null),
    canChange: !stored || canChangeHome(user?.homeChangedSeason),
    season,
  };
}

export function setHome(who: Identity, neighborhood: string): { ok: true; home: HomeState } | { ok: false; error: string } {
  if (!neighborhoodById.has(neighborhood)) return { ok: false, error: "Pick a neighborhood from the list." };
  const stationId = homeStationFor(neighborhood);
  if (!stationId) return { ok: false, error: "No subway station found for that neighborhood." };

  const user = mem.users.get(who.uid) ?? {
    displayName: who.displayName, email: who.email, college: who.college,
    points: 0, unlocked: [], co2SavedKg: 0, createdAt: Date.now(),
  };
  if (user.homeNeighborhood === neighborhood) return { ok: true, home: getHome(who.uid) };
  if (user.homeNeighborhood && !canChangeHome(user.homeChangedSeason))
    return { ok: false, error: "You already changed your home this season. You can change it again next season." };

  if (user.homeNeighborhood) user.homeChangedSeason = seasonOf(); // first set is free
  user.homeNeighborhood = neighborhood;
  user.homeStationId = stationId;
  mem.users.set(who.uid, user);
  return { ok: true, home: getHome(who.uid) };
}
