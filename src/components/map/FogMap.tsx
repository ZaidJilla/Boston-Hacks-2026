"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import { BOSTON_CENTER, LINE_COLORS } from "@/lib/config";
import {
  BOSTON_BOUNDS,
  lines,
  neighborhoodAt,
  neighborhoodBounds,
  neighborhoodById,
  neighborhoods,
  stationColor,
  stations,
  type MapPlace,
  type NeighborhoodFeature,
  type Restaurant,
} from "@/lib/geo";

export type FlyTarget =
  | { kind: "bounds"; bounds: [[number, number], [number, number]] }
  | { kind: "point"; lat: number; lng: number; zoom: number }
  | null;

interface Props {
  restaurants: Restaurant[];
  places: MapPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (p: MapPlace) => void;
  unlocked: Set<string>;
  selectedId: string | null;
  userPos: { lat: number; lng: number } | null;
  flyTo: FlyTarget;
  onSelectRestaurant: (r: Restaurant) => void;
  onSelectNeighborhood: (id: string) => void;
  onMapTap: () => void;
}

const INK = "#14181C";
const FOG_COLOR = "#C9CED3";

// Locked: muted grey wash with a dark border so neighboring areas are easy to tell apart.
// Unlocked: clear, with a colored edge (T green = progress).
const FOG: PathOptions = { fillColor: "#8A939B", fillOpacity: 0.55, color: "#2B3137", weight: 2, opacity: 0.9 };
const CLEAR: PathOptions = { fillColor: LINE_COLORS.green, fillOpacity: 0.04, color: LINE_COLORS.green, weight: 3, opacity: 1 };

function Flyer({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // leave room for the top bar and the filter sheet
    const pad = { paddingTopLeft: [24, 80] as [number, number], paddingBottomRight: [24, 120] as [number, number] };
    if (target.kind === "bounds") map.flyToBounds(target.bounds, { ...pad, duration: 0.8 });
    else map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [map, target]);
  return null;
}

function useZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const on = () => setZoom(map.getZoom());
    map.on("zoomend", on);
    return () => {
      map.off("zoomend", on);
    };
  }, [map]);
  return zoom;
}

/**
 * Marker canvases sit above the fog layer and swallow taps, so neighborhood taps are
 * resolved here from the tap point instead of via polygon click handlers.
 */
function TapCatcher({ onHood, onEmpty }: { onHood: (id: string) => void; onEmpty: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      const hood = neighborhoodAt(e.latlng.lat, e.latlng.lng);
      if (hood) onHood(hood.properties.id);
      else onEmpty();
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onHood, onEmpty]);
  return null;
}

// Landmarks are diamonds and shopping is a square, so each type reads at a glance next to the food
// dots. Same rule as food: solid ink once the neighborhood is unlocked, hollow while it is foggy.
const iconCache = new Map<string, L.DivIcon>();
function placeIcon(type: MapPlace["type"], state: "selected" | "open" | "fog", size: number): L.DivIcon {
  const key = `${type}|${state}|${size}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const fill = state === "selected" ? LINE_COLORS.blue : state === "open" ? INK : "#ffffff";
  const stroke = state === "selected" ? "#ffffff" : INK;
  const w = state === "selected" ? 2.5 : 1.8;
  const shape =
    type === "landmark"
      ? `<polygon points="10,1.5 18.5,10 10,18.5 1.5,10" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`
      : `<rect x="3" y="3" width="14" height="14" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  const icon = L.divIcon({
    className: "",
    html: `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" style="display:block;filter:drop-shadow(0 0 1px rgba(0,0,0,.45))">${shape}</svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function PlaceMarkers({
  places,
  unlocked,
  selectedId,
  onSelect,
}: {
  places: MapPlace[];
  unlocked: Set<string>;
  selectedId: string | null;
  onSelect: (p: MapPlace) => void;
}) {
  const zoom = useZoom();
  const map = useMap();
  const [moved, setMoved] = useState(0);
  useEffect(() => {
    const on = () => setMoved((n) => n + 1);
    map.on("moveend", on);
    return () => {
      map.off("moveend", on);
    };
  }, [map]);
  const base = zoom <= 13 ? 14 : zoom <= 14 ? 17 : 22;

  // Only label a famous place if its label doesn't land on one already placed, so downtown
  // doesn't turn into a pile of overlapping names. Shorter names go first because they pack better.
  const labelled = useMemo(() => {
    const out = new Set<string>();
    if (zoom < 14) return out;
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const famous = places.filter((p) => p.famous && p.id !== selectedId).sort((a, b) => a.name.length - b.name.length);
    for (const p of famous) {
      const pt = map.latLngToContainerPoint([p.lat, p.lng]);
      const w = p.name.length * 6.6 + 16;
      const h = 22;
      const top = pt.y - (base + 6) / 2 - h - 4;
      const box = { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: top, y2: top + h };
      if (boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) continue;
      boxes.push(box);
      out.add(p.id);
    }
    return out;
    // `moved` re-runs this after every pan, since label positions are screen-relative
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, zoom, selectedId, map, base, moved]);

  return (
    <>
      {places.map((p) => {
        const size = p.famous ? base + 6 : base;
        const state = p.id === selectedId ? "selected" : unlocked.has(p.neighborhood) ? "open" : "fog";
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            pane="places"
            icon={placeIcon(p.type, state, size)}
            keyboard={false}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelect(p);
              },
            }}
          >
            <Tooltip
              key={`${p.id}-${labelled.has(p.id)}`}
              direction="top"
              offset={[0, -size / 2]}
              permanent={labelled.has(p.id)}
              className={p.famous ? "famous-label" : undefined}
            >
              <span className="font-semibold">{p.name}</span>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

const labelCache = new Map<string, L.DivIcon>();
function labelIcon(name: string, unlocked: boolean): L.DivIcon {
  const key = `${name}|${unlocked}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const icon = L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:700 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${unlocked ? "#00602B" : "#2B3137"};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff;pointer-events:none">${name}</div>`,
    iconSize: [0, 0],
  });
  labelCache.set(key, icon);
  return icon;
}

/** Neighborhood names, so the map reads as a map of places, not just grey shapes. */
function NeighborhoodLabels({ unlocked }: { unlocked: Set<string> }) {
  const zoom = useZoom();
  if (zoom < 12) return null;
  return (
    <>
      {neighborhoods.features
        // tiny neighborhoods only get a label once there is room for it
        .filter((f) => zoom >= 14 || (f.properties.sqmiles ?? 1) >= 0.6)
        .map((f) => (
          <Marker
            key={f.properties.id}
            position={f.properties.center}
            pane="labels"
            icon={labelIcon(f.properties.name, unlocked.has(f.properties.id))}
            interactive={false}
            keyboard={false}
          />
        ))}
    </>
  );
}

function FoodMarkers({
  restaurants,
  unlocked,
  selectedId,
  renderer,
  onSelect,
}: {
  restaurants: Restaurant[];
  unlocked: Set<string>;
  selectedId: string | null;
  renderer: L.Renderer;
  onSelect: (r: Restaurant) => void;
}) {
  const zoom = useZoom();
  const base = zoom <= 12 ? 3 : zoom <= 13 ? 4 : zoom <= 14 ? 5 : 7;
  return (
    <>
      {restaurants.map((r) => {
        const isOpen = unlocked.has(r.neighborhood);
        const selected = r.id === selectedId;
        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={selected ? base + 4 : base}
            pathOptions={{
              renderer,
              // unlocked spots are solid ink; fogged ones are hollow so they read as "not yet"
              color: selected ? "#ffffff" : INK,
              weight: selected ? 3 : base <= 3 ? 1 : 1.5,
              fillColor: selected ? LINE_COLORS.blue : isOpen ? INK : "#ffffff",
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelect(r);
              },
            }}
          />
        );
      })}
    </>
  );
}

export default function FogMap({
  restaurants,
  places,
  selectedPlaceId,
  onSelectPlace,
  unlocked,
  selectedId,
  userPos,
  flyTo,
  onSelectRestaurant,
  onSelectNeighborhood,
  onMapTap,
}: Props) {
  // Canvas renderers with a generous hit tolerance so small dots are easy to tap with a thumb.
  const renderers = useMemo(
    () => ({
      lines: L.canvas({ pane: "lines" }),
      stations: L.canvas({ pane: "stations", tolerance: 6 }),
      food: L.canvas({ pane: "food", tolerance: 10 }),
    }),
    [],
  );

  const hoodStyle = (f?: NeighborhoodFeature) => (f && unlocked.has(f.properties.id) ? CLEAR : FOG);
  // Draw unlocked neighborhoods last so their green edge sits on top of a shared fog border.
  const orderedHoods = useMemo(
    () => ({
      ...neighborhoods,
      features: [...neighborhoods.features].sort(
        (a, b) => Number(unlocked.has(a.properties.id)) - Number(unlocked.has(b.properties.id)),
      ),
    }),
    [unlocked],
  );

  return (
    <MapContainer
      center={BOSTON_CENTER}
      zoom={13}
      minZoom={11}
      maxZoom={18}
      maxBounds={[
        [BOSTON_BOUNDS[0][0] - 0.08, BOSTON_BOUNDS[0][1] - 0.12],
        [BOSTON_BOUNDS[1][0] + 0.08, BOSTON_BOUNDS[1][1] + 0.12],
      ]}
      zoomControl={false}
      // mute the OSM tiles so the fog and T colors carry the map
      className="h-full w-full [&_.leaflet-tile-pane]:opacity-80 [&_.leaflet-tile-pane]:grayscale-[70%]"
      style={{ background: FOG_COLOR }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · MBTA · City of Boston'
        maxZoom={19}
      />
      <Flyer target={flyTo} />
      <TapCatcher onHood={onSelectNeighborhood} onEmpty={onMapTap} />

      <Pane name="fog" style={{ zIndex: 400 }}>
        <GeoJSON
          // re-key so Leaflet restyles when the unlocked set changes
          key={[...unlocked].sort().join(",")}
          data={orderedHoods}
          interactive={false}
          style={hoodStyle as L.StyleFunction}
        />
      </Pane>

      <Pane name="labels" style={{ zIndex: 405, pointerEvents: "none" }}>
        <NeighborhoodLabels unlocked={unlocked} />
      </Pane>

      <Pane name="lines" style={{ zIndex: 410, pointerEvents: "none" }}>
        {lines.flatMap((l) =>
          l.branches.map((b) => (
            <Polyline
              key={`${l.id}-${b.routeId}-${b.terminus}`}
              positions={b.shape}
              pathOptions={{ color: l.color, weight: 4, opacity: 0.9, interactive: false, renderer: renderers.lines }}
            />
          )),
        )}
      </Pane>

      <Pane name="stations" style={{ zIndex: 420 }}>
        {stations.map((s) => {
          const transfer = s.lines.length > 1;
          return (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              radius={transfer ? 5 : 4}
              pathOptions={{
                renderer: renderers.stations,
                color: transfer ? INK : "#ffffff",
                weight: transfer ? 2 : 1.5,
                fillColor: stationColor(s),
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <span className="font-semibold">{s.name}</span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </Pane>

      <Pane name="food" style={{ zIndex: 430 }}>
        <FoodMarkers
          restaurants={restaurants}
          unlocked={unlocked}
          selectedId={selectedId}
          renderer={renderers.food}
          onSelect={onSelectRestaurant}
        />
      </Pane>

      <Pane name="places" style={{ zIndex: 435 }}>
        <PlaceMarkers places={places} unlocked={unlocked} selectedId={selectedPlaceId} onSelect={onSelectPlace} />
      </Pane>

      {userPos && (
        <Pane name="me" style={{ zIndex: 440 }}>
          <CircleMarker
            center={[userPos.lat, userPos.lng]}
            radius={8}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: LINE_COLORS.blue, fillOpacity: 1, interactive: false }}
          />
        </Pane>
      )}
    </MapContainer>
  );
}

export function boundsFor(hoodId: string) {
  const f = neighborhoodById.get(hoodId);
  return f ? neighborhoodBounds(f) : null;
}
