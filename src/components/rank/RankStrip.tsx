"use client";
// Your rank and how far you are to the next one, as a slim strip for the top of the map.
// Tapping it opens the profile, where the full rank line lives.
import Link from "next/link";
import { useEffect, useState } from "react";
import { rankProgress } from "@/lib/scoring";
import RankBadge, { RANK_COLORS } from "./RankBadge";

export default function RankStrip({ unlocked }: { unlocked: number }) {
  const { rank, next, unlocksToNext } = rankProgress(unlocked);
  const pct = next ? Math.min(1, Math.max(0, (unlocked - rank.minUnlocks) / (next.minUnlocks - rank.minUnlocks))) : 1;

  // The bar fills from empty when the map opens.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const label = next
    ? `${unlocksToNext} more ${unlocksToNext === 1 ? "unlock" : "unlocks"} to ${next.name}`
    : "Top rank";
  return (
    <Link
      href="/profile"
      aria-label={`${rank.name}. ${label}. Open your profile`}
      className="flex min-h-[44px] items-center gap-3 rounded-full bg-white/10 px-3 text-white"
    >
      <RankBadge rank={rank} />
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
          style={{ width: `${shown * 100}%`, background: RANK_COLORS[(next ?? rank).id] }}
        />
      </span>
      <span className="shrink-0 text-[13px] font-extrabold">{label}</span>
    </Link>
  );
}
