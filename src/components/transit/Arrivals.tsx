"use client";
// Live arrivals for a stop. Polls /api/predictions every 30 s.
import { useEffect, useState } from "react";
import type { Arrival } from "@/lib/types";
import LineChip from "./LineChip";

export default function Arrivals({ stopId, limit = 4, pollMs = 30_000 }: { stopId: string; limit?: number; pollMs?: number }) {
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/predictions?stop=${encodeURIComponent(stopId)}`);
        if (alive && res.ok) setArrivals(await res.json());
      } catch {
        /* keep the last arrivals */
      }
    };
    load();
    const t = setInterval(load, pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [stopId, pollMs]);

  if (!arrivals) return <p className="text-sm text-ink/50" aria-busy="true">Loading arrivals…</p>;
  if (!arrivals.length) return <p className="text-sm text-ink/60">No trains soon.</p>;

  return (
    <ul className="space-y-1.5" aria-label="Live arrivals">
      {arrivals.slice(0, limit).map((a, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <LineChip line={a.line} />
          <span className="min-w-0 flex-1 truncate text-ink/80">{a.headsign || "Inbound"}</span>
          <span className="font-semibold tabular-nums">{a.minutes <= 0 ? "Now" : `${a.minutes} min`}</span>
        </li>
      ))}
    </ul>
  );
}
