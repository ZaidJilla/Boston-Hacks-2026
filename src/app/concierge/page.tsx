"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Arrivals from "@/components/transit/Arrivals";
import LineChip from "@/components/transit/LineChip";
import { getStation } from "@/lib/data";
import type { ChatTurn, ConciergeReply } from "@/lib/agent";
import type { Restaurant } from "@/lib/types";

interface Message extends ChatTurn {
  picks?: Restaurant[];
}

const SUGGESTIONS = [
  "Cheap ramen near the Green Line",
  "Independent pizza, under $15",
  "Tacos by the Orange Line",
  "Something sweet after class",
];

export default function ConciergePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

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
      setMessages((m) => [...m, { role: "assistant", content: data.message as string, picks: data.picks }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <header className="p-4 pb-2">
        <h1 className="text-xl font-bold">Concierge</h1>
        <p className="text-sm text-ink/60">Tell me what you&rsquo;re craving and your budget. I&rsquo;ll find spots near a T stop.</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-black/15 bg-white px-3 py-2 text-sm">
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
            <p className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-line-blue px-3 py-2 text-sm text-white" : "text-sm"}>
              {m.content}
            </p>
            {m.picks?.map((r) => <PickCard key={r.id} r={r} />)}
          </div>
        ))}
        {busy && <p className="text-sm text-ink/50" aria-busy="true">Looking…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="sticky bottom-14 flex gap-2 border-t border-black/10 bg-paper p-3"
      >
        <label htmlFor="q" className="sr-only">What are you craving?</label>
        <input
          id="q" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Cheap ramen near the Green Line"
          className="min-w-0 flex-1 rounded-lg border border-black/20 bg-white px-3 py-3 text-sm"
        />
        <Button disabled={busy || !input.trim()}>Ask</Button>
      </form>
    </div>
  );
}

function PickCard({ r }: { r: Restaurant }) {
  const station = getStation(r.nearestStopId);
  return (
    <div className="space-y-2 rounded-lg bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs capitalize text-ink/60">
            {r.craving} · {"$".repeat(r.price)} · {r.isChain ? "Chain" : "Independent"}
          </p>
        </div>
        <Link href={`/restaurant/${r.id}`} className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
          View
        </Link>
      </div>
      {station && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink/70">
            {station.lines.map((l) => <LineChip key={l} line={l} />)}
            <span>{station.name}</span>
          </div>
          <Arrivals stopId={station.id} limit={2} />
        </>
      )}
    </div>
  );
}
