// Loaders for committed static data in /data. Server or client safe (JSON is bundled).
import type { Line, PlaceRow, Restaurant, Station } from "./types";
import restaurantsJson from "../../data/restaurants.json";
import placesJson from "../../data/places.json";
import stationsJson from "../../data/stations.json";
import linesJson from "../../data/lines.json";

export const restaurants = restaurantsJson as Restaurant[];
export const places = placesJson as PlaceRow[];
export const stations = stationsJson as Station[];
export const lines = linesJson as Line[];

export const getRestaurant = (id: string) => restaurants.find((r) => r.id === id);
export const getStation = (id: string) => stations.find((s) => s.id === id);
export const getPlace = (id: string) => places.find((p) => p.id === id);
