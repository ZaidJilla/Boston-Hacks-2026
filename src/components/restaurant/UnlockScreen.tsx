"use client";
// Full-screen success state after a check-in that unlocks a neighborhood.
import Link from "next/link";
import NewBadges from "@/components/badges/NewBadges";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buttonClass } from "@/components/ui/Button";
import LineStripe from "@/components/signage/LineStripe";
import StationDots from "@/components/signage/StationDots";
import { BadgeIcon, CloseIcon, PinCheckIcon } from "@/components/signage/Icons";
import { DEMO_MODE } from "@/lib/config";
import { POINTS, UNLOCK_THRESHOLD } from "@/lib/scoring";
import type { CheckinResult } from "@/lib/types";

// Decorative sparkles: [left %, top px, size px, amber?]
const SPARKS: [number, number, number, boolean][] = [
  [27, 62, 9, true], [86, 82, 7, false], [12, 140, 9, false], [73, 168, 8, true], [17, 230, 7, true],
  [90, 268, 10, false], [8, 310, 7, false], [84, 330, 7, true], [22, 378, 7, false], [77, 375, 8, false],
];

/** Delay for a staggered entrance, as a CSS variable the .unlock-* classes read. */
const delay = (s: number) => ({ ["--d" as string]: `${s}s` }) as CSSProperties;

/** Counts up to `to`. Jumps straight to the number if the player prefers reduced motion. */
function CountUp({ to, delayMs = 0, durationMs = 900 }: { to: number; delayMs?: number; durationMs?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setN(Math.round(to * (1 - (1 - t) ** 3))); // ease out
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delayMs, durationMs]);
  return <>{n}</>;
}

export default function UnlockScreen({
  result,
  hoodName,
  isChain,
  onClose,
}: {
  result: CheckinResult;
  /** display name of result.unlockedNeighborhood */
  hoodName: string;
  isChain: boolean;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const name = hoodName;

  useEffect(() => {
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // What this check-in earned, by rule (values from scoring.ts). The total is the server's.
  const b = result.breakdown;
  const parts = b
    ? [
        {
          value: b.distancePoints,
          label: b.multiplier === 1 ? "Check-in" : b.inHomeNeighborhood ? "Check-in, home" : `Check-in ×${b.multiplier}`,
        },
        ...(b.newNeighborhood ? [{ value: b.newNeighborhood, label: "New neighborhood" }] : []),
        ...(b.unlock ? [{ value: b.unlock, label: "Unlock" }] : []),
        ...(b.newLine ? [{ value: b.newLine, label: "New line" }] : []),
        ...(b.independent ? [{ value: b.independent, label: "Independent" }] : []),
        ...(b.lineQuest ? [{ value: b.lineQuest, label: "Line quest" }] : []),
      ]
    : [
        { value: POINTS.checkin, label: "Check-in" },
        { value: POINTS.unlock, label: "Unlock" },
        ...(isChain ? [] : [{ value: POINTS.independent, label: "Independent" }]),
        ...(result.questCompleted ? [{ value: POINTS.lineQuest, label: "Line quest" }] : []),
      ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-h"
      className="fixed inset-x-0 bottom-nav top-0 z-[1003] flex flex-col overflow-y-auto bg-line-green"
    >
      <LineStripe height={8} greenAs="#FFFFFF" />

      <div className="surface-dark relative flex shrink-0 flex-col items-center overflow-hidden px-4 pb-10 pt-6 text-white">
        {/* concentric rings + sparkles */}
        <svg
          className="unlock-rings pointer-events-none absolute left-1/2 top-[150px] -translate-x-1/2 -translate-y-1/2"
          width="760"
          height="760"
          viewBox="0 0 760 760"
          aria-hidden="true"
        >
          {[90, 140, 190, 240, 290, 340].map((r) => (
            <circle key={r} cx="380" cy="380" r={r} fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="2" />
          ))}
        </svg>
        {SPARKS.map(([x, y, s, amber], i) => (
          <span
            key={i}
            aria-hidden="true"
            className="unlock-spark pointer-events-none absolute rounded-full"
            style={{ ...delay(0.7 + i * 0.12), left: `${x}%`, top: y, width: s, height: s, background: amber ? "#FFB81C" : "rgba(255,255,255,.85)" }}
          />
        ))}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink/80 text-white"
        >
          <CloseIcon size={20} />
        </button>

        <p className="unlock-rise eyebrow relative rounded-full bg-ink px-5 py-2 text-[14px] text-signal">Neighborhood unlocked</p>

        {/* The pin drops and lands; rings radiate from where it lands (behind it, not clipped by it). */}
        <div className="relative mt-6 h-[132px] w-[132px] shrink-0">
          {[0.72, 1.62, 2.52].map((d) => (
            <span key={d} aria-hidden="true" className="unlock-ripple absolute inset-0 rounded-full" style={{ animationDelay: `${d}s` }} />
          ))}
          <div className="unlock-drop relative flex h-full w-full items-center justify-center rounded-full border-8 border-ink bg-white shadow-card">
            <span className="unlock-pin flex">
              <PinCheckIcon size={64} className="text-line-green" strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <h2
          id="unlock-h"
          ref={headingRef}
          tabIndex={-1}
          className="unlock-rise relative mt-5 text-center text-[54px] font-black leading-[1] tracking-[-2px]"
          style={delay(0.95)}
        >
          {name}
        </h2>
        <p className="unlock-rise relative mt-2 text-[17px] font-semibold" style={delay(1.05)}>
          {UNLOCK_THRESHOLD} of {UNLOCK_THRESHOLD} restaurants eaten
        </p>
        <div className="unlock-rise relative mt-4 w-full max-w-[220px]" style={delay(1.15)}>
          <StationDots
            total={UNLOCK_THRESHOLD}
            done={UNLOCK_THRESHOLD}
            variant="light"
            label={`${UNLOCK_THRESHOLD} of ${UNLOCK_THRESHOLD} eaten`}
          />
        </div>
      </div>

      <div className="relative -mt-2 flex-1 shrink-0 space-y-4 rounded-t-sheet bg-white px-4 pb-6 pt-5">
        <ul className="grid grid-cols-3 gap-2.5">
          {parts.map((p, i) => (
            <li key={p.label} className="unlock-rise rounded-card bg-panel px-3 py-3" style={delay(1.2 + i * 0.1)}>
              <p className="text-[24px] font-black leading-none tracking-[-0.5px]">+{p.value}</p>
              <p className="mt-1 text-[13px] font-bold text-muted">{p.label}</p>
            </li>
          ))}
        </ul>

        <div className="unlock-rise flex items-center justify-between rounded-card bg-ink px-5 py-4 text-white" style={delay(1.5)}>
          <span className="text-[17px] font-extrabold">Total</span>
          <span className="text-[26px] font-black tracking-[-0.5px] text-signal">
            <span aria-hidden="true">
              +<CountUp to={result.pointsEarned} delayMs={1600} /> points
            </span>
            <span className="sr-only">+{result.pointsEarned} points</span>
          </span>
        </div>

        {!!result.newBadges?.length && (
          <div className="unlock-rise" style={delay(1.65)}>
            <NewBadges badges={result.newBadges} baseDelay={1.8} />
          </div>
        )}

        <div className="unlock-rise space-y-2.5 pt-2" style={delay(1.7)}>
          <Link href="/" className={`${buttonClass("dark")} w-full`}>
            See the map
          </Link>
          <Link href="/leaderboard" className={`${buttonClass("outline")} w-full`}>
            See the leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}
