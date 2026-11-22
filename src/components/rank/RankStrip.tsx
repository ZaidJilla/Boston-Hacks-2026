"use client";
// Your rank and how far you are to the next one, as a slim strip for the top of the map.
// Tapping it opens the profile, where the full rank line lives.
import Link from "next/link";
import { useEffect, useState } from "react";
import { rankProgress } from "@/lib/scoring";
import { RANK_COLORS } from "./RankBadge";
import RankMedallion from "./RankMedallion";
import Train from "./Train";

export default function RankStrip({ points }: { points: number }) {
  const { rank, next, pointsToNext, fraction: pct } = rankProgress(points);

  // The bar fills from empty when the map opens.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const label = next
    ? `${pointsToNext} pts to ${next.name}`
    : "Top rank";
  return (
    <Link
      href="/profile"
      aria-label={`${rank.name}. ${label}. Open your profile`}
      className="flex min-h-[44px] items-center gap-3 rounded-full bg-white/10 px-3 text-white"
    >
      <RankMedallion rankId={rank.id} size={36} ribbon={false} />
      <span className="shrink-0 text-[14px] font-black">{rank.name}</span>
      {/* A little train riding a track toward the next rank */}
      <span className="relative h-8 min-w-[56px] flex-1" aria-hidden="true">
        <span className="absolute inset-x-0 top-[19px] h-[4px] rounded-full bg-white/25" />
        <span
          className="absolute left-0 top-[19px] h-[4px] rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
          style={{ width: `${shown * 100}%`, background: RANK_COLORS[(next ?? rank).id] }}
        />
        <span
          className="absolute top-0 transition-[left] duration-1000 ease-out motion-reduce:transition-none"
          style={{ left: `calc((100% - 44px) * ${shown})` }}
        >
          <Train color={RANK_COLORS[rank.id]} width={44} />
        </span>
        <span className="absolute right-0 top-[15] h-3 w-3 rounded-full border-[3px] border-white bg-black" style={{ top: 15 }} />
      </span>
      <span className="shrink-0 text-[13px] font-extrabold">{label}</span>
    </Link>
  );
}
