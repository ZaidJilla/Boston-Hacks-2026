"use client";
// Pick a home neighborhood. Its nearest subway station becomes the home station that scoring
// measures stops from. First pick is free; after that, one change per season.
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/signage/PageHeader";
import Button from "@/components/ui/Button";
import { getClientAuth } from "@/lib/firebase";
import { neighborhoods, stationById } from "@/lib/geo";
import { homeStationFor } from "@/lib/stationGraph";
import type { HomeResult } from "@/lib/types";

const hoods = neighborhoods.features
  .map((f) => ({ id: f.properties.id, name: f.properties.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

async function call(method: "GET" | "POST", neighborhood?: string): Promise<HomeResult> {
  const idToken = await getClientAuth()?.currentUser?.getIdToken();
  const res = await fetch("/api/home", {
    method,
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: method === "POST" ? JSON.stringify({ neighborhood }) : undefined,
  });
  return (await res.json()) as HomeResult;
}

export default function OnboardingPage() {
  const [home, setHome] = useState<HomeResult | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    call("GET").then((h) => {
      setHome(h);
      setPick(h.neighborhood);
    }).catch(() => setError("Couldn't load your home. Try again."));
  }, []);

  const stationName = useMemo(() => {
    const id = pick ? homeStationFor(pick) : null;
    return id ? stationById.get(id)?.name : null;
  }, [pick]);

  const locked = home ? !home.canChange && pick !== home.neighborhood : false;

  async function save() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await call("POST", pick);
      if (!res.ok) throw new Error(res.error ?? "Couldn't save your home.");
      setHome(res);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your home.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Where do you live?" subtitle="The farther you ride from home, the more a visit is worth." />
      <div className="p-4">

      <div role="radiogroup" aria-label="Home neighborhood" className="mt-4 grid grid-cols-2 gap-2">
        {hoods.map((h) => (
          <button
            key={h.id}
            role="radio"
            aria-checked={pick === h.id}
            onClick={() => { setPick(h.id); setSaved(false); }}
            className={`rounded-lg border px-3 py-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-blue ${
              pick === h.id ? "border-line-blue bg-line-blue text-white" : "border-ink bg-white"
            }`}
          >
            {h.name}
          </button>
        ))}
      </div>

      {stationName && <p className="mt-4 text-sm">Home station: <strong>{stationName}</strong></p>}
      {home && !home.canChange && (
        <p className="mt-2 text-sm text-muted">You changed your home this season. You can change it again next season.</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="mt-2 text-sm text-green-700">Saved.</p>}

      <Button className="mt-4 w-full" onClick={save} disabled={!pick || busy || locked || pick === home?.neighborhood}>
        {busy ? "Saving" : "Save home"}
      </Button>
      </div>
    </div>
  );
}
