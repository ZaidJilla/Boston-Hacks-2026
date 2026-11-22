// The trip as a turn-by-turn list: walk to a stop, board, ride, get off, walk to the place.
import type { RouteResult, RouteStep } from "@/lib/types";
import LineBullet from "./LineBullet";
import { isWalk, rideStyle } from "./routeStyle";

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
export default function RouteSteps({ route, destination }: { route: RouteResult; destination?: string }) {
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
