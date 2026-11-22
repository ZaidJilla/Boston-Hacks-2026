// Trip diagrams. RouteStrip: one line with a hollow start dot, dotted walks, a colored pill per
// ride and a filled end dot (decorative). RouteSteps: the same trip as a step list that says where
// to board and where to get off.
import { LINE_COLORS } from "@/lib/config";
import type { RouteResult, RouteStep } from "@/lib/types";
import LineBullet, { LINE_NAME, lineTextColor } from "./LineBullet";

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

// ---- Step list ----

/** "Walk 6 min to Ruggles" -> "Ruggles". Null for other wording (e.g. Google's instructions). */
function walkPlace(label: string): string | null {
  return label.match(/^Walk \d+ min to (.+)$/)?.[1] ?? null;
}

/** "Orange Line to Chinatown · next in 2 min" -> { name, stop, note }. */
function parseRide(label: string): { name: string; stop: string | null; note: string | null } {
  const m = label.match(/^(.*?) to (.+?)(?: · (.+))?$/);
  return m ? { name: m[1], stop: m[2], note: m[3] ?? null } : { name: label, stop: null, note: null };
}

function RideIcon({ step }: { step: RouteStep }) {
  if (step.line) return <LineBullet line={step.line} size={28} label={false} />;
  const { bg, fg } = rideStyle(step);
  return (
    <span
      aria-hidden="true"
      className="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-black leading-none"
      style={{ background: bg, color: fg }}
    >
      {step.routeShort ?? "T"}
    </span>
  );
}

/**
 * Turn-by-turn version of the trip: walk to a stop, board, ride, get off, walk.
 * `destination` replaces the planner's "your destination" with the place's name.
 */
export function RouteSteps({ route, destination }: { route: RouteResult; destination?: string }) {
  const steps = route.steps.filter((s) => s.minutes > 0 || !isWalk(s));
  return (
    <ol className="space-y-0" aria-label="Directions">
      {steps.map((s, i) => {
        const lastRow = i === steps.length - 1;
        if (isWalk(s)) {
          const place = walkPlace(s.label);
          const toDest = place === "your destination";
          const text = place ? `Walk to ${toDest ? destination ?? "the restaurant" : place}` : s.label;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex w-7 shrink-0 flex-col items-center" aria-hidden="true">
                <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-[3px] border-ink ${lastRow ? "bg-ink" : "bg-white"}`} />
                {!lastRow && <span className="my-1 w-0 flex-1 border-l-[4px] border-dotted border-dotoff" />}
              </div>
              <div className={`flex min-w-0 flex-1 items-start justify-between gap-3 ${lastRow ? "" : "pb-4"}`}>
                <p className="text-[15px] font-bold leading-snug">{text}</p>
                <span className="shrink-0 text-[14px] font-semibold text-muted">{s.minutes} min</span>
              </div>
            </li>
          );
        }

        const ride = parseRide(s.label);
        // Where to board: the place the walk before this ended, or where the last ride let you off.
        const prev = steps[i - 1];
        const boardAt = prev ? (isWalk(prev) ? walkPlace(prev.label) : parseRide(prev.label).stop) : null;
        const color = rideStyle(s).bg;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex w-7 shrink-0 flex-col items-center">
              <RideIcon step={s} />
              {!lastRow && <span className="my-1 w-[5px] flex-1 rounded-full" style={{ background: color }} aria-hidden="true" />}
            </div>
            <div className={`min-w-0 flex-1 ${lastRow ? "" : "pb-4"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-extrabold leading-snug">{ride.name}</p>
                <span className="shrink-0 text-[14px] font-semibold text-muted">{s.minutes} min</span>
              </div>
              {boardAt && boardAt !== "your destination" && (
                <p className="text-[14px] leading-snug">
                  Board at <b>{boardAt}</b>
                </p>
              )}
              {ride.stop && (
                <p className="text-[14px] leading-snug">
                  Get off at <b>{ride.stop}</b>
                </p>
              )}
              {ride.note && <p className="text-[14px] font-semibold leading-snug text-muted">{ride.note[0].toUpperCase() + ride.note.slice(1)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
