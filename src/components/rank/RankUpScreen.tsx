"use client";
// PLACEHOLDER rank-up screen. Layout, copy and the art slot are final-ish; the art and any
// animation are TODO. Shown by the map when the player's rank goes up, and at /rank-up for preview.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RANKS, type Rank } from "@/lib/scoring";
import RankBadge, { RANK_COLORS } from "./RankBadge";

export default function RankUpScreen({
  rank,
  unlocked,
  onClose,
}: {
  rank: Rank;
  /** Neighborhoods unlocked so far, for the subtitle. */
  unlocked: number;
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
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-ink/90 px-6 text-center text-white"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-white/60">Rank up</p>

      {/* TODO(art): rank illustration / animation. Keep the slot ~160px square. */}
      <div
        aria-hidden
        className="my-6 flex h-40 w-40 items-center justify-center rounded-3xl border-2 border-dashed text-xs text-white/50"
        style={{ borderColor: RANK_COLORS[rank.id] }}
      >
        Rank art
      </div>

      <h2 id="rankup-title" className="text-xl font-bold">
        You&apos;re now a
      </h2>
      <div className="mt-2">
        <RankBadge rank={rank} size="lg" />
      </div>
      <p className="mt-4 max-w-xs text-sm text-white/80">{rank.blurb}</p>
      <p className="mt-1 text-sm text-white/60">
        {unlocked} {unlocked === 1 ? "neighborhood" : "neighborhoods"} unlocked
        {next ? ` · ${next.minUnlocks - unlocked} more to ${next.name}` : ""}
      </p>

      <button
        ref={button}
        type="button"
        onClick={onClose}
        className="mt-8 min-h-[48px] w-full max-w-xs rounded-2xl bg-white text-sm font-semibold text-ink"
      >
        Keep exploring
      </button>
    </div>,
    document.body,
  );
}
