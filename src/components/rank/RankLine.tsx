"use client";
// Your rank as a T line: four stations (Visitor, Regular, Local, Legend), the track filling in the color
// of each rank as you pass it, and a "YOU" marker riding between stations toward the next one.
import { useEffect, useState } from "react";
import { RANKS, rankProgress } from "@/lib/scoring";
import { RANK_COLORS } from "./RankBadge";

const STATION = 22; // px, station dot

export default function RankLine({ unlocked, tone = "light" }: { unlocked: number; tone?: "light" | "dark" }) {
  const { rank, next, unlocksToNext } = rankProgress(unlocked);
  const idx = RANKS.findIndex((r) => r.id === rank.id);
  // How far you are from this station to the next one, 0 to 1.
  const frac = next ? Math.min(1, Math.max(0, (unlocked - rank.minUnlocks) / (next.minUnlocks - rank.minUnlocks))) : 0;
  const target = (idx + frac) / (RANKS.length - 1); // 0 to 1 along the whole line

  // The marker rolls out from the first station when the line appears.
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPos(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const at = (p: number) => `calc(${STATION / 2}px + (100% - ${STATION}px) * ${p})`;
  const dark = tone === "dark";

  return (
    <div role="group" aria-label={`Rank: ${rank.name}. ${next ? `${unlocksToNext} more ${unlocksToNext === 1 ? "unlock" : "unlocks"} to ${next.name}.` : "Top rank."}`}>
      <div className="relative h-[70px]">
        {/* the track: grey underneath, colored up to the marker */}
        <div className="absolute top-[34px] h-[6px] rounded-full" style={{ left: STATION / 2, right: STATION / 2, background: dark ? "#2B3136" : "#B9BEC3" }} />
        {RANKS.slice(0, -1).map((r, i) => {
          const segStart = i / (RANKS.length - 1);
          const segEnd = (i + 1) / (RANKS.length - 1);
          const fill = Math.min(1, Math.max(0, (pos - segStart) / (segEnd - segStart)));
          return (
            <div
              key={r.id}
              className="absolute top-[34px] h-[6px] rounded-full transition-[width] duration-[1100ms] ease-out motion-reduce:transition-none"
              style={{
                left: at(segStart),
                width: `calc((100% - ${STATION}px) * ${(segEnd - segStart) * fill})`,
                background: RANK_COLORS[r.id],
              }}
            />
          );
        })}

        {/* YOU marker */}
        <div
          className="absolute top-0 -translate-x-1/2 transition-[left] duration-[1100ms] ease-out motion-reduce:transition-none"
          style={{ left: at(pos) }}
          aria-hidden="true"
        >
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-signal px-2.5 py-0.5 text-[11px] font-black tracking-wide text-ink">YOU</span>
            <span className="h-2 w-0.5 bg-signal" />
          </div>
        </div>

        {/* stations */}
        <div className="absolute inset-x-0 top-[26px] flex justify-between">
          {RANKS.map((r, i) => {
            const reached = i <= idx;
            return (
              <span
                key={r.id}
                className="box-border block rounded-full border-[4px]"
                style={{
                  width: STATION,
                  height: STATION,
                  borderColor: dark ? "#FFFFFF" : "#000000",
                  background: reached ? RANK_COLORS[r.id] : dark ? "#000000" : "#FFFFFF",
                }}
                aria-hidden="true"
              />
            );
          })}
        </div>
      </div>

      <ol className="flex justify-between" aria-hidden="true">
        {RANKS.map((r, i) => (
          <li key={r.id} className="w-1/4 first:text-left last:text-right [&:not(:first-child):not(:last-child)]:text-center">
            <p className={`text-[13px] font-extrabold leading-tight ${i === idx ? "" : dark ? "text-white/70" : "text-muted"}`}>{r.name}</p>
            <p className={`text-[12px] ${dark ? "text-white/60" : "text-muted"}`}>{r.minUnlocks === 0 ? "start" : `${r.minUnlocks} ${r.minUnlocks === 1 ? "unlock" : "unlocks"}`}</p>
          </li>
        ))}
      </ol>

      <p className={`mt-3 text-[15px] font-bold ${dark ? "text-white" : ""}`}>
        {next ? (
          <>
            {unlocksToNext} more {unlocksToNext === 1 ? "unlock" : "unlocks"} to <span style={{ color: dark ? "#FFB81C" : RANK_COLORS[next.id] }}>{next.name}</span>
          </>
        ) : (
          "Top of the line. Most of Boston is yours."
        )}
      </p>
    </div>
  );
}
