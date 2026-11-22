// Server only. Where a place sits relative to a player's home, for the distance multiplier.
import { getHome } from "./home";
import { stopsBetween } from "./stationGraph";
import type { Restaurant } from "./types";

/** Stops on the subway from the player's home station to the place's nearest station. Null if either is unknown. */
export function distanceFromHome(uid: string, r: Pick<Restaurant, "neighborhood" | "nearestStopId">) {
  const home = getHome(uid);
  return {
    stopsFromHome: home.stationId ? stopsBetween(home.stationId, r.nearestStopId) : null,
    inHomeNeighborhood: home.neighborhood !== null && home.neighborhood === r.neighborhood,
  };
}
