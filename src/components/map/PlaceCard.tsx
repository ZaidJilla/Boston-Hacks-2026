"use client";
// Bottom card for a landmark or shopping place picked on the map.
import Arrivals from "@/components/transit/Arrivals";
import type { MapPlace } from "@/lib/geo";
import { LineDots } from "./RestaurantCard";

const TYPE_LABEL: Record<MapPlace["type"], string> = { landmark: "Landmark", shopping: "Shopping", store: "Store" };

export default function PlaceCard({ p, unlocked, onClose }: { p: MapPlace; unlocked: boolean; onClose: () => void }) {
  const st = p.nearestStation;
  const what = p.subtype.replace(/^historic-/, "").replace(/_/g, " ");
  return (
    <div className="fixed inset-x-3 bottom-[164px] z-[1001] mx-auto max-w-md">
      <div className="relative rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-ink/50 active:bg-black/5"
        >
          ✕
        </button>
        <p className="pr-10 text-xs font-medium text-ink/60">
          {p.neighborhoodName} · {unlocked ? "unlocked" : "foggy"}
        </p>
        <h2 className="mt-0.5 pr-10 text-lg font-bold leading-tight text-ink">{p.name}</h2>
        <p className="mt-1 text-sm capitalize text-ink/70">
          {TYPE_LABEL[p.type]} · {what}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink/70">
          <LineDots lines={st.lines} />
          <span>
            {st.name} · {st.walkMin} min walk
          </span>
        </p>
        <div className="mt-2">
          <Arrivals stopId={st.id} limit={2} />
        </div>
        {p.openingHours && <p className="mt-2 text-xs text-ink/60">Hours: {p.openingHours}</p>}
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white"
          >
            Open website
          </a>
        )}
      </div>
    </div>
  );
}
