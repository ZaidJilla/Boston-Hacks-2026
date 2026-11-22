"use client";
// Between screens: four bands in the T line colors sweep off to the right like a train pulling out,
// revealing the new page. Plays on every navigation after the first load; skipped for reduced motion
// (the CSS hides it).
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LINE_COLORS } from "@/lib/config";

const BANDS = [LINE_COLORS.red, LINE_COLORS.orange, LINE_COLORS.green, LINE_COLORS.blue];
const TOTAL_MS = 900; // longest band: 0.5 s sweep + the last stagger, with room to spare

// Layout effects run before the browser paints, so the bands cover the new page from its first frame.
const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function RouteTransition() {
  const path = usePathname();
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [run, setRun] = useState(0);
  const [show, setShow] = useState(false);

  useBeforePaint(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setRun((n) => n + 1);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), TOTAL_MS);
  }, [path]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!show) return null;
  return (
    // Sits above the page but not the tab bar, so navigation stays anchored.
    <div key={run} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 bottom-nav z-[1100] overflow-hidden">
      {BANDS.map((color, i) => (
        <span
          key={color}
          className="route-band"
          style={{ background: color, top: `${i * 25}%`, height: "25.2%", animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
