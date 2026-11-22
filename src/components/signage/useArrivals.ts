"use client";
// Live arrivals for a stop from /api/predictions, polled. Keeps the last good answer on errors.
import { useEffect, useState } from "react";
import type { Arrival } from "@/lib/types";

export function useArrivals(stopId: string | null | undefined, pollMs = 30_000): Arrival[] | null {
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null);

  useEffect(() => {
    if (!stopId) return;
    let alive = true;
    setArrivals(null);
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
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [stopId, pollMs]);

  return arrivals;
}
