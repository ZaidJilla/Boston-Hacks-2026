// Server only. A user's home base: the neighborhood they call home and its nearest subway station.
// Kept in its own in-memory map (it resets on server restart), apart from the check-in store.
// TODO: persist to Tiger Data (the home_* columns are in db/schema.sql).
import { DEMO_MODE } from "./config";
import { DEMO_USER } from "./demoUser";
import { neighborhoodById } from "./geo";
import type { Identity } from "./identity";
import { canChangeHome, seasonOf } from "./scoring";
import { homeStationFor } from "./stationGraph";
import type { HomeState } from "./types";

/** Demo mode: the demo user's home is Fenway until they pick another. */
export const DEMO_HOME = "fenway";

interface HomeRecord {
  homeNeighborhood?: string;
  homeStationId?: string;
  /** Season label of the last change. The first set is free and doesn't count. */
  homeChangedSeason?: string;
}
const g = globalThis as unknown as { __homes?: Map<string, HomeRecord> };
const homes = (g.__homes ??= new Map<string, HomeRecord>());

export function getHome(uid: string): HomeState {
  const user = homes.get(uid);
  const season = seasonOf();
  const stored = user?.homeNeighborhood;
  const neighborhood = stored ?? (DEMO_MODE && uid === DEMO_USER.uid ? DEMO_HOME : null);
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

  const user: HomeRecord = homes.get(who.uid) ?? {};
  if (user.homeNeighborhood === neighborhood) return { ok: true, home: getHome(who.uid) };
  if (user.homeNeighborhood && !canChangeHome(user.homeChangedSeason))
    return { ok: false, error: "You already changed your home this season. You can change it again next season." };

  if (user.homeNeighborhood) user.homeChangedSeason = seasonOf(); // first set is free
  user.homeNeighborhood = neighborhood;
  user.homeStationId = stationId;
  homes.set(who.uid, user);
  return { ok: true, home: getHome(who.uid) };
}
