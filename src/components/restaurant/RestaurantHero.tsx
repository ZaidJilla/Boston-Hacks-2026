"use client";
// Client-only pieces of the restaurant header: the Leaflet banner (needs `window`) and the
// neighborhood progress eyebrow (needs the player's unlocks).
import dynamic from "next/dynamic";
import Link from "next/link";
// No runtime import of @/lib/geo here: the server page passes what these need, so the
// restaurant and line data stay out of the browser bundle.
import { UNLOCK_THRESHOLD } from "@/lib/scoring";
import type { BannerProps } from "./MapBanner";
import { BackIcon } from "@/components/signage/Icons";
import { useUnlocked } from "@/components/map/useUnlocked";

const MapBanner = dynamic(() => import("./MapBanner"), {
  ssr: false,
  loading: () => <div className="h-[190px] w-full bg-fog" />,
});

export function RestaurantBanner(props: BannerProps) {
  return (
    <div className="relative">
      <MapBanner {...props} />
      <Link
        href="/"
        aria-label="Back to map"
        className="absolute left-3 top-[calc(env(safe-area-inset-top)+12px)] z-[600] flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-soft"
      >
        <BackIcon size={24} />
      </Link>
    </div>
  );
}

export function HoodEyebrow({
  hoodId,
  hoodName,
  hoodRestaurantIds,
}: {
  hoodId: string;
  hoodName: string;
  hoodRestaurantIds: string[];
}) {
  const { unlocked, checkins } = useUnlocked();
  const isOpen = unlocked.has(hoodId);
  const eaten = hoodRestaurantIds.filter((id) => checkins.has(id)).length;
  return (
    <p className="eyebrow text-muted">
      {hoodName} ·{" "}
      {isOpen ? "Unlocked" : `${Math.min(eaten, UNLOCK_THRESHOLD)} of ${UNLOCK_THRESHOLD} eaten`}
    </p>
  );
}
