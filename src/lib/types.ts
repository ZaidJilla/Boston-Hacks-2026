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
  txSignature?: string;
  createdAt: number;
}

export interface UnlockDoc {
  uid: string;
  neighborhood: string;
  badgeMint?: string;
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
  badgeMint?: string;
  questCompleted?: LineId;
  co2SavedKg: number;
  txSignature?: string;
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
}

export interface RouteResult {
  durationMin: number;
  distanceKm: number;
  steps: RouteStep[];
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
