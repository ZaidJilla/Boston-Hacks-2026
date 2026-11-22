"use client";
// Client-only pieces of the restaurant header: the Leaflet banner (needs `window`) and the
// neighborhood progress eyebrow (needs the player's unlocks).
import dynamic from "next/dynamic";
import Link from "next/link";
import { restaurantsIn, UNLOCK_THRESHOLD, type Restaurant } from "@/lib/geo";
import type { Station } from "@/lib/types";
import { BackIcon } from "@/components/signage/Icons";
import { useUnlocked } from "@/components/map/useUnlocked";

const MapBanner = dynamic(() => import("./MapBanner"), {
  ssr: false,
  loading: () => <div className="h-[190px] w-full bg-fog" />,
});

export function RestaurantBanner({ r, station }: { r: Restaurant; station: Station | undefined }) {
  return (
    <div className="relative">
      <MapBanner r={r} station={station} />
      <Link
        href="/"
        aria-label="Back to map"
        className="surface-dark absolute left-3 top-[calc(env(safe-area-inset-top)+12px)] z-[600] flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-soft"
      >
        <BackIcon size={24} />
      </Link>
    </div>
  );
}

export function HoodEyebrow({ r }: { r: Restaurant }) {
  const { unlocked, checkins } = useUnlocked();
  const isOpen = unlocked.has(r.neighborhood);
  const eaten = restaurantsIn(r.neighborhood).filter((x) => checkins.has(x.id)).length;
  return (
    <p className="eyebrow text-muted">
      {r.neighborhoodName} ·{" "}
      {isOpen ? "Unlocked" : `${Math.min(eaten, UNLOCK_THRESHOLD)} of ${UNLOCK_THRESHOLD} eaten`}
    </p>
  );
}
