"use client";

import Link from "next/link";
import LineBullet from "@/components/signage/LineBullet";
import StationDots from "@/components/signage/StationDots";
import { LINE_ORDER, UNLOCK_THRESHOLD, type Restaurant } from "@/lib/geo";

/**
 * Bottom card on the map: the neighborhood's fog status and progress, plus one suggested spot.
 * The whole card links to the restaurant page.
 */
export default function PeekCard({
  r,
  hoodName,
  unlocked,
  eaten,
  points,
}: {
  r: Restaurant;
  hoodName: string;
  unlocked: boolean;
  /** distinct restaurants the player has eaten at in this neighborhood */
  eaten: number;
  /** what a check-in here would earn this player, with the reason */
  points?: { total: number; why: string };
}) {
  const st = r.nearestStation;
  const line = LINE_ORDER.find((l) => st.lines.includes(l));
  const left = Math.max(0, UNLOCK_THRESHOLD - eaten);
  // Unlocking takes UNLOCK_THRESHOLD eaten, so an unlocked area is always full.
  const done = unlocked ? UNLOCK_THRESHOLD : Math.min(eaten, UNLOCK_THRESHOLD);

  return (
    <Link
      href={`/restaurant/${r.id}`}
      className="block overflow-hidden rounded-card bg-white shadow-card"
      aria-label={`${r.name}. ${r.categoryLabel}, ${r.priceLabel}, ${st.name}, ${st.walkMin} minute walk. ${hoodName}, ${
        unlocked ? "unlocked" : `in fog, ${left} more to unlock`
      }. Get there`}
    >
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2.5 text-white">
        <span className="eyebrow min-w-0 truncate text-[13px]">
          {hoodName} · {unlocked ? "Unlocked" : "In fog"}
        </span>
        <span className="shrink-0 text-[14px] font-extrabold text-signal">
          {unlocked ? "Fog cleared" : `${left} more to unlock`}
        </span>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-3.5">
        <StationDots total={UNLOCK_THRESHOLD} done={done} label={`${done} of ${UNLOCK_THRESHOLD} eaten`} />

        <div className="flex items-center gap-3">
          {line && <LineBullet line={line} size={36} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-black leading-tight tracking-[-0.5px]">{r.name}</p>
            {points && (
              <div className="my-0.5">
                <span className="inline-block rounded-full bg-signal px-2.5 py-0.5 text-[14px] font-extrabold text-ink">+{points.total} for you</span>
                {points.why && <p className="mt-0.5 text-[13px] font-semibold leading-snug text-muted">{points.why}</p>}
              </div>
            )}
            <p className="truncate text-[14px] leading-snug text-muted">
              {r.categoryLabel} · {r.priceLabel}
            </p>
            <p className="truncate text-[14px] leading-snug text-muted">
              {st.name}, {st.walkMin} min walk
            </p>
          </div>
          <span className="flex min-h-[44px] shrink-0 items-center rounded-full bg-ink px-4 text-[15px] font-extrabold text-white">
            Get there
          </span>
        </div>
      </div>
    </Link>
  );
}
