// Shared by the trip engine (server) and the plan page (client). No server imports here.
import type { LineId, RouteStep } from "./types";

export type OpenState = "open" | "closing" | "closed" | "unknown";

export interface TripStopInput {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  /** Minutes to spend here. Only used for stops between the start and the end. Default 30. */
  dwellMin?: number;
  /** OSM opening_hours text, used to warn when a stop is closed on arrival. */
  openingHours?: string | null;
}

export interface TripRequest {
  /** First is the start, last is the end, anything between is a stop along the way. 2 to 8 in all. */
  stops: TripStopInput[];
  /** ISO time to leave. Default now. Up to 7 days ahead. */
  departAt?: string;
  /** ISO time to be at the last stop. We work out when to leave. */
  arriveBy?: string;
  /** Let us reorder the middle stops for the shortest trip that fits opening hours. */
  optimize?: boolean;
  /** Warn about stations without an elevator or ramp. */
  stepFree?: boolean;
}

export interface TripStep extends RouteStep {
  startAt: string;
  endAt: string;
}

export type Accuracy = "live" | "scheduled" | "estimated" | "walk";

export interface TripLeg {
  index: number;
  fromName: string;
  toName: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  mode: "walk" | "transit";
  steps: TripStep[];
  alerts: string[];
  /** live: next train from MBTA predictions. scheduled: from the MBTA timetable at that hour.
   *  estimated: no timetable answer, average wait used. walk: no train needed. */
  accuracy: Accuracy;
  lines: LineId[];
}

export interface TripStopResult {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  role: "start" | "stop" | "end";
  arriveAt: string;
  departAt: string;
  dwellMin: number;
  open?: { state: OpenState; note?: string };
}

export type WarningKind = "closed" | "closing" | "alert" | "walk" | "service" | "access" | "late" | "ordering" | "estimate";

export interface TripWarning {
  kind: WarningKind;
  severity: "info" | "warn" | "bad";
  message: string;
  stopIndex?: number;
  legIndex?: number;
}

export interface TripResult {
  ok: true;
  stops: TripStopResult[];
  legs: TripLeg[];
  startAt: string;
  endAt: string;
  /** Door to door, including time spent at stops. */
  totalMin: number;
  travelMin: number;
  dwellMin: number;
  warnings: TripWarning[];
  /** Indexes into the request's stops, in the order we used. */
  order: number[];
  reordered: boolean;
  savedMin?: number;
  /** Set when arriveBy was given: when to leave to make it. */
  leaveBy?: string;
  /** Weakest source among the train legs. */
  source: Accuracy;
  computedAt: string;
}

export interface TripFailure {
  ok: false;
  error: string;
}
