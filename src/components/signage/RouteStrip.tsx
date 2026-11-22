// One-line trip diagram: hollow start dot, dotted walks, a colored pill per ride, filled end dot.
import { LINE_COLORS } from "@/lib/config";
import type { RouteResult, RouteStep } from "@/lib/types";
import { LINE_NAME, lineTextColor } from "./LineBullet";

/** Black or white text, whichever reads on this background. */
function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // pick the one with the higher contrast ratio
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? "#000000" : "#FFFFFF";
}

const isWalk = (s: RouteStep) => s.mode === "walk" || (!s.line && !s.color);

function rideStyle(s: RouteStep): { bg: string; fg: string; text: string } {
  if (s.line) return { bg: LINE_COLORS[s.line], fg: lineTextColor(s.line), text: `${LINE_NAME[s.line]} · ${s.minutes} min` };
  const bg = s.color ? (s.color.startsWith("#") ? s.color : `#${s.color}`) : "#000000";
  const name = s.mode === "bus" ? `Bus ${s.routeShort ?? ""}`.trim() : s.routeShort ?? "Transit";
  return { bg, fg: textOn(bg), text: `${name} · ${s.minutes} min` };
}

export default function RouteStrip({ route, compact = false }: { route: RouteResult; compact?: boolean }) {
  const steps = route.steps.filter((s) => s.minutes > 0 || !isWalk(s));
  const first = steps[0];
  const last = steps[steps.length - 1];
  const dot = compact ? "h-3.5 w-3.5 border-[3px]" : "h-[18px] w-[18px] border-[3px]";

  return (
    <div className="space-y-1.5">
      {!compact && (
        <ol className="sr-only">
          {route.steps.map((s, i) => (
            <li key={i}>
              {s.label}, {s.minutes} min
            </li>
          ))}
        </ol>
      )}
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
