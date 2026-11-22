// One-line trip diagram: hollow start dot, dotted walks, a colored pill per ride, filled end dot.
// Decorative; RouteSteps has the same trip as a readable list.
import type { RouteResult } from "@/lib/types";
import { isWalk, rideStyle } from "./routeStyle";

export default function RouteStrip({ route, compact = false }: { route: RouteResult; compact?: boolean }) {
  const steps = route.steps.filter((s) => s.minutes > 0 || !isWalk(s));
  const first = steps[0];
  const last = steps[steps.length - 1];
  const dot = compact ? "h-3.5 w-3.5 border-[3px]" : "h-[18px] w-[18px] border-[3px]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className={`${dot} shrink-0 rounded-full border-ink bg-white`} />
        {steps.map((s, i) =>
          isWalk(s) ? (
            <span
              key={i}
              className="h-1 min-w-4 border-t-[4px] border-dotted border-dotoff"
              style={{ flexGrow: Math.max(1, s.minutes) }}
            />
          ) : (
            <span
              key={i}
              className={`min-w-0 truncate rounded-full px-3 text-center font-extrabold ${compact ? "h-2 text-[0px]" : "py-1.5 text-[14px]"}`}
              style={{ flexGrow: Math.max(3, s.minutes), background: rideStyle(s).bg, color: rideStyle(s).fg }}
            >
              {compact ? "" : rideStyle(s).text}
            </span>
          ),
        )}
        <span className={`${dot} shrink-0 rounded-full border-ink bg-ink`} />
      </div>
      {!compact && (first && isWalk(first) || last && isWalk(last)) && (
        <div className="flex justify-between text-[14px] text-muted" aria-hidden="true">
          <span>{first && isWalk(first) && steps.length > 1 ? `Walk ${first.minutes} min` : ""}</span>
          <span>{last && isWalk(last) ? `Walk ${last.minutes} min` : ""}</span>
        </div>
      )}
    </div>
  );
}
