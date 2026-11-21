"use client";
// "Get there": transit route from the user's location (or the default campus origin).
import { useState } from "react";
import Button from "@/components/ui/Button";
import { LINE_COLORS } from "@/lib/config";
import type { RouteResult, RouteStep } from "@/lib/types";

function getPosition(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export default function RoutePanel({ restaurantId }: { restaurantId: string }) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const origin = await getPosition();
      const res = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, restaurantId }),
      });
      if (!res.ok) throw new Error();
      setRoute(await res.json());
    } catch {
      setError("Couldn't get directions. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Button onClick={load} disabled={busy} className="w-full">
        {busy ? "Finding route…" : "Get there"}
      </Button>
      {error && <p role="alert" className="text-sm text-line-red">{error}</p>}
      {route && (
        <div className="space-y-2">
          {route.alerts?.map((a, i) => (
            <p key={i} role="status" className="rounded-lg border border-line-orange bg-line-orange/10 p-3 text-sm">
              <span className="font-semibold">Service alert: </span>{a}
            </p>
          ))}
        <div className="rounded-lg bg-white p-3" role="region" aria-label="Route">
          <p className="font-semibold">{route.durationMin} min · {route.distanceKm} km</p>
          <ol className="mt-2 space-y-2">
            {route.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <StepBadge step={s} />
                <span className="flex-1">{s.label}</span>
                <span className="tabular-nums text-ink/60">{s.minutes} min</span>
              </li>
            ))}
          </ol>
        </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ step }: { step: RouteStep }) {
  if (step.mode === "walk" || (!step.line && !step.color)) {
    return <span className="inline-flex min-w-9 justify-center rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink/70">Walk</span>;
  }
  const color = step.line ? LINE_COLORS[step.line] : step.color;
  const text = step.mode === "bus" ? step.routeShort ?? "Bus" : step.line ? step.line[0].toUpperCase() : "T";
  return (
    <span
      className="inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: color }}
      aria-label={step.mode === "bus" ? `Bus ${text}` : "Train"}
    >
      {text}
    </span>
  );
}
