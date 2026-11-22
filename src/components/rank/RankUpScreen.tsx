"use client";
// Rank up: the medallion drops in and lands, rings radiate from it, and your new rank rises in over a
// T line showing how far along you are. Shown by the map when your rank goes up, and at /rank-up for preview.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RANKS, type Rank } from "@/lib/scoring";
import RankBadge, { RANK_COLORS } from "./RankBadge";
import RankLine from "./RankLine";
import RankMedallion from "./RankMedallion";

const delay = (s: number) => ({ ["--d" as string]: `${s}s` }) as CSSProperties;

export default function RankUpScreen({
  rank,
  points,
  onClose,
}: {
  rank: Rank;
  /** Total points, for the subtitle and the line. */
  points: number;
  onClose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const next = RANKS[RANKS.findIndex((r) => r.id === rank.id) + 1];
  // Rendered into <body> so it covers the bottom nav too (the map sits in its own stacking layer).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankup-title"
      className="surface-dark fixed inset-0 z-[2000] flex flex-col items-center overflow-y-auto overflow-x-hidden bg-ink px-6 pb-8 pt-16 text-center text-white"
    >
      <p className="eyebrow unlock-rise rounded-full px-4 py-1.5 text-[14px]" style={{ background: RANK_COLORS[rank.id], color: "#fff" }}>
        Rank up
      </p>

      {/* The medallion drops and lands; rings radiate from where it lands. */}
      <div className="relative mt-8 h-[132px] w-[132px] shrink-0">
        {[0.72, 1.62, 2.52].map((d) => (
          <span
            key={d}
            aria-hidden="true"
            className="unlock-ripple absolute inset-0 rounded-full"
            style={{ animationDelay: `${d}s`, borderColor: RANK_COLORS[rank.id] }}
          />
        ))}
        <div className="unlock-drop relative">
          <RankMedallion rankId={rank.id} />
        </div>
      </div>

      <h2 id="rankup-title" className="unlock-rise mt-7 text-[22px] font-extrabold" style={delay(0.95)}>
        You&rsquo;re now a
      </h2>
      <div className="unlock-rise mt-2" style={delay(1.05)}>
        <RankBadge rank={rank} size="lg" />
      </div>
      <p className="unlock-rise mt-4 max-w-xs text-[16px] text-white/85" style={delay(1.15)}>
        {rank.blurb}
      </p>
      <p className="unlock-rise mt-1 text-[14px] text-white/65" style={delay(1.2)}>
        {points} points
        {next ? ` · ${next.minPoints - points} more to ${next.name}` : ""}
      </p>

      <div className="unlock-rise mt-7 w-full max-w-xs" style={delay(1.35)}>
        <RankLine points={points} tone="dark" />
      </div>

      <button
        ref={button}
        type="button"
        onClick={onClose}
        className="unlock-rise mt-8 min-h-[52px] w-full max-w-xs rounded-full bg-white text-[17px] font-extrabold text-ink"
        style={delay(1.55)}
      >
        Keep exploring
      </button>
    </div>,
    document.body,
  );
}
