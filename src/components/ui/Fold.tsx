"use client";
// A section that grows and shrinks smoothly (row height 0fr <-> 1fr, plus a fade) instead of cutting.
// Always rendered; while shut it is hidden from the tab order and screen readers once the fold finishes.
//
// Closing near the bottom of a page would shrink the page under you: the browser clamps the scroll
// position every frame and the toggle button jumps. So while it closes, whatever follows the fold
// (the toggle button) is held still on screen and the fold collapses up toward it.
import { useEffect, useRef, type ReactNode } from "react";

const MS = 380;

export default function Fold({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const anchor = ref.current?.nextElementSibling;
    if (open || !anchor || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const top0 = anchor.getBoundingClientRect().top;
    const end = performance.now() + MS + 60;
    let raf = 0;
    const hold = () => {
      const drift = anchor.getBoundingClientRect().top - top0;
      if (Math.abs(drift) > 0.5) window.scrollBy(0, drift);
      if (performance.now() < end) raf = requestAnimationFrame(hold);
    };
    raf = requestAnimationFrame(hold);
    // If the user scrolls themselves, let go: don't fight their finger.
    const stop = () => cancelAnimationFrame(raf);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      id={id}
      aria-hidden={!open}
      className="grid transition-[grid-template-rows,opacity,visibility] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, visibility: open ? "visible" : "hidden" }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
