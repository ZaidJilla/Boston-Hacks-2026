// "New badge" chips shown after a check-in: each one pops in with its medallion.
import type { CSSProperties } from "react";
import type { CheckinResult } from "@/lib/types";
import BadgeMedallion from "./BadgeMedallion";

export default function NewBadges({
  badges,
  baseDelay = 0,
  tone = "light",
}: {
  badges: NonNullable<CheckinResult["newBadges"]>;
  baseDelay?: number;
  tone?: "light" | "dark";
}) {
  if (!badges.length) return null;
  return (
    <ul aria-label="New badges" className="flex flex-wrap gap-2">
      {badges.map((b, i) => (
        <li
          key={b.id}
          className={`badge-pop flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${tone === "dark" ? "bg-white/15 text-white" : "bg-panel text-ink"}`}
          style={{ ["--d" as string]: `${baseDelay + i * 0.12}s` } as CSSProperties}
        >
          <BadgeMedallion emoji={b.emoji} color={b.color} size={30} />
          <span className="text-[13px] font-extrabold leading-tight">
            <span className="block text-[10px] font-black uppercase tracking-[0.6px] opacity-70">New badge</span>
            {b.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
