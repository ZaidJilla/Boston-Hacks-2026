"use client";
// "Get there": transit route from the user's location (or the default campus origin) via
// /api/directions, drawn as a strip, with the CO2 saved versus a rideshare.
import { useState } from "react";
import Button from "@/components/ui/Button";
import RouteStrip, { RouteSteps } from "@/components/signage/RouteStrip";
import { co2SavedKg } from "@/lib/scoring";
import type { RouteResult } from "@/lib/types";

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

export default function GetThereCard({ restaurantId, name }: { restaurantId: string; name: string }) {
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

  const walkOnly = route?.steps.every((s) => s.mode === "walk" || (!s.line && !s.color));
  const saved = route ? co2SavedKg(route.distanceKm, walkOnly ? "walk" : "transit") : 0;

  return (
    <section className="space-y-3 rounded-card border-2 border-ink p-4" aria-labelledby="get-there-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="get-there-h" className="eyebrow shrink-0 text-[13px]">Get there</h2>
        {route && (
          <p className="text-right text-[17px] font-black tracking-[-0.3px]">
            {route.durationMin} min{saved >= 0.05 && <> · saves {saved.toFixed(1)} kg CO2</>}
          </p>
        )}
      </div>

      {route ? (
        <>
          <RouteStrip route={route} />
          <div className="border-t-2 border-hairline pt-3">
            <RouteSteps route={route} destination={name} />
          </div>
          {route.alerts?.map((a, i) => (
            <p key={i} role="status" className="rounded-card bg-signal px-3 py-2 text-[14px] font-semibold text-ink">
              <span className="font-extrabold">Service alert: </span>
              {a}
            </p>
          ))}
        </>
      ) : (
        <p className="text-[15px] text-muted">The fastest way by T from where you are.</p>
      )}

      {error && <p role="alert" className="text-[14px] font-bold text-line-red">{error}</p>}

      {!route && (
        <Button onClick={load} disabled={busy} className="w-full">
          {busy ? "Finding route…" : "Get there"}
        </Button>
      )}
    </section>
  );
}
