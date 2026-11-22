// A section that grows and shrinks smoothly (row height 0fr <-> 1fr, plus a fade) instead of cutting.
// Always rendered; while shut it is hidden from the tab order and screen readers once the fold finishes.
import type { ReactNode } from "react";

export default function Fold({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className="grid transition-[grid-template-rows,opacity,visibility] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, visibility: open ? "visible" : "hidden" }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
