"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Chip } from "@/components/ui/Button";
import { APP_NAME, BOSTON_CENTER } from "@/lib/config";
import {
  activeFilterCount,
  cravingById,
  DEFAULT_FILTERS,
  distanceM,
  filterPlaces,
  filterRestaurants,
  mapPlaces,
  LINE_ORDER,
  lineColor,
  neighborhoodAt,
  neighborhoodById,
  neighborhoods,
  restaurants,
  restaurantsIn,
  type MapLayer,
  type MapPlace,
  type Restaurant,
  type RestaurantFilters,
} from "@/lib/geo";
import LineStripe from "@/components/signage/LineStripe";
import { ChevronDownIcon, LocateIcon } from "@/components/signage/Icons";
import FogMap, { boundsFor, type FlyTarget } from "./FogMap";
import FilterSheet, { type FilterSection } from "./FilterSheet";
import PeekCard from "./PeekCard";
import PlaceCard from "./PlaceCard";
import { useUnlocked } from "./useUnlocked";
import { useRankUp } from "./useRankUp";
import RankBadge from "@/components/rank/RankBadge";
import RankUpScreen from "@/components/rank/RankUpScreen";
import { rankProgress } from "@/lib/scoring";

const TOTAL_HOODS = neighborhoods.features.length;

/** Straight-line distance from downtown, used to reject locations outside Boston. */
function distanceFromBoston(lat: number, lng: number) {
  return Math.hypot((lat - 42.3505) * 111000, (lng + 71.0759) * 82000);
}

function locate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Location isn't available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        if (!neighborhoodAt(lat, lng) && distanceFromBoston(lat, lng) > 15000) {
          reject(new Error("You're not in Boston. Pick a neighborhood instead."));
        } else resolve({ lat, lng });
      },
      (err) =>
        reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't find you.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

const ALL_LAYERS: MapLayer[] = ["food", "landmark", "shopping"];
const LAYER_NAME: Record<MapLayer, string> = { food: "Food", landmark: "Landmarks", shopping: "Shopping" };

/** Left pill: what is on the map. Short, so all three pills fit at 375 px. */
function layerSummary(layers: Set<MapLayer>): string {
  if (layers.size === ALL_LAYERS.length) return "Places";
  if (!layers.size) return "Nothing";
  if (layers.size === 1) return LAYER_NAME[ALL_LAYERS.find((l) => layers.has(l))!];
  return `${layers.size} types`;
}

/** "$ to $$", "$$", "$, $$$" */
function priceSummary(prices: number[]): string {
  const p = [...prices].sort();
  if (!p.length) return "Price";
  if (p.length > 1 && p[p.length - 1] - p[0] === p.length - 1) return `${"$".repeat(p[0])} to ${"$".repeat(p[p.length - 1])}`;
  return p.map((n) => "$".repeat(n)).join(", ");
}

function cravingSummary(ids: RestaurantFilters["cravings"]): string {
  if (!ids.length) return "Craving";
  if (ids.length === 1) return cravingById.get(ids[0])?.label ?? "1 craving";
  return `${ids.length} cravings`;
}

function FilterPill({
  active,
  onClick,
  children,
  label,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      className={`flex h-11 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-full px-3.5 text-[15px] font-extrabold ${
        active ? "bg-signal text-ink" : "bg-white text-ink"
      } ${className}`}
    >
      {children}
      <ChevronDownIcon size={16} className="shrink-0" />
    </button>
  );
}

export default function MapScreen() {
  const { unlocked, checkins, uid, loaded } = useUnlocked();
  const { rank, next, unlocksToNext } = rankProgress(unlocked.size);
  const { rankUp, dismiss: dismissRankUp } = useRankUp(uid, unlocked.size, loaded);

  const [filters, setFilters] = useState<RestaurantFilters>(DEFAULT_FILTERS);
  const [sheet, setSheet] = useState<FilterSection | null>(null);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [layers, setLayers] = useState<Set<MapLayer>>(new Set(["food", "landmark", "shopping"]));
  const [hoodInfo, setHoodInfo] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Default view is the neighborhoods and a few famous landmarks. Every restaurant, shop and smaller
  // landmark appears once a neighborhood is opened or a filter is set.
  const layersChanged = layers.size !== ALL_LAYERS.length;
  const focused = activeFilterCount(filters) > 0 || layersChanged;
  const visible = useMemo(
    () => (focused && layers.has("food") ? filterRestaurants(restaurants, filters) : []),
    [focused, filters, layers],
  );
  // A dozen iconic landmarks stay on the map everywhere, even while one neighborhood is open: seeing
  // them is what pulls people toward somewhere new. Everything else shows once a neighborhood opens.
  const visiblePlaces = useMemo(() => {
    const all = mapPlaces.filter((p) => p.type !== "store");
    const iconic = layers.has("landmark") ? all.filter((p) => p.iconic) : [];
    if (!focused) return iconic;
    const rest = filterPlaces(
      all.filter((p) => !p.iconic && layers.has(p.type === "landmark" ? "landmark" : "shopping")),
      filters,
    );
    return [...iconic, ...rest];
  }, [focused, filters, layers]);

  const changeLayers = useCallback((next: Set<MapLayer>) => {
    setLayers(next);
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

  const findMe = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (userPos) return userPos;
    setLocating(true);
    setLocateError(null);
    try {
      const pos = await locate();
      setUserPos(pos);
      return pos;
    } catch (e) {
      setLocateError((e as Error).message);
      return null;
    } finally {
      setLocating(false);
    }
  }, [userPos]);

  const nearMe = useCallback(
    async (radiusM: number) => {
      const pos = await findMe();
      if (!pos) return;
      changeFilters({ ...filters, location: { kind: "near", lat: pos.lat, lng: pos.lng, radiusM } });
      setFlyTo({ kind: "point", lat: pos.lat, lng: pos.lng, zoom: radiusM <= 400 ? 16 : radiusM <= 800 ? 15 : 14.5 });
    },
    [filters, findMe, changeFilters],
  );

  const centerOnMe = useCallback(async () => {
    const pos = await findMe();
    if (pos) setFlyTo({ kind: "point", lat: pos.lat, lng: pos.lng, zoom: 15 });
  }, [findMe]);

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
  const backToAll = useCallback(() => {
    changeFilters(DEFAULT_FILTERS);
    setLayers(new Set(ALL_LAYERS));
    setHoodInfo(null);
    setFlyTo({ kind: "point", lat: BOSTON_CENTER[0], lng: BOSTON_CENTER[1], zoom: 13 });
  }, [changeFilters]);
  const closeSheet = useCallback(() => setSheet(null), []);

  // The peek card: the tapped spot, else the best spot in the tapped neighborhood, else the
  // closest spot you haven't eaten at, preferring foggy neighborhoods.
  const pick = useMemo(() => {
    if (selected) return selected;
    const anchor = userPos ?? { lat: BOSTON_CENTER[0], lng: BOSTON_CENTER[1] };
    const pool = hoodInfo ? visible.filter((r) => r.neighborhood === hoodInfo) : visible;
    const score = (r: Restaurant) =>
      distanceM(r, anchor) + (checkins.has(r.id) ? 1e7 : 0) + (!hoodInfo && unlocked.has(r.neighborhood) ? 1e6 : 0);
    return [...pool].sort((a, b) => score(a) - score(b))[0] ?? null;
  }, [selected, hoodInfo, visible, userPos, checkins, unlocked]);

  const pickHood = pick ? neighborhoodById.get(pick.neighborhood) : null;
  const eaten = pick ? restaurantsIn(pick.neighborhood).filter((r) => checkins.has(r.id)).length : 0;
  const tappedHoodName = hoodInfo ? neighborhoodById.get(hoodInfo)?.properties.name : null;

  const lineFilter = filters.lines.length ? LINE_ORDER.filter((l) => filters.lines.includes(l)) : LINE_ORDER.slice(0, 4);

  return (
    // fills the screen above the app's bottom nav
    // header first in the DOM so keyboard users reach the filters before the map
    <div className="fixed inset-x-0 bottom-nav top-0 overflow-hidden bg-fog">
      <header className="surface-dark absolute inset-x-0 top-0 z-[1000] bg-ink">
        <div className="space-y-3 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[22px] font-black leading-none text-ink"
                aria-hidden="true"
              >
                {APP_NAME[0]}
              </span>
              <h1 className="text-[24px] font-black tracking-[-1px] text-white">{APP_NAME}</h1>
            </div>
            <Link
              href="/profile"
              aria-label={`${rank.name}, ${unlocked.size} of ${TOTAL_HOODS} neighborhoods unlocked${
                next ? `, ${unlocksToNext} more to ${next.name}` : ""
              }`}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-white px-3 text-[14px] font-extrabold text-ink"
            >
              <RankBadge rank={rank} />
              <span aria-hidden="true">
                {unlocked.size} of {TOTAL_HOODS}
              </span>
            </Link>
          </div>

          <div className="flex gap-2">
            <FilterPill
              active={layersChanged || filters.cravings.length > 0}
              onClick={() => setSheet("show")}
              className="!flex-[1.3_1_auto]"
              label={`What to show: ${layerSummary(layers)}${filters.cravings.length ? `, ${cravingSummary(filters.cravings)}` : ""}`}
            >
              <span className="truncate">{layerSummary(layers)}</span>
            </FilterPill>
            <FilterPill
              active={filters.prices.length > 0}
              onClick={() => setSheet("price")}
              label={`Price filter: ${filters.prices.length ? priceSummary(filters.prices) : "any"}`}
            >
              <span className="truncate">{priceSummary(filters.prices)}</span>
            </FilterPill>
            <FilterPill
              active={filters.lines.length > 0}
              onClick={() => setSheet("line")}
              label={`T line filter: ${filters.lines.length ? filters.lines.join(", ") : "any"}`}
            >
              <span className="flex shrink-0 -space-x-0.5" aria-hidden="true">
                {lineFilter.map((l) => (
                  <span key={l} className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: lineColor(l) }} />
                ))}
              </span>
              <span className="truncate">T line</span>
            </FilterPill>
          </div>

          {focused && (
            <div className="flex">
              <Chip onClick={backToAll} aria-pressed={undefined} aria-label="Back to all of Boston">
                ✕ All of Boston
              </Chip>
            </div>
          )}
        </div>
        <LineStripe />
      </header>

      <FogMap
        restaurants={visible}
        places={visiblePlaces}
        selectedPlaceId={selectedPlace?.id ?? null}
        onSelectPlace={(p) => {
          setSelectedPlace(p);
          setSelected(null);
          setHoodInfo(null);
        }}
        unlocked={unlocked}
        visited={checkins}
        selectedId={selected?.id ?? null}
        userPos={userPos}
        flyTo={flyTo}
        onSelectRestaurant={(r) => {
          setSelected(r);
          setSelectedPlace(null);
          setHoodInfo(null);
        }}
        onSelectNeighborhood={selectHood}
        onMapTap={clearSelection}
      />

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-md flex-col items-end gap-3">
        <button
          type="button"
          onClick={centerOnMe}
          aria-label={locating ? "Finding your location" : "Show my location"}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-line-blue shadow-soft"
        >
          <LocateIcon size={24} />
        </button>
        {locateError && !sheet && (
          <p role="alert" className="pointer-events-auto w-full rounded-card bg-ink px-4 py-2.5 text-[14px] font-bold text-white">
            {locateError}
          </p>
        )}
        <div className="pointer-events-auto w-full">
          {selectedPlace ? (
            <PlaceCard
              p={selectedPlace}
              unlocked={unlocked.has(selectedPlace.neighborhood)}
              onClose={() => setSelectedPlace(null)}
            />
          ) : !focused ? (
            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[18px] font-black tracking-[-0.5px]">Tap a neighborhood</p>
              <p className="text-[14px] text-muted">See every spot inside it. Tap a landmark to learn more.</p>
            </div>
          ) : pick && pickHood ? (
            <PeekCard
              r={pick}
              hoodName={pickHood.properties.name}
              unlocked={unlocked.has(pick.neighborhood)}
              eaten={eaten}
            />
          ) : (
            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[18px] font-black tracking-[-0.5px]">
                {tappedHoodName ? `No spots in ${tappedHoodName} match` : "No spots match"}
              </p>
              <p className="text-[14px] text-muted">Try fewer filters.</p>
              <button
                type="button"
                onClick={() => changeFilters(DEFAULT_FILTERS)}
                className="mt-3 min-h-[44px] rounded-full bg-ink px-5 text-[15px] font-extrabold text-white"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {rankUp && <RankUpScreen rank={rankUp} unlocked={unlocked.size} onClose={dismissRankUp} />}

      <FilterSheet
        open={sheet !== null}
        focusSection={sheet ?? "craving"}
        onClose={closeSheet}
        filters={filters}
        onChange={changeFilters}
        layers={layers}
        onLayersChange={changeLayers}
        resultCount={visible.length + visiblePlaces.length}
        unlocked={unlocked}
        onNearMe={nearMe}
        locating={locating}
        locateError={locateError}
      />
    </div>
  );
}
