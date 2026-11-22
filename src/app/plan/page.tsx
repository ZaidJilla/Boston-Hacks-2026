"use client";
// Plan a day on the T: a start, stops along the way, an end. One timeline with a clock time for every
// stop, because transit apps only do A to B.
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import PlacePicker, { toUiPlace, type UiPlace } from "@/components/plan/PlacePicker";
import TripTimeline from "@/components/plan/TripTimeline";
import { allItems, itemByKey } from "@/components/plan/searchItems";
import { DEFAULT_ORIGIN } from "@/lib/config";
import { readDraft, writeDraft } from "@/lib/tripDraft";
import type { TripFailure, TripResult } from "@/lib/tripTypes";

const MAX_VIA = 6;
const DWELL_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

const HOME: UiPlace = { name: "Northeastern", lat: DEFAULT_ORIGIN.lat, lng: DEFAULT_ORIGIN.lng, dwellMin: 0 };

function example(): { start: UiPlace; via: UiPlace[]; end: UiPlace } {
  const items = allItems();
  // The T stop is also called "Museum of Fine Arts", so pick the museum itself.
  const mfa = items.find((i) => i.name === "Museum of Fine Arts" && i.kind === "landmark");
  const food = items.find((i) => i.kind === "restaurant" && i.sub.includes("Chinatown")) ?? items.find((i) => i.kind === "restaurant");
  const via: UiPlace[] = [];
  if (mfa) via.push({ ...toUiPlace(mfa), dwellMin: 90 });
  if (food) via.push({ ...toUiPlace(food), dwellMin: 60 });
  via.push({ name: "Theater District", lat: 42.3513, lng: -71.0652, dwellMin: 150 });
  return { start: HOME, via, end: { ...HOME, name: "Back to Northeastern" } };
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink/60">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-line-green" : "bg-black/20"}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export default function PlanPage() {
  const [start, setStart] = useState<UiPlace | null>(HOME);
  const [via, setVia] = useState<UiPlace[]>([]);
  const [end, setEnd] = useState<UiPlace | null>(null);
  const [leaveMode, setLeaveMode] = useState<"now" | "later" | "arrive">("now");
  const [leaveAt, setLeaveAt] = useState("");
  const [arriveAt, setArriveAt] = useState("");
  const [optimize, setOptimize] = useState(false);
  const [stepFree, setStepFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripResult | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore a shared plan (?s=key,key,...&o=1) and set sensible default times in the browser's clock.
  useEffect(() => {
    const d = new Date();
    setNow(d);
    setLeaveAt(toLocalInput(new Date(d.getTime() + 60 * 60_000)));
    setArriveAt(toLocalInput(new Date(d.getTime() + 5 * 3600_000)));
    const q = new URLSearchParams(window.location.search);
    const keys = (q.get("s") ?? "").split(",").filter(Boolean).slice(0, MAX_VIA + 2);
    const places = keys.map((k) => itemByKey(k)).filter(Boolean).map((i) => toUiPlace(i!));
    if (places.length >= 2) {
      setStart(places[0]);
      setVia(places.slice(1, -1));
      setEnd(places[places.length - 1]);
      if (q.get("o") === "1") setOptimize(true);
    } else {
      // Stops added from the concierge (or elsewhere) wait here in this browser.
      const saved = readDraft().map((k) => itemByKey(k)).filter(Boolean).map((i) => toUiPlace(i!));
      if (saved.length) setVia(saved);
    }
    setHydrated(true);
  }, []);

  // Keep the shared list in step with what is on this page (only places we can identify by key).
  useEffect(() => {
    if (hydrated) writeDraft(via.map((p) => p.key).filter(Boolean) as string[]);
  }, [via, hydrated]);

  const ready = Boolean(start && end);
  const shareKeys = useMemo(() => [start, ...via, end].map((p) => p?.key).filter(Boolean) as string[], [start, via, end]);
  const canShare = ready && shareKeys.length === via.length + 2;

  const move = (i: number, dir: -1 | 1) =>
    setVia((v) => {
      const j = i + dir;
      if (j < 0 || j >= v.length) return v;
      const next = [...v];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function plan() {
    if (!start || !end) return;
    setBusy(true);
    setError(null);
    setTrip(null);
    try {
      const stops = [start, ...via, end].map((p) => ({ id: p.key, name: p.name, lat: p.lat, lng: p.lng, dwellMin: p.dwellMin, openingHours: p.openingHours ?? null }));
      const body = {
        stops, optimize, stepFree,
        departAt: leaveMode === "later" && leaveAt ? new Date(leaveAt).toISOString() : undefined,
        arriveBy: leaveMode === "arrive" && arriveAt ? new Date(arriveAt).toISOString() : undefined,
      };
      const res = await fetch("/api/trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as TripResult | TripFailure;
      if (!res.ok || !data.ok) throw new Error(("error" in data && data.error) || "We couldn't plan that trip. Try again.");
      setTrip(data);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : e instanceof Error ? e.message : "We couldn't plan that trip. Try again.");
    }
    setBusy(false);
  }

  async function copyLink() {
    const url = `${window.location.origin}/plan?s=${shareKeys.join(",")}${optimize ? "&o=1" : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const minLocal = now ? toLocalInput(now) : undefined;

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-bold">Plan your day</h1>
        <p className="text-sm text-ink/60">Add every stop. Get one timeline with train times for the whole trip.</p>
      </header>

      <button
        type="button"
        onClick={() => { const e = example(); setStart(e.start); setVia(e.via); setEnd(e.end); setTrip(null); setError(null); setLeaveMode("now"); }}
        className="min-h-[44px] rounded-full border border-black/15 bg-white px-4 text-sm"
      >
        Try an example: museum, dinner, show
      </button>

      <section className="space-y-3 rounded-xl bg-white p-3" aria-label="Stops">
        <PlacePicker label="Start" placeholder="Where are you starting?" value={start} onPick={setStart} onClear={() => setStart(null)} allowLocation />

        {via.length > 0 && (
          <ol className="space-y-2" aria-label="Stops along the way">
            {via.map((p, i) => (
              <li key={`${p.key ?? p.name}-${i}`} className="rounded-lg border border-black/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{i + 1}. {p.name}</p>
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} earlier`} className="h-11 w-11 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === via.length - 1} aria-label={`Move ${p.name} later`} className="h-11 w-11 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => setVia((v) => v.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`} className="h-11 w-11 text-line-red">✕</button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-ink/70">
                  Stay
                  <select
                    value={p.dwellMin}
                    onChange={(e) => setVia((v) => v.map((x, j) => (j === i ? { ...x, dwellMin: Number(e.target.value) } : x)))}
                    className="min-h-[36px] rounded-md border border-black/20 bg-white px-2 text-sm"
                  >
                    {[...new Set([...DWELL_OPTIONS, p.dwellMin])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ol>
        )}

        {via.length < MAX_VIA ? (
          <PlacePicker
            key={via.length}
            label="Add a stop"
            placeholder="Museum, restaurant, park, shop…"
            value={null}
            onPick={(p) => setVia((v) => [...v, p])}
          />
        ) : (
          <p className="text-xs text-ink/60">That&apos;s the most stops a trip can have.</p>
        )}

        <PlacePicker label="End" placeholder="Where do you finish?" value={end} onPick={setEnd} onClear={() => setEnd(null)} />
      </section>

      <section className="space-y-2 rounded-xl bg-white p-3" aria-label="Timing and options">
        <div role="radiogroup" aria-label="When" className="flex gap-2">
          {([["now", "Leave now"], ["later", "Leave at"], ["arrive", "Arrive by"]] as const).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={leaveMode === m} onClick={() => setLeaveMode(m)}
              className={`min-h-[44px] flex-1 rounded-lg border text-sm font-medium ${leaveMode === m ? "border-ink bg-ink text-white" : "border-black/20 bg-white"}`}>
              {label}
            </button>
          ))}
        </div>
        {leaveMode === "later" && (
          <label className="block text-sm">Leave at
            <input type="datetime-local" value={leaveAt} min={minLocal} onChange={(e) => setLeaveAt(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-black/20 px-3" />
          </label>
        )}
        {leaveMode === "arrive" && (
          <label className="block text-sm">Be at the end by
            <input type="datetime-local" value={arriveAt} min={minLocal} onChange={(e) => setArriveAt(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-black/20 px-3" />
          </label>
        )}
        <Switch label="Earliest finish" hint="We try different stop orders against real train times and pick the one that ends earliest, with everything open." on={optimize} onChange={setOptimize} />
        <Switch label="Step-free" hint="Warn me about stations with no elevator or ramp." on={stepFree} onChange={setStepFree} />
      </section>

      <Button onClick={plan} disabled={!ready || busy || (leaveMode === "later" && !leaveAt) || (leaveMode === "arrive" && !arriveAt)} className="w-full">
        {busy ? "Planning…" : "Plan trip"}
      </Button>
      {!ready && <p className="text-xs text-ink/60">Pick a start and an end to plan.</p>}
      {error && <p role="alert" className="rounded-lg border border-line-red bg-line-red/10 p-3 text-sm">{error}</p>}

      <div ref={resultRef} aria-live="polite" className="scroll-mt-4 space-y-3">
        {trip && (
          <>
            <TripTimeline trip={trip} />
            <div className="flex gap-2">
              {canShare && (
                <button type="button" onClick={copyLink} className="min-h-[44px] flex-1 rounded-lg border border-black/20 bg-white text-sm font-medium">
                  {copied ? "Link copied" : "Copy plan link"}
                </button>
              )}
              <button type="button" onClick={plan} disabled={busy} className="min-h-[44px] flex-1 rounded-lg border border-black/20 bg-white text-sm font-medium disabled:opacity-50">
                Refresh times
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
