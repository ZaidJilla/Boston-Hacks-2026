"use client";
// Full-screen success state after a check-in that unlocks a neighborhood.
import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const parts = [
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
          className="pointer-events-none absolute left-1/2 top-[150px] -translate-x-1/2 -translate-y-1/2"
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
            className="pointer-events-none absolute rounded-full"
            style={{ left: `${x}%`, top: y, width: s, height: s, background: amber ? "#FFB81C" : "rgba(255,255,255,.85)" }}
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

        <p className="eyebrow relative rounded-full bg-ink px-5 py-2 text-[14px] text-signal">Neighborhood unlocked</p>

        <div className="relative mt-6 flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-full border-8 border-ink bg-white shadow-card">
          <PinCheckIcon size={64} className="text-line-green" strokeWidth={2.4} />
        </div>

        <h2
          id="unlock-h"
          ref={headingRef}
          tabIndex={-1}
          className="relative mt-5 text-center text-[54px] font-black leading-[1] tracking-[-2px]"
        >
          {name}
        </h2>
        <p className="relative mt-2 text-[17px] font-semibold">
          {UNLOCK_THRESHOLD} of {UNLOCK_THRESHOLD} restaurants eaten
        </p>
        <div className="relative mt-4 w-full max-w-[220px]">
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
          {parts.map((p) => (
            <li key={p.label} className="rounded-card bg-panel px-3 py-3">
              <p className="text-[24px] font-black leading-none tracking-[-0.5px]">+{p.value}</p>
              <p className="mt-1 text-[13px] font-bold text-muted">{p.label}</p>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-card bg-ink px-5 py-4 text-white">
          <span className="text-[17px] font-extrabold">Total</span>
          <span className="text-[26px] font-black tracking-[-0.5px] text-signal">+{result.pointsEarned} points</span>
        </div>

        <div className="space-y-2.5 pt-2">
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
