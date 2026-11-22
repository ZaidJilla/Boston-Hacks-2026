// Shared contract. Change only after telling the team.

export type LineId = "red" | "orange" | "green" | "blue" | "silver";

export type Craving =
  | "pizza" | "ramen" | "tacos" | "burgers" | "coffee" | "dessert"
  | "chinese" | "indian" | "thai" | "seafood" | "sandwiches" | "other";

export type PriceTier = 1 | 2 | 3; // $, $$, $$$

export interface Neighborhood {
  id: string; // slug, e.g. "back-bay"
  name: string;
}

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  neighborhood: string; // Neighborhood.id
  craving: Craving;
  price: PriceTier;
  isChain: boolean;
  nearestStopId: string; // Station.id
}

/** Landmarks and local stores from data/places.json (restaurants stay in restaurants.json). */
export interface PlaceRow {
  id: string;
  type: "landmark" | "shopping" | "store";
  /** park, museum, attraction, gallery, historic-building; mall, district, market for shopping */
  subtype: string;
  name: string;
  lat: number;
  lng: number;
  neighborhood: string; // Neighborhood.id
  neighborhoodName: string;
  isChain: boolean;
  /** Shown on the map by default to draw people in. */
  famous?: boolean;
  /** Added by hand because OSM has no tagged entry for it. */
  curated?: boolean;
  address: string | null;
  website: string | null;
  openingHours: string | null;
  wheelchair: string | null; // OSM value: yes | limited | no
  nearestStopId: string; // Station.id
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lines: LineId[];
}

export interface Line {
  id: LineId;
  name: string;
  color: string;
  stopIds: string[]; // ordered
}

// Row shapes for Tiger Data tables (see db/schema.sql)
export interface UserDoc {
  displayName: string;
  email: string;
  college: string;
  points: number;
  unlocked: string[];
  co2SavedKg: number;
  createdAt: number;
}

export interface CheckinDoc {
  uid: string;
  restaurantId: string;
  neighborhood: string;
  nearestStopId: string;
  lat: number;
  lng: number;
  verified: boolean;
  createdAt: number;
}

export interface UnlockDoc {
  uid: string;
  neighborhood: string;
  createdAt: number;
}

export interface QuestDoc {
  uid: string;
  line: LineId;
  stopIds: string[];
  completed: boolean;
}

// API contracts
export interface CheckinRequest {
  restaurantId: string;
  lat?: number;
  lng?: number;
  receiptBase64?: string;
  simulate?: boolean; // demo mode only
}

export interface CheckinResult {
  ok: boolean;
  error?: string;
  pointsEarned: number;
  totalPoints: number;
  unlockedNeighborhood?: string;
  questCompleted?: LineId;
  co2SavedKg: number;
}

export interface Arrival {
  line: LineId;
  headsign: string;
  minutes: number;
}

export interface RouteStep {
  line?: LineId;
  label: string; // "Walk 4 min" / "Green Line to Kenmore"
  minutes: number;
  mode?: "walk" | "subway" | "bus";
  routeShort?: string; // "39", "Orange"
  color?: string; // hex, from GTFS
}

export interface RouteResult {
  durationMin: number;
  distanceKm: number;
  steps: RouteStep[];
  alerts?: string[]; // live MBTA alerts on the routes used
  source?: "gtfs" | "google" | "estimate";
}

export interface ReceiptVerdict {
  valid: boolean;
  nameMatches: boolean;
  datedToday: boolean;
  reason?: string;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  college?: string;
  points: number;
}

export interface HomeState {
  neighborhood: string | null;
  stationId: string | null;
  /** False once the user has used their one change this season. */
  canChange: boolean;
  season: string;
}

export interface HomeResult extends HomeState {
  ok: boolean;
  error?: string;
}

// GET /api/profile
export interface NeighborhoodProgress {
  id: string;
  name: string;
  visited: number; // distinct restaurants checked into
  needed: number; // UNLOCK_THRESHOLD
  unlocked: boolean;
}

export interface QuestProgress {
  line: LineId;
  name: string; // "Orange Line"
  color: string;
  stops: number; // distinct stops checked in near
  needed: number; // LINE_QUEST_STOPS
  completed: boolean;
}

export interface Profile {
  uid: string;
  displayName: string;
  college: string;
  points: number;
  co2SavedKg: number;
  checkins: number;
  rank: number | null; // citywide, null before the first check-in
  totalPlayers: number;
  neighborhoods: NeighborhoodProgress[]; // every neighborhood, most progress first
  quests: QuestProgress[]; // every line
  visitedRestaurantIds: string[]; // e.g. to mark visited pins on the map
}
