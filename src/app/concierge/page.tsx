"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AddToTrip from "@/components/plan/AddToTrip";
import { chipClass } from "@/components/ui/Button";
import PageHeader from "@/components/signage/PageHeader";
import LineBullet, { LINE_NAME, LINE_ORDER, lineTextColor } from "@/components/signage/LineBullet";
import RouteStrip from "@/components/signage/RouteStrip";
import ConciergeMark from "@/components/concierge/ConciergeMark";
import { ArrowUpIcon } from "@/components/signage/Icons";
import { useArrivals } from "@/components/signage/useArrivals";
import { useUnlocked } from "@/components/map/useUnlocked";
import { LINE_COLORS } from "@/lib/config";
// lib/data, not lib/geo: geo also bundles the neighborhood polygons, which this page doesn't need.
import { getStation, restaurants as baseRestaurants } from "@/lib/data";
import { UNLOCK_THRESHOLD } from "@/lib/scoring";
import type { CravingInfo, Restaurant as FullRestaurant } from "@/lib/geo";
import cravingsJson from "../../../data/cravings.json";
import type { ChatTurn, ConciergeReply, DetourInfo } from "@/lib/agent";
import type { Craving, PlaceRow, Restaurant, RouteResult } from "@/lib/types";

interface Message extends ChatTurn {
  picks?: Restaurant[];
  /** Landmarks and shopping from a route-aware answer. */
  places?: PlaceRow[];
  detours?: DetourInfo[];
}

const QUICK_REPLIES = ["Cheaper", "Somewhere new", "Open now"];
const ROUTE_EXAMPLES = [
  "I'm at Kenmore going to Chinatown, I also want food",
  "Kenmore to Chinatown, I also want to go shopping",
  "From Harvard to Fenway, show me a museum or park",
];

// data/restaurants.json carries more fields than the base type; same objects as lib/geo.
const restaurants = baseRestaurants as FullRestaurant[];
const byId = new Map(restaurants.map((r) => [r.id, r]));
const cravings = cravingsJson as CravingInfo[];

export default function ConciergePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [craving, setCraving] = useState<Craving | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const history: ChatTurn[] = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history }),
      });
      const data = (await res.json()) as Partial<ConciergeReply>;
      if (!res.ok || !data.message) throw new Error(data.message ?? "bad response");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.message as string, picks: data.picks, places: data.places, detours: data.detours },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setBusy(false);
  }

  const last = messages[messages.length - 1];

  return (
    <div className="flex min-h-[calc(100dvh-60px)] flex-col">
      <PageHeader
        title="Concierge"
        subtitle="Your next move, by T"
        leading={<ConciergeMark size={48} />}
      />

      <div
        className="flex gap-2.5 overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Quick picks"
      >
        {cravings.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={craving === c.id}
            disabled={busy}
            onClick={() => {
              setCraving(c.id);
              send(`${c.label} near the T`);
            }}
            className={`${chipClass(craving === c.id)} !h-11 !px-5 !text-[15px]`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 px-4 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex flex-col items-center pb-1 pt-3 text-center">
              <div className="unlock-drop-soft"><ConciergeMark size={104} /></div>
              <h2 className="mt-3 text-[26px] font-black leading-tight tracking-[-0.5px]">What&rsquo;s the plan?</h2>
              <p className="mt-1 max-w-[280px] text-[15px] text-muted">Pick a mood below, or tell me where you&rsquo;re headed.</p>
            </div>
            <p className="max-w-[88%] rounded-[18px] rounded-bl-[4px] bg-panel px-4 py-3 text-[16px] leading-snug">
              Tell me what you&rsquo;re in the mood for and your budget, or where you&rsquo;re starting and where you&rsquo;re going.
              I&rsquo;ll find stops that barely change your trip.
            </p>
            <div className="flex flex-wrap gap-2.5" role="group" aria-label="Examples">
              {ROUTE_EXAMPLES.map((q) => (
                <button key={q} type="button" disabled={busy} onClick={() => send(q)} className={`${chipClass()} !h-auto !min-h-[44px] !max-w-full !shrink !whitespace-normal !px-4 !py-2 text-left !text-[15px]`}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[18px] rounded-br-[4px] bg-ink px-4 py-3 text-[16px] font-bold leading-snug text-white">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <div className="flex items-end gap-2">
                <span className="shrink-0"><ConciergeMark size={28} /></span>
                <p className="max-w-[88%] rounded-[18px] rounded-bl-[4px] bg-panel px-4 py-3 text-[16px] leading-snug">
                  {m.content}
                </p>
              </div>
              {m.places?.map((p) => <PlacePick key={p.id} p={p} detour={m.detours?.find((d) => d.id === p.id)} />)}
              {m.picks?.map((r) => <PickCard key={r.id} id={r.id} detour={m.detours?.find((d) => d.id === r.id)} />)}
            </div>
          ),
        )}

        {busy && (
          <p className="text-[15px] font-semibold text-muted" aria-busy="true">
            Looking…
          </p>
        )}

        {!busy && last?.role === "assistant" && (
          <div className="flex flex-wrap gap-2.5 pt-1" role="group" aria-label="Quick replies">
            {QUICK_REPLIES.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} className={`${chipClass()} !h-11 !px-5 !text-[15px]`}>
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-nav flex items-center gap-2.5 border-t-2 border-ink bg-white px-4 py-3"
      >
        <label htmlFor="q" className="sr-only">
          What&rsquo;s the plan?
        </label>
        <input
          id="q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What's the plan?"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-full border-2 border-ink bg-white px-5 text-[16px] placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-line-blue text-white disabled:opacity-50"
        >
          <ArrowUpIcon size={24} />
        </button>
      </form>
    </div>
  );
}

/** One suggested spot: line-colored station strip with the next train, then the spot and its trip. */
function PickCard({ id, detour }: { id: string; detour?: DetourInfo }) {
  const r = byId.get(id);
  const { unlocked, checkins } = useUnlocked();
  const st = r?.nearestStation;
  const line = st ? LINE_ORDER.find((l) => st.lines.includes(l)) : undefined;
  const arrivals = useArrivals(st?.id);
  const next = arrivals?.find((a) => !line || a.line === line);
  const [route, setRoute] = useState<RouteResult | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: id }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => alive && data && setRoute(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  if (!r || !st) return null;
  const color = line ? LINE_COLORS[line] : "#000000";
  const fg = line ? lineTextColor(line) : "#FFFFFF";
  const eaten = restaurants.filter((x) => x.neighborhood === r.neighborhood && checkins.has(x.id)).length;
  const left = unlocked.has(r.neighborhood) ? 0 : Math.max(0, UNLOCK_THRESHOLD - eaten);

  return (
    <div className="space-y-2">
    <Link href={`/restaurant/${r.id}`} className="block overflow-hidden rounded-card border-2 border-ink bg-white shadow-soft">
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: color, color: fg }}>
        <span className="flex min-w-0 items-center gap-2">
          {line && <LineBullet line={line} size={26} inverted label={false} />}
          <span className="truncate text-[15px] font-extrabold">
            {line ? LINE_NAME[line] : "T"} · {st.name}
          </span>
        </span>
        {next && (
          <span className="shrink-0 text-[15px] font-extrabold">
            Next train {next.minutes <= 0 ? "now" : `${next.minutes} min`}
          </span>
        )}
      </div>
      <div className="space-y-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[20px] font-black leading-tight tracking-[-0.5px]">{r.name}</p>
            <p className="truncate text-[15px] text-muted">
              {r.categoryLabel} · {r.priceLabel} · {r.neighborhoodName}
            </p>
          </div>
          {left > 0 && (
            <span className="shrink-0 rounded-full bg-signal px-3 py-1.5 text-[14px] font-extrabold text-ink">
              {left} left to unlock
            </span>
          )}
        </div>
        {detour && <p className="text-[14px] font-bold text-line-blue">{`+${detour.addedMin} min. ${detour.reason}`}</p>}
        {route && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <RouteStrip route={route} compact />
            </div>
            <span className="shrink-0 text-[16px] font-black">{route.durationMin} min</span>
          </div>
        )}
      </div>
    </Link>
    <AddToTrip itemKey={`r:${r.id}`} name={r.name} />
    </div>
  );
}

/** A landmark or shopping pick from a route-aware answer. Same strip-and-card look as a restaurant. */
function PlacePick({ p, detour }: { p: PlaceRow; detour?: DetourInfo }) {
  const st = getStation(p.nearestStopId);
  const line = st ? LINE_ORDER.find((l) => st.lines.includes(l)) : undefined;
  const arrivals = useArrivals(st?.id);
  const next = arrivals?.find((a) => !line || a.line === line);
  const color = line ? LINE_COLORS[line] : "#000000";
  const fg = line ? lineTextColor(line) : "#FFFFFF";
  const what = p.subtype.replace(/^historic-/, "").replace(/_/g, " ");
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-card border-2 border-ink bg-white shadow-soft">
        {st && (
          <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: color, color: fg }}>
            <span className="flex min-w-0 items-center gap-2">
              {line && <LineBullet line={line} size={26} inverted label={false} />}
              <span className="truncate text-[15px] font-extrabold">
                {line ? LINE_NAME[line] : "T"} · {st.name}
              </span>
            </span>
            {next && (
              <span className="shrink-0 text-[15px] font-extrabold">
                Next train {next.minutes <= 0 ? "now" : `${next.minutes} min`}
              </span>
            )}
          </div>
        )}
        <div className="space-y-2 px-4 py-3">
          <p className="truncate text-[20px] font-black leading-tight tracking-[-0.5px]">{p.name}</p>
          <p className="truncate text-[15px] capitalize text-muted">
            {p.type === "landmark" ? "Landmark" : "Shopping"} · {what} · {p.neighborhoodName}
          </p>
          {detour && <p className="text-[14px] font-bold text-line-blue">{`+${detour.addedMin} min. ${detour.reason}`}</p>}
        </div>
      </div>
      <AddToTrip itemKey={`p:${p.id}`} name={p.name} />
    </div>
  );
}
