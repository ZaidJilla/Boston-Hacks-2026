import Link from "next/link";
import { notFound } from "next/navigation";
import { getRestaurant, getStation } from "@/lib/data";
import { distanceMeters } from "@/lib/geo";
import CheckinPanel from "@/components/restaurant/CheckinPanel";
import Arrivals from "@/components/transit/Arrivals";
import LineChip from "@/components/transit/LineChip";
import RoutePanel from "@/components/transit/RoutePanel";

const WALK_M_PER_MIN = 80;
const prettyHood = (id: string) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function RestaurantPage({ params }: { params: { id: string } }) {
  const r = getRestaurant(params.id);
  if (!r) notFound();
  const station = getStation(r.nearestStopId);
  const walkMin = station
    ? Math.max(1, Math.round(distanceMeters(station.lat, station.lng, r.lat, r.lng) / WALK_M_PER_MIN))
    : null;

  return (
    <div className="space-y-4 p-4">
      <Link href="/" className="text-sm text-line-blue underline">← Map</Link>

      <header>
        <h1 className="text-2xl font-bold">{r.name}</h1>
        <p className="mt-1 text-sm text-ink/70">
          <span className="capitalize">{r.craving}</span> · {"$".repeat(r.price)} · {prettyHood(r.neighborhood)} ·{" "}
          {r.isChain ? "Chain" : "Independent (+5 points)"}
        </p>
      </header>

      {station && (
        <section className="space-y-2 rounded-lg bg-white p-3" aria-labelledby="stop-h">
          <h2 id="stop-h" className="font-semibold">{station.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink/70">
            {station.lines.map((l) => <LineChip key={l} line={l} />)}
            <span>{walkMin} min walk</span>
          </div>
          <Arrivals stopId={station.id} />
        </section>
      )}

      <RoutePanel restaurantId={r.id} />
      <CheckinPanel restaurantId={r.id} />
    </div>
  );
}
