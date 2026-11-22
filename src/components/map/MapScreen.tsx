"use client";

import { useCallback, useMemo, useState } from "react";
import { DEMO_MODE } from "@/lib/config";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterPlaces,
  filterRestaurants,
  MAP_LAYERS,
  mapPlaces,
  neighborhoodAt,
  neighborhoodById,
  neighborhoods,
  placesIn,
  restaurants,
  restaurantsIn,
  UNLOCK_THRESHOLD,
  type MapLayer,
  type MapPlace,
  type Restaurant,
  type RestaurantFilters,
} from "@/lib/geo";
import FogMap, { boundsFor, type FlyTarget } from "./FogMap";
import FilterSheet from "./FilterSheet";
import PlaceCard from "./PlaceCard";
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
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [layers, setLayers] = useState<Set<MapLayer>>(new Set(["food", "landmark", "shopping"]));
  const [hoodInfo, setHoodInfo] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Default view is just the neighborhoods and a few famous landmarks. Every restaurant, shop and
  // smaller landmark appears once the user opens a neighborhood or sets a filter.
  const focused = activeFilterCount(filters) > 0;
  const visible = useMemo(
    () => (focused && layers.has("food") ? filterRestaurants(restaurants, filters) : []),
    [focused, filters, layers],
  );
  // Famous landmarks stay on the map everywhere, even while one neighborhood is open. Seeing them
  // is what pulls people toward somewhere new.
  const visiblePlaces = useMemo(() => {
    const all = mapPlaces.filter((p) => p.type !== "store");
    const famous = all.filter((p) => p.famous);
    if (!focused) return famous;
    const rest = filterPlaces(
      all.filter((p) => !p.famous && layers.has(p.type === "landmark" ? "landmark" : "shopping")),
      filters,
    );
    return [...famous, ...rest];
  }, [focused, filters, layers]);

  const toggleLayer = useCallback((id: MapLayer) => {
    setLayers((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelected(null);
    setSelectedPlace(null);
  }, []);

  const changeFilters = useCallback((f: RestaurantFilters) => {
    setFilters(f);
    setSelected(null);
    setSelectedPlace(null);
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

  // Tapping a neighborhood opens it: fly there and show every spot inside.
  const selectHood = useCallback((id: string) => {
    setHoodInfo(id);
    setSelected(null);
    setSelectedPlace(null);
    setFilters((prev) => ({ ...prev, location: { kind: "neighborhood", id } }));
    const b = boundsFor(id);
    if (b) setFlyTo({ kind: "bounds", bounds: b });
  }, []);
  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelectedPlace(null);
    setHoodInfo(null);
  }, []);

  const hood = hoodInfo ? neighborhoodById.get(hoodInfo) : null;
  const hoodSpots = hood ? restaurantsIn(hood.properties.id) : [];
  const hoodLandmarks = hood ? placesIn(hood.properties.id).filter((p) => p.type === "landmark").length : 0;
  const hoodShopping = hood ? placesIn(hood.properties.id).filter((p) => p.type === "shopping").length : 0;
  const hoodEaten = hoodSpots.filter((r) => checkins.has(r.id)).length;

  return (
    // fills the screen above the app's bottom nav (h-14)
    <div className="fixed inset-x-0 bottom-14 top-0 overflow-hidden bg-fog">
      <FogMap
        restaurants={visible}
        places={visiblePlaces}
        selectedPlaceId={selectedPlace?.id ?? null}
        onSelectPlace={(p) => {
          setSelectedPlace(p);
          setSelected(null);
          setHoodInfo(null);
          setSheetOpen(false);
        }}
        unlocked={unlocked}
        selectedId={selected?.id ?? null}
        userPos={userPos}
        flyTo={flyTo}
        onSelectRestaurant={(r) => {
          setSelected(r);
          setSelectedPlace(null);
          setHoodInfo(null);
          setSheetOpen(false);
        }}
        onSelectNeighborhood={selectHood}
        onMapTap={clearSelection}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex items-start justify-between gap-2">
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
        </div>
        {focused && (
        <div className="pointer-events-auto flex gap-2 overflow-x-auto" role="group" aria-label="Show on map">
          <button
            type="button"
            aria-label="Back to all of Boston"
            title="Back to all of Boston"
            onClick={() => {
              changeFilters(DEFAULT_FILTERS);
              setHoodInfo(null);
              setFlyTo({ kind: "point", lat: 42.3505, lng: -71.0759, zoom: 13 });
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/20 bg-white/95 text-base font-semibold text-ink shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-blue"
          >
            ✕
          </button>
          {MAP_LAYERS.map((l) => {
            const on = layers.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLayer(l.id)}
                className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-line-blue ${
                  on ? "border-ink bg-ink text-white" : "border-black/20 bg-white/95 text-ink"
                }`}
              >
                <span aria-hidden className="inline-block h-2.5 w-2.5 bg-current" style={{ borderRadius: l.id === "food" ? "50%" : l.id === "shopping" ? "2px" : 0, transform: l.id === "landmark" ? "rotate(45deg)" : undefined }} />
                {l.label}
              </button>
            );
          })}
        </div>
        )}
      </header>

      {hood && !selected && (
        <div className="fixed inset-x-3 bottom-[164px] z-[1001] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <p className="text-xs font-medium text-ink/60">{unlocked.has(hood.properties.id) ? "Unlocked" : "Still foggy"}</p>
          <h2 className="text-lg font-bold text-ink">{hood.properties.name}</h2>
          <p className="text-sm text-ink/70">
            {hoodSpots.length} places to eat
            {hoodLandmarks > 0 && ` · ${hoodLandmarks} landmarks`}
            {hoodShopping > 0 && ` · ${hoodShopping} shopping`}
            {!unlocked.has(hood.properties.id) &&
              ` · eat at ${Math.max(0, UNLOCK_THRESHOLD - hoodEaten)} more to unlock`}
          </p>
        </div>
      )}

      {selected && (
        <RestaurantCard r={selected} unlocked={unlocked.has(selected.neighborhood)} onClose={() => setSelected(null)} />
      )}

      {selectedPlace && (
        <PlaceCard p={selectedPlace} unlocked={unlocked.has(selectedPlace.neighborhood)} onClose={() => setSelectedPlace(null)} />
      )}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onChange={changeFilters}
        resultCount={visible.length + visiblePlaces.length}
        unlocked={unlocked}
        onNearMe={nearMe}
        locating={locating}
        locateError={locateError}
      />
    </div>
  );
}
