"use client";
// The badge shelf on the profile: your three best badges up front, everything else behind "Show all".
// Every badge is tappable and opens a short card with what it is and how to get it.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BADGES, RARITY_LABEL, earnedIds, shelfOrder, type Badge, type Facts } from "@/lib/badges";
import BadgeMedallion from "./BadgeMedallion";

const RARITY_TONE = { common: "bg-panel text-ink", rare: "bg-line-blue text-white", epic: "bg-line-orange text-ink", legendary: "bg-line-red text-white" } as const;

function Tile({ badge, earned, onOpen, delay, plain }: { badge: Badge; earned: boolean; onOpen: () => void; delay: number; plain?: boolean }) {
  return (
    <li className={plain ? undefined : "unlock-rise"} style={{ ["--d" as string]: `${delay}s` }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${badge.name}, ${earned ? "earned" : "locked"}. Show details`}
        className="flex h-full w-full flex-col items-center rounded-card border-2 border-hairline bg-white px-1.5 py-3 text-center active:scale-[0.97] motion-reduce:transition-none"
      >
        <BadgeMedallion emoji={badge.emoji} color={badge.color} earned={earned} />
        <span className={`mt-2 text-[13px] font-extrabold leading-tight ${earned ? "" : "text-muted"}`}>{badge.name}</span>
        <span className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.5px] text-muted">{earned ? RARITY_LABEL[badge.rarity] : "Locked"}</span>
      </button>
    </li>
  );
}

const EXIT_MS = 220;

function BadgeSheet({ badge, earned, onClose }: { badge: Badge; earned: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  // Closing plays the exit animation first, then tells the parent to unmount.
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(onClose, EXIT_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-labelledby="badge-title">
      <button type="button" aria-label="Close" onClick={dismiss} className={`absolute inset-0 cursor-default bg-black/60 ${leaving ? "fade-out" : "fade-in"}`} tabIndex={-1} />
      <div className={`relative w-full max-w-sm rounded-sheet bg-white px-6 pb-6 pt-7 text-center shadow-card ${leaving ? "badge-out" : "badge-pop"}`}>
        <div className="mx-auto flex w-fit justify-center">
          <BadgeMedallion emoji={badge.emoji} color={badge.color} earned={earned} size={96} />
        </div>
        <span className={`eyebrow mt-4 inline-block rounded-full px-3 py-1 ${RARITY_TONE[badge.rarity]}`}>{RARITY_LABEL[badge.rarity]}</span>
        <h3 id="badge-title" className="mt-2 text-[24px] font-black tracking-[-0.5px]">{badge.name}</h3>
        <p className="mt-1 text-[16px] text-ink/85">{badge.desc}</p>
        <p className="mt-3 rounded-card bg-panel px-3 py-2.5 text-[14px] font-bold">
          {earned ? "You've earned this one." : `How to get it: ${badge.how}`}
        </p>
        <button ref={close} type="button" onClick={dismiss} className="mt-5 min-h-[48px] w-full rounded-full bg-ink text-[16px] font-extrabold text-white">
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function BadgeShelf({ facts }: { facts: Facts }) {
  const have = earnedIds(facts);
  const { featured, rest } = shelfOrder(facts);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Badge | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section aria-labelledby="badges-h" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="badges-h" className="text-[20px] font-black leading-tight tracking-[-0.5px]">Badges</h2>
        <span className="text-[16px] font-black tabular-nums">{have.size} of {BADGES.length}</span>
      </div>
      <p className="-mt-1.5 text-[14px] text-muted">Your best three. Tap any badge to see what it is.</p>
      <ul className="grid grid-cols-3 gap-2.5">
        {featured.map((b, i) => <Tile key={b.id} badge={b} earned={have.has(b.id)} onOpen={() => setOpen(b)} delay={i * 0.05} />)}
      </ul>
      {/* Always rendered so it can grow and shrink smoothly: the row height animates between 0fr and 1fr. */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
        style={{
          gridTemplateRows: all ? "1fr" : "0fr",
          opacity: all ? 1 : 0,
          visibility: all ? "visible" : "hidden",
          // visibility stays "visible" for the whole transition, then flips, so it leaves the tab order once shut
          transitionProperty: "grid-template-rows, opacity, visibility",
        }}
        aria-hidden={!all}
      >
        <div className="overflow-hidden">
          <ul id="badges-rest" className="grid grid-cols-3 gap-2.5 pb-0.5">
            {rest.map((b) => <Tile key={b.id} badge={b} earned={have.has(b.id)} onOpen={() => setOpen(b)} delay={0} plain />)}
          </ul>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setAll((v) => !v)}
        aria-expanded={all}
        aria-controls="badges-rest"
        className="min-h-[48px] w-full rounded-full border-2 border-ink bg-white text-[16px] font-extrabold"
      >
        {all ? "Show fewer" : `Show all ${BADGES.length} badges`}
      </button>
      {mounted && open && <BadgeSheet badge={open} earned={have.has(open.id)} onClose={() => setOpen(null)} />}
    </section>
  );
}
