"use client";
// The answer: a clock time for every stop, and the trains between them.
import { useState } from "react";
import LineChip from "@/components/transit/LineChip";
import { fmtClock } from "@/lib/clock";
import type { TripLeg, TripResult, TripStopResult, TripWarning } from "@/lib/tripTypes";

export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim() : `${min} min`);

const SOURCE_TEXT = {
  live: "Live train times",
  scheduled: "MBTA timetable times",
  estimated: "Some times are estimated",
  walk: "Walking",
} as const;

const ACCURACY_NOTE: Record<TripLeg["accuracy"], string> = {
  live: "Next train from live MBTA data",
  scheduled: "Next train from the MBTA timetable",
  estimated: "Average wait, no timetable data",
  walk: "No train needed",
};

const WARN_STYLE: Record<TripWarning["severity"], string> = {
  bad: "border-line-red bg-line-red/10",
  warn: "border-line-orange bg-line-orange/10",
  info: "border-black/10 bg-white",
};

export default function TripTimeline({ trip }: { trip: TripResult }) {
  const last = trip.stops[trip.stops.length - 1];
  const stopCount = trip.stops.length - 2;
  return (
    <section aria-label="Your trip" className="space-y-3">
      <div className="rounded-xl bg-ink p-4 text-white">
        {trip.leaveBy && <p className="text-sm text-white/70">Leave by <span className="font-semibold text-white">{fmtClock(trip.leaveBy)}</span> to make it</p>}
        <p className="text-sm text-white/70">{stopCount > 0 ? `${stopCount} stop${stopCount > 1 ? "s" : ""} along the way` : "Direct"}</p>
        <p className="mt-1 text-2xl font-bold leading-tight">Done at {fmtClock(last.arriveAt)}</p>
        <p className="mt-1 text-sm text-white/80">
          {fmtDuration(trip.totalMin)} door to door · {fmtDuration(trip.travelMin)} getting around
          {trip.dwellMin > 0 && ` · ${fmtDuration(trip.dwellMin)} at stops`}
        </p>
        <p className="mt-2 text-xs text-white/60">{SOURCE_TEXT[trip.source]}</p>
      </div>

      {trip.warnings.length > 0 && (
        <ul className="space-y-2" aria-label="Heads up">
          {trip.warnings.map((w, i) => (
            <li key={i} role={w.severity === "bad" ? "alert" : undefined} className={`rounded-lg border p-3 text-sm ${WARN_STYLE[w.severity]}`}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      <ol className="space-y-0">
        {trip.stops.map((s, i) => (
          <li key={i}>
            <StopRow stop={s} />
            {trip.legs[i] && <LegRow leg={trip.legs[i]} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StopRow({ stop }: { stop: TripStopResult }) {
  const openStyle = stop.open?.state === "closed" ? "text-line-red" : stop.open?.state === "closing" ? "text-line-orange" : "text-line-green";
  return (
    <div className="flex gap-3">
      <div className="flex w-3 flex-col items-center" aria-hidden>
        <span className={`mt-1.5 h-3 w-3 rounded-full border-2 border-ink ${stop.role === "stop" ? "bg-white" : "bg-ink"}`} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="font-semibold leading-tight">{stop.name}</p>
        <p className="text-sm text-ink/70">
          {stop.role === "start" ? `Leave ${fmtClock(stop.departAt)}` : stop.role === "end" ? `Arrive ${fmtClock(stop.arriveAt)}` : `Arrive ${fmtClock(stop.arriveAt)} · leave ${fmtClock(stop.departAt)} (${stop.dwellMin} min)`}
        </p>
        {stop.open && <p className={`text-xs font-medium ${openStyle}`}>{stop.open.note}</p>}
      </div>
    </div>
  );
}

function LegRow({ leg }: { leg: TripLeg }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3">
      <div className="flex w-3 justify-center" aria-hidden>
        <span className="my-0.5 w-0.5 flex-1 bg-ink/25" />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[44px] w-full flex-wrap items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-left text-sm">
          {leg.lines.map((l) => <LineChip key={l} line={l} />)}
          {leg.mode === "walk" && <span className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold">Walk</span>}
          <span className="font-medium">{fmtDuration(leg.durationMin)}</span>
          <span className="text-ink/60">{fmtClock(leg.departAt)} to {fmtClock(leg.arriveAt)}</span>
          <span className="ml-auto text-ink/50" aria-hidden>{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="mt-1 space-y-1 rounded-lg bg-white px-3 py-2">
            <ol className="space-y-1.5">
              {leg.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-16 shrink-0 text-xs tabular-nums text-ink/60">{fmtClock(s.startAt)}</span>
                  <span>{s.label} <span className="text-ink/50">· {s.minutes} min</span></span>
                </li>
              ))}
            </ol>
            <p className="pt-1 text-xs text-ink/50">{ACCURACY_NOTE[leg.accuracy]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
