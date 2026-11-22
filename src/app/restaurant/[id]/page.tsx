import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStation } from "@/lib/data";
import { getRestaurant } from "@/lib/geo";
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

  return (
    <div className="mx-auto max-w-xl">
      <RestaurantBanner r={r} station={station} />
      <LineStripe />

      <div className="space-y-5 px-4 pt-4">
        <header className="space-y-2.5">
          <HoodEyebrow r={r} />
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
          </ul>
        </header>

        <Suspense fallback={<PhotosSkeleton />}>
          <RestaurantPhotos r={r} />
        </Suspense>

        {station && <ArrivalBoard stopId={station.id} stationName={station.name} />}

        <GetThereCard restaurantId={r.id} />

        <Suspense fallback={<DetailsSkeleton />}>
          <RestaurantDetails r={r} />
        </Suspense>

        <CheckinPanel restaurantId={r.id} isChain={r.isChain} />
      </div>
    </div>
  );
}
