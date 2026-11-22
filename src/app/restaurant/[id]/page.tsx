import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStation } from "@/lib/data";
import { getRestaurant, lines, LINE_ORDER, restaurantsIn } from "@/lib/geo";
import PointsChip from "@/components/restaurant/PointsChip";
import { POINTS } from "@/lib/scoring";
import CheckinPanel from "@/components/restaurant/CheckinPanel";
import GetThereCard from "@/components/restaurant/GetThereCard";
import { DetailsSkeleton, PhotosSkeleton, RestaurantDetails, RestaurantPhotos } from "@/components/restaurant/PlaceInfo";
import { HoodEyebrow, RestaurantBanner } from "@/components/restaurant/RestaurantHero";
import ArrivalBoard from "@/components/signage/ArrivalBoard";
import LineStripe from "@/components/signage/LineStripe";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const r = getRestaurant(params.id);
  return { title: r ? `${r.name} · ${r.neighborhoodName}` : "Restaurant not found" };
}

const pill = "inline-flex h-9 items-center rounded-full px-4 text-[15px] font-extrabold";

export default function RestaurantPage({ params }: { params: { id: string } }) {
  const r = getRestaurant(params.id);
  if (!r) notFound();
  const station = getStation(r.nearestStopId);
  const line = station ? LINE_ORDER.find((l) => station.lines.includes(l)) : undefined;
  const shapes = station
    ? lines
        .filter((l) => station.lines.includes(l.id))
        .flatMap((l) => l.branches.map((b) => ({ key: `${l.id}-${b.routeId}-${b.terminus}`, color: l.color, points: b.shape })))
    : [];
  const hoodRestaurantIds = restaurantsIn(r.neighborhood).map((x) => x.id);

  return (
    <div className="mx-auto max-w-xl">
      <RestaurantBanner lat={r.lat} lng={r.lng} station={station} line={line} shapes={shapes} />
      <LineStripe />

      <div className="space-y-5 px-4 pt-4">
        <header className="space-y-2.5">
          <HoodEyebrow hoodId={r.neighborhood} hoodName={r.neighborhoodName} hoodRestaurantIds={hoodRestaurantIds} />
          <h1 className="text-[34px] font-black leading-[1.05] tracking-[-1.5px]">{r.name}</h1>
          <ul className="flex flex-wrap gap-2" aria-label="About this spot">
            <li className={`${pill} bg-ink text-white`}>{r.categoryLabel}</li>
            <li className={`${pill} bg-ink text-white`}>
              <span aria-hidden="true">{r.priceLabel}</span>
              <span className="sr-only">
                Price {r.price} of 3{r.priceEstimated ? ", estimated" : ""}
              </span>
            </li>
            {!r.isChain && <li className={`${pill} bg-signal text-ink`}>Independent +{POINTS.independent}</li>}
            <PointsChip neighborhood={r.neighborhood} nearestStopId={r.nearestStopId} isChain={r.isChain} lines={r.nearestStation.lines} />
          </ul>
        </header>

        <Suspense fallback={<PhotosSkeleton />}>
          <RestaurantPhotos r={r} />
        </Suspense>

        {station && <ArrivalBoard stopId={station.id} stationName={station.name} />}

        <GetThereCard restaurantId={r.id} name={r.name} />

        <Suspense fallback={<DetailsSkeleton />}>
          <RestaurantDetails r={r} />
        </Suspense>

        <CheckinPanel restaurantId={r.id} isChain={r.isChain} hoodId={r.neighborhood} hoodName={r.neighborhoodName} />
      </div>
    </div>
  );
}
