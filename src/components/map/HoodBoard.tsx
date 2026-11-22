"use client";
// Who is eating the most in the neighborhood you just opened: top three, with a link to the full board.
import Link from "next/link";
import { useEffect, useState } from "react";
import RankMedallion from "@/components/rank/RankMedallion";
import { useUser } from "@/lib/auth";
import { RANKS } from "@/lib/scoring";
import type { LeaderboardRow } from "@/lib/types";

const MEDAL = ["bg-signal", "bg-white border-2 border-ink", "bg-line-orange"];

export default function HoodBoard({ hoodId, hoodName }: { hoodId: string; hoodName: string }) {
  const { user } = useUser();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/leaderboard?tab=hood&hood=${encodeURIComponent(hoodId)}&limit=3`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => alive && setRows(d as LeaderboardRow[]))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [hoodId]);

  return (
    <section aria-label={`Top players in ${hoodName}`} className="rise rounded-card bg-white p-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-black tracking-[-0.3px]">Top in {hoodName}</h2>
        <Link href={`/leaderboard?tab=hood&hood=${hoodId}`} className="hit-44 text-[14px] font-extrabold text-line-blue underline underline-offset-2">
          Full board
        </Link>
      </div>
      {rows === null ? (
        <p className="mt-2 text-[14px] text-muted" aria-busy="true">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[14px] text-muted">Nobody yet. Be the first to eat here.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2.5">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black ${MEDAL[i]}`}>{i + 1}</span>
              {r.rank && <RankMedallion rankId={r.rank} size={26} ribbon={false} />}
              <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
                {r.name}
                {user?.uid === r.id && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 align-middle text-[10px] font-black text-signal">YOU</span>}
              </span>
              {r.rank && <span className="hidden text-[11px] font-black uppercase tracking-[0.4px] text-muted min-[360px]:inline">{RANKS.find((x) => x.id === r.rank)?.name}</span>}
              <span className="shrink-0 text-[15px] font-black tabular-nums">{r.points}<span className="ml-0.5 text-[12px] font-bold text-muted">spots</span></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
