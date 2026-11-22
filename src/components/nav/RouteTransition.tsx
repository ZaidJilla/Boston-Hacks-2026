"use client";
// Between screens, four bands in the T line colors roll across like a train: they cover the screen
// from the left, the new page loads underneath, then they roll off to the right. Each band carries a
// white line bullet at the front. Tapping a link to another page starts it; if the page changes any
// other way (back button, code), the bands just roll off to reveal it. Reduced motion skips it all.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LINE_COLORS } from "@/lib/config";

const BANDS = [
  { color: LINE_COLORS.red, letter: "R" },
  { color: LINE_COLORS.orange, letter: "O" },
  { color: LINE_COLORS.green, letter: "G" },
  { color: LINE_COLORS.blue, letter: "B" },
];
const STAGGER_MS = 45;
const IN_MS = 280 + STAGGER_MS * 3 + 20; // until every band has covered the screen
const OUT_MS = 340 + STAGGER_MS * 3 + 60; // until every band has left
const ROUTE_TIMEOUT_MS = 2000; // never leave the screen covered if the next page is slow

// Layout effects run before the browser paints, so the bands are already there on the new page's first frame.
const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** The bands, in one direction. Painted first, and set moving two frames later so the new page's own startup has had its turn. */
function Bands({ phase }: { phase: "in" | "out" }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setGo(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <>
      {BANDS.map(({ color, letter }, i) => (
        <span
          key={color}
          data-phase={phase}
          className="route-band"
          style={{
            background: color,
            top: `${i * 25}%`,
            height: "25.2%",
            animationDelay: `${i * STAGGER_MS}ms`,
            animationPlayState: go ? "running" : "paused",
            ["--c" as string]: color,
          }}
        >
          <span className="route-bullet" aria-hidden="true">
            {letter}
          </span>
        </span>
      ))}
    </>
  );
}

export default function RouteTransition() {
  const router = useRouter();
  const path = usePathname();
  const first = useRef(true);
  const busy = useRef(false); // a tap-started transition is running
  const arrived = useRef<(() => void) | null>(null); // called when the new page has rendered
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const [run, setRun] = useState(0);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const roll = (next: "in" | "out") => {
    setRun((n) => n + 1);
    setPhase(next);
  };

  // The page changed. Either we started it (carry on to the exit) or something else did (just reveal it).
  useBeforePaint(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (arrived.current) {
      arrived.current();
      arrived.current = null;
      return;
    }
    if (busy.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    roll("out");
    later(() => setPhase("idle"), OUT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Tapping a link to another page: bands in, then navigate, then bands out.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onClick = (e: MouseEvent) => {
      if (busy.current || reduced.matches) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || !a.href) return;
      const url = new URL(a.href, location.href);
      // Only real page changes. Same-page links (tabs that change the query, #anchors) behave as before.
      if (url.origin !== location.origin || url.pathname === location.pathname) return;

      e.preventDefault();
      e.stopPropagation();
      busy.current = true;
      roll("in");
      later(() => {
        new Promise<void>((resolve) => {
          arrived.current = resolve;
          later(resolve, ROUTE_TIMEOUT_MS);
          router.push(url.pathname + url.search + url.hash);
        }).then(() => {
          arrived.current = null;
          roll("out");
          later(() => {
            setPhase("idle");
            busy.current = false;
          }, OUT_MS);
        });
      }, IN_MS);
    };
    document.addEventListener("click", onClick, true); // capture: runs before Next's own Link handler
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (phase === "idle") return null;
  return (
    // Sits above the page but not the tab bar, so navigation stays anchored.
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 bottom-nav z-[1100] overflow-hidden">
      <Bands key={`${phase}-${run}`} phase={phase} />
    </div>
  );
}
