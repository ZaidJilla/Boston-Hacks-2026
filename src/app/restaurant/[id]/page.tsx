import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStation } from "@/lib/data";
import { cravingById, getRestaurant } from "@/lib/geo";
import CheckinPanel from "@/components/restaurant/CheckinPanel";
import { DetailsSkeleton, PhotosSkeleton, RestaurantDetails, RestaurantPhotos } from "@/components/restaurant/PlaceInfo";
import Arrivals from "@/components/transit/Arrivals";
import LineChip from "@/components/transit/LineChip";
import RoutePanel from "@/components/transit/RoutePanel";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const r = getRestaurant(params.id);
  return { title: r ? `${r.name} · ${r.neighborhoodName}` : "Restaurant not found" };
}

export default function RestaurantPage({ params }: { params: { id: string } }) {
  const r = getRestaurant(params.id);
  if (!r) notFound();
  const station = getStation(r.nearestStopId);
  const emoji = cravingById.get(r.craving)?.emoji;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Link href="/" className="text-sm text-line-blue underline">← Map</Link>

      <Suspense fallback={<PhotosSkeleton />}>
        <RestaurantPhotos r={r} />
      </Suspense>

      <header>
        <h1 className="text-2xl font-bold leading-tight">{r.name}</h1>
        <p className="mt-1 text-sm text-ink/70">
          {emoji && <span aria-hidden="true">{emoji} </span>}
          {r.categoryLabel} · <span className="font-semibold text-ink">{r.priceLabel}</span>
          {r.priceEstimated && <span className="text-ink/50"> est.</span>} · {r.neighborhoodName} ·{" "}
          {r.isChain ? "Chain" : "Independent (+5 points)"}
        </p>
      </header>

      <Suspense fallback={<DetailsSkeleton />}>
        <RestaurantDetails r={r} />
      </Suspense>

      {station && (
        <section className="space-y-2 rounded-lg bg-white p-3" aria-labelledby="stop-h">
          <h2 id="stop-h" className="font-semibold">{station.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink/70">
            {station.lines.map((l) => <LineChip key={l} line={l} />)}
            <span>{r.nearestStation.walkMin} min walk</span>
          </div>
          <Arrivals stopId={station.id} />
        </section>
      )}

      <RoutePanel restaurantId={r.id} />
      <CheckinPanel restaurantId={r.id} />
    </div>
  );
}
