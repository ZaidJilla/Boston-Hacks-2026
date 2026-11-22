"use client";
// Podium and ranked rows for the leaderboard. Client side so the signed-in player's row can stand out.
import Link from "next/link";
import { useUser } from "@/lib/auth";
import RankMedallion from "@/components/rank/RankMedallion";
import { RANKS } from "@/lib/scoring";
import type { LeaderboardRow } from "@/lib/types";

const rankName = (id: string) => RANKS.find((r) => r.id === id)?.name ?? "";

const PODIUM = [
  { place: 2, block: "h-[68px] bg-white", glow: "#FFFFFF" },
  { place: 1, block: "h-[96px] bg-signal", glow: "#FFC72C" },
  { place: 3, block: "h-[48px] bg-line-orange", glow: "#ED8B00" },
] as const;

export function Podium({ rows, unit }: { rows: LeaderboardRow[]; unit: string }) {
  const { user } = useUser();
  if (rows.length === 0) return null;
  return (
    <ol className="mt-5 grid grid-cols-3 items-end gap-2" aria-label="Top three">
      {PODIUM.map(({ place, block, glow }) => {
        const r = rows[place - 1];
        if (!r) return <li key={place} aria-hidden="true" />;
        const you = user?.uid === r.id;
        return (
          <li key={place} className="min-w-0 text-center">
            {/* A soft glow behind the name and points so the top three stand out. */}
            <div className="relative px-1 py-1">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 inset-y-0 rounded-full opacity-50 blur-xl"
                style={{ background: glow }}
              />
              {r.rank && (
                <span className="relative mx-auto mb-0.5 block w-fit">
                  <RankMedallion rankId={r.rank} size={34} ribbon={false} />
                </span>
              )}
              <p className={`relative truncate text-[15px] font-extrabold ${you ? "text-signal" : "text-white"}`}>
                {r.name}
                {you && " (you)"}
              </p>
              {r.rank && <p className="relative text-[11px] font-black uppercase tracking-[0.6px] text-white/80">{rankName(r.rank)}</p>}
              <p className="relative text-[13px] tabular-nums text-white/80">
                <b className="text-[17px] font-black text-white">{r.points}</b> {unit}
              </p>
            </div>
            <div
              className={`rise mt-2 flex items-start justify-center rounded-t-[10px] pt-2 text-[26px] font-black leading-none text-ink ${block}`}
              style={{ animationDelay: `${place === 1 ? 0 : place === 2 ? 120 : 220}ms` }}
              aria-hidden="true"
            >
              {place}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const DISC = ["bg-line-red text-white", "bg-line-orange text-ink", "bg-line-green text-white", "bg-line-blue text-white"];
const discFor = (s: string) => DISC[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % DISC.length];

export function Rows({
  rows,
  unit,
  startAt = 1,
  linkToCollege = false,
}: {
  rows: LeaderboardRow[];
  unit: string;
  /** rank number of the first row */
  startAt?: number;
  /** each row opens that college's players (College tab standings). Plain flag: server components can't pass functions. */
  linkToCollege?: boolean;
}) {
  const { user } = useUser();
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => {
        const you = user?.uid === r.id;
        const inner = (
          <>
            <span className="w-7 shrink-0 text-center text-[18px] font-black tabular-nums text-muted">{startAt + i}</span>
            {r.rank ? (
              <RankMedallion rankId={r.rank} size={40} ribbon={false} />
            ) : (
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px] font-black ${discFor(r.name)}`}
                aria-hidden="true"
              >
                {r.name[0]?.toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold leading-tight">
                {r.name}
                {you && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 align-middle text-[11px] font-black text-signal">YOU</span>}
              </span>
              <span className="flex items-center gap-1.5 text-[14px] text-muted">
                {r.rank && <span className="shrink-0 rounded-full bg-panel px-2 py-0 text-[11px] font-black uppercase tracking-[0.4px] text-ink">{rankName(r.rank)}</span>}
                {r.college && <span className="truncate">{r.college}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[20px] font-black leading-none tabular-nums">{r.points}</span>
              <span className="text-[12px] font-bold text-muted">{unit}</span>
            </span>
          </>
        );
        const cls = `flex items-center gap-3 rounded-card border-2 px-3 py-2.5 ${
          you ? "border-ink bg-signal/25" : "border-hairline bg-white"
        }`;
        return (
          <li key={r.id}>
            {linkToCollege ? (
              <Link href={`/leaderboard?tab=college&college=${encodeURIComponent(r.name)}`} className={`${cls} active:bg-panel`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
