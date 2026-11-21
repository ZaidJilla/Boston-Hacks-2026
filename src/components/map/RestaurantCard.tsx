"use client";

import Link from "next/link";
import { cravingById, lineById, type Restaurant } from "@/lib/geo";

export function LineDots({ lineIds }: { lineIds: string[] }) {
  // collapse Green B/C/D/E into one dot
  const seen = new Set<string>();
  const dots = lineIds
    .map((id) => lineById.get(id))
    .filter((l): l is NonNullable<typeof l> => !!l && !seen.has(l.group) && !!seen.add(l.group));
  return (
    <span className="inline-flex gap-0.5">
      {dots.map((l) => (
        <span
          key={l.group}
          title={l.name}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
          style={{ background: l.color, color: l.textColor }}
        >
          {l.group === "silver" ? "SL" : l.group[0].toUpperCase()}
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
  const c = cravingById.get(r.craving);
  const st = r.nearestStation;
  return (
    <div className="fixed inset-x-3 bottom-[104px] z-[1001] mx-auto max-w-md">
      <div className="relative rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
        >
          ✕
        </button>
        <Link href={`/restaurant/${r.id}`} className="block pr-8">
          <p className="text-xs font-medium text-slate-500">
            {unlocked ? "✓" : "🌫️"} {r.neighborhoodName}
            {r.isChain && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">chain</span>}
          </p>
          <h2 className="mt-0.5 text-lg font-bold leading-tight text-slate-900">{r.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {c?.emoji} {c?.label} · <span className="font-semibold text-slate-800">{r.priceLabel}</span>
            {r.priceEstimated && <span className="text-slate-400"> est.</span>}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
            <LineDots lineIds={st.lines} />
            <span>
              {st.name} · {st.walkMin} min walk
            </span>
          </p>
          <span className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
            View spot →
          </span>
        </Link>
      </div>
    </div>
  );
}
