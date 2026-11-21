"use client";

import { useCallback, useMemo, useState } from "react";
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
import { DEMO_MODE, useUser } from "./useUser";

const TOTAL_HOODS = neighborhoods.features.length;

export default function MapScreen() {
  const { user } = useUser();
  const unlocked = useMemo(() => new Set(user?.unlockedNeighborhoods ?? []), [user]);
  const checkins = useMemo(() => new Set(user?.checkins ?? []), [user]);

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
            setLocateError("You're not in Boston — pick a neighborhood instead.");
            return;
          }
          apply(lat, lng);
        },
        (err) => {
          setLocating(false);
          setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Couldn't find you.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    },
    [filters, userPos, changeFilters],
  );

  const hood = hoodInfo ? neighborhoodById.get(hoodInfo) : null;
  const hoodEaten = hood ? restaurantsIn(hood.properties.id).filter((r) => checkins.has(r.id)).length : 0;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-200">
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
        onSelectNeighborhood={(id) => {
          setHoodInfo(id);
          setSelected(null);
        }}
        onMapTap={() => {
          setSelected(null);
          setHoodInfo(null);
        }}
      />

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="pointer-events-auto rounded-2xl bg-white/95 px-3.5 py-2 shadow-md ring-1 ring-slate-200 backdrop-blur">
          <p className="text-sm font-extrabold tracking-tight text-slate-900">🌫️ Boston Fog</p>
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{unlocked.size}</span>/{TOTAL_HOODS} neighborhoods unlocked
          </p>
        </div>
        {DEMO_MODE && (
          <span className="pointer-events-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">
            Demo
          </span>
        )}
      </header>

      {hood && !selected && (
        <div className="fixed inset-x-3 bottom-[104px] z-[1001] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
          <p className="text-xs font-medium text-slate-500">
            {unlocked.has(hood.properties.id) ? "Unlocked ✓" : "Still foggy 🌫️"}
          </p>
          <h2 className="text-lg font-bold text-slate-900">{hood.properties.name}</h2>
          <p className="text-sm text-slate-600">
            {restaurantsIn(hood.properties.id).length} spots
            {!unlocked.has(hood.properties.id) &&
              ` · eat at ${Math.max(0, UNLOCK_THRESHOLD - hoodEaten)} more to unlock`}
          </p>
          <button
            type="button"
            className="mt-3 min-h-[44px] w-full rounded-xl bg-slate-900 text-sm font-semibold text-white"
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
    </main>
  );
}

function distanceFromBoston(lat: number, lng: number) {
  const dLat = (lat - 42.3505) * 111000;
  const dLng = (lng + 71.0759) * 82000;
  return Math.hypot(dLat, dLng);
}
