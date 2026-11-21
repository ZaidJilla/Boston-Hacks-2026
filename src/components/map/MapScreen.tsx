"use client";

import { useCallback, useMemo, useState } from "react";
import { DEMO_MODE } from "@/lib/config";
import {
  DEFAULT_FILTERS,
  filterRestaurants,
  neighborhoodAt,
  neighborhoodById,
  neighborhoods,
  restaurants,
  restaurantsIn,
  UNLOCK_THRESHOLD,
  type Restaurant,
  type RestaurantFilters,
} from "@/lib/geo";
import FogMap, { boundsFor, type FlyTarget } from "./FogMap";
import FilterSheet from "./FilterSheet";
import RestaurantCard from "./RestaurantCard";
import { useUnlocked } from "./useUnlocked";

const TOTAL_HOODS = neighborhoods.features.length;

/** Straight-line distance from downtown, used to reject "near me" when the user isn't in Boston. */
function distanceFromBoston(lat: number, lng: number) {
  return Math.hypot((lat - 42.3505) * 111000, (lng + 71.0759) * 82000);
}

export default function MapScreen() {
  const { unlocked, checkins } = useUnlocked();

  const [filters, setFilters] = useState<RestaurantFilters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [hoodInfo, setHoodInfo] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const visible = useMemo(() => filterRestaurants(restaurants, filters), [filters]);

  const changeFilters = useCallback((f: RestaurantFilters) => {
    setFilters(f);
    setSelected(null);
    if (f.location.kind === "neighborhood") {
      const b = boundsFor(f.location.id);
      if (b) setFlyTo({ kind: "bounds", bounds: b });
    }
  }, []);

  const nearMe = useCallback(
    (radiusM: number) => {
      const apply = (lat: number, lng: number) => {
        setUserPos({ lat, lng });
        changeFilters({ ...filters, location: { kind: "near", lat, lng, radiusM } });
        setFlyTo({ kind: "point", lat, lng, zoom: radiusM <= 400 ? 16 : radiusM <= 800 ? 15 : 14.5 });
      };
      if (userPos) return apply(userPos.lat, userPos.lng);
      if (!("geolocation" in navigator)) return setLocateError("Location isn't available on this device.");
      setLocating(true);
      setLocateError(null);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLocating(false);
          const { latitude: lat, longitude: lng } = p.coords;
          if (!neighborhoodAt(lat, lng) && distanceFromBoston(lat, lng) > 15000) {
            setLocateError("You're not in Boston. Pick a neighborhood instead.");
            return;
          }
          apply(lat, lng);
        },
        (err) => {
          setLocating(false);
          setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't find you.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    },
    [filters, userPos, changeFilters],
  );

  const selectHood = useCallback((id: string) => {
    setHoodInfo(id);
    setSelected(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelected(null);
    setHoodInfo(null);
  }, []);

  const hood = hoodInfo ? neighborhoodById.get(hoodInfo) : null;
  const hoodSpots = hood ? restaurantsIn(hood.properties.id) : [];
  const hoodEaten = hoodSpots.filter((r) => checkins.has(r.id)).length;

  return (
    // fills the screen above the app's bottom nav (h-14)
    <div className="fixed inset-x-0 bottom-14 top-0 overflow-hidden bg-fog">
      <FogMap
        restaurants={visible}
        unlocked={unlocked}
        selectedId={selected?.id ?? null}
        userPos={userPos}
        flyTo={flyTo}
        onSelectRestaurant={(r) => {
          setSelected(r);
          setHoodInfo(null);
          setSheetOpen(false);
        }}
        onSelectNeighborhood={selectHood}
        onMapTap={clearSelection}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="pointer-events-auto rounded-2xl bg-white/95 px-3.5 py-2 shadow-md ring-1 ring-black/10">
          <p className="text-sm text-ink">
            <span className="font-bold">{unlocked.size}</span> of {TOTAL_HOODS} neighborhoods unlocked
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10" aria-hidden>
            <div className="h-full bg-line-green" style={{ width: `${(unlocked.size / TOTAL_HOODS) * 100}%` }} />
          </div>
        </div>
        {DEMO_MODE && (
          <span className="pointer-events-auto rounded-full bg-line-orange px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            Demo
          </span>
        )}
      </header>

      {hood && !selected && (
        <div className="fixed inset-x-3 bottom-[164px] z-[1001] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <p className="text-xs font-medium text-ink/60">{unlocked.has(hood.properties.id) ? "Unlocked" : "Still foggy"}</p>
          <h2 className="text-lg font-bold text-ink">{hood.properties.name}</h2>
          <p className="text-sm text-ink/70">
            {hoodSpots.length} spots
            {!unlocked.has(hood.properties.id) &&
              ` · eat at ${Math.max(0, UNLOCK_THRESHOLD - hoodEaten)} more to unlock`}
          </p>
          <button
            type="button"
            className="mt-3 min-h-[44px] w-full rounded-xl bg-ink text-sm font-semibold text-white"
            onClick={() => {
              changeFilters({ ...filters, location: { kind: "neighborhood", id: hood.properties.id } });
              setHoodInfo(null);
            }}
          >
            Show spots here
          </button>
        </div>
      )}

      {selected && (
        <RestaurantCard r={selected} unlocked={unlocked.has(selected.neighborhood)} onClose={() => setSelected(null)} />
      )}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onChange={changeFilters}
        resultCount={visible.length}
        unlocked={unlocked}
        onNearMe={nearMe}
        locating={locating}
        locateError={locateError}
      />
    </div>
  );
}
