"use client";
// Countdown board for a station, like the platform signs. Polls /api/predictions.
import LineBullet from "./LineBullet";
import { useArrivals } from "./useArrivals";

export default function ArrivalBoard({
  stopId,
  stationName,
  limit = 3,
}: {
  stopId: string;
  stationName: string;
  limit?: number;
}) {
  const arrivals = useArrivals(stopId);
  const headingId = `board-${stopId}`;

  return (
    <section className="surface-dark overflow-hidden rounded-card bg-ink text-white" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3 border-b border-boardline px-4 py-3">
        <h2 id={headingId} className="eyebrow min-w-0 truncate text-[13px]">
          {stationName} · Next trains
        </h2>
        <span className="eyebrow flex shrink-0 items-center gap-1.5 text-signal">
          Live
          <span className="h-2 w-2 animate-pulse rounded-full bg-signal motion-reduce:animate-none" aria-hidden="true" />
        </span>
      </div>

      {!arrivals ? (
        <p className="px-4 py-4 text-[15px] text-white/80" aria-busy="true">Loading arrivals…</p>
      ) : !arrivals.length ? (
        <p className="px-4 py-4 text-[15px] text-white/80">No trains soon.</p>
      ) : (
        <ul className="px-4" aria-live="polite">
          {arrivals.slice(0, limit).map((a, i) => (
            <li key={`${a.line}-${a.headsign}-${i}`} className="flex items-center gap-3 border-b border-boardline py-3 last:border-0">
              <LineBullet line={a.line} size={26} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{a.headsign || "Inbound"}</span>
              <span className="shrink-0 text-[21px] font-black tabular-nums tracking-[-0.5px] text-signal">
                {a.minutes <= 0 ? "Now" : `${a.minutes} min`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
