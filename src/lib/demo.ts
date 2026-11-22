// Canned responses so every external call can fall back in demo mode or with no keys.
import type { Arrival, ReceiptVerdict, RouteResult } from "./types";

export const demoArrivals: Arrival[] = [
  { line: "green", headsign: "Boston College", minutes: 2 },
  { line: "green", headsign: "Government Center", minutes: 5 },
  { line: "orange", headsign: "Oak Grove", minutes: 7 },
];

export const demoRoute: RouteResult = {
  durationMin: 18,
  distanceKm: 3.4,
  steps: [
    { label: "Walk 4 min to Ruggles", minutes: 4 },
    { line: "orange", label: "Orange Line to Back Bay", minutes: 8 },
    { label: "Walk 6 min", minutes: 6 },
  ],
};

export const demoVerdict: ReceiptVerdict = {
  valid: true,
  nameMatches: true,
  datedToday: true,
  reason: "Demo mode",
};
