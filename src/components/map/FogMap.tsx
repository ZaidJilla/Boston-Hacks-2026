"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Pane, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
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
  type NeighborhoodFeature,
  type Restaurant,
} from "@/lib/geo";

export type FlyTarget =
  | { kind: "bounds"; bounds: [[number, number], [number, number]] }
  | { kind: "point"; lat: number; lng: number; zoom: number }
  | null;

interface Props {
  restaurants: Restaurant[];
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

// Locked: muted grey wash. Unlocked: clear, with a colored edge (T green = progress).
const FOG: PathOptions = { fillColor: "#8A939B", fillOpacity: 0.55, color: "#7C878E", weight: 1, opacity: 0.7 };
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
          data={neighborhoods}
          interactive={false}
          style={hoodStyle as L.StyleFunction}
        />
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
