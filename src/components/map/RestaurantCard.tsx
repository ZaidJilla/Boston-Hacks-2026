"use client";

import Link from "next/link";
import { cravingById, LINE_ORDER, LINE_SHORT, lineColor, type LineId, type Restaurant } from "@/lib/geo";

/** Small round T-line badges, e.g. [G][O]. */
export function LineDots({ lines }: { lines: LineId[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {LINE_ORDER.filter((l) => lines.includes(l)).map((l) => (
        <span
          key={l}
          title={`${l[0].toUpperCase()}${l.slice(1)} Line`}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
          style={{ background: lineColor(l) }}
        >
          {LINE_SHORT[l]}
        </span>
      ))}
    </span>
  );
}

export default function RestaurantCard({
  r,
  unlocked,
  onClose,
}: {
  r: Restaurant;
  unlocked: boolean;
  onClose: () => void;
}) {
  const emoji = cravingById.get(r.craving)?.emoji;
  const st = r.nearestStation;
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
          {r.neighborhoodName} · {unlocked ? "unlocked" : "foggy"}
          {r.isChain && <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px]">Chain</span>}
        </p>
        <h2 className="mt-0.5 pr-10 text-lg font-bold leading-tight text-ink">{r.name}</h2>
        <p className="mt-1 text-sm text-ink/70">
          {emoji} {r.categoryLabel} · <span className="font-semibold text-ink">{r.priceLabel}</span>
          {r.priceEstimated && <span className="text-ink/40"> est.</span>}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink/70">
          <LineDots lines={st.lines} />
          <span>
            {st.name} · {st.walkMin} min walk
          </span>
        </p>
        <Link
          href={`/restaurant/${r.id}`}
          className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl bg-ink text-sm font-semibold text-white"
        >
          View spot
        </Link>
      </div>
    </div>
  );
}
