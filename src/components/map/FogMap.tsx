"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Pane, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import {
  BOSTON_BOUNDS,
  BOSTON_CENTER,
  lines,
  neighborhoodBounds,
  neighborhoodById,
  neighborhoods,
  stationColor,
  stations,
  type Neighborhood,
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

// Locked neighborhoods: flat grey wash. Unlocked: clear with a colored edge.
const FOG: PathOptions = { fillColor: "#64748b", fillOpacity: 0.5, color: "#94a3b8", weight: 1, opacity: 0.8 };
const clearStyle = (color: string): PathOptions => ({ fillColor: color, fillOpacity: 0.05, color, weight: 3, opacity: 0.95 });

function Flyer({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // leave room at the bottom for the sheet
    const pad = { paddingTopLeft: [24, 80] as [number, number], paddingBottomRight: [24, 180] as [number, number] };
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
            radius={selected ? base + 4 : isOpen ? base : base - 0.5}
            pathOptions={{
              renderer,
              color: "#ffffff",
              weight: selected ? 3 : base <= 3 ? 1 : 1.5,
              fillColor: selected ? "#0f172a" : isOpen ? "#e11d48" : "#334155",
              fillOpacity: isOpen || selected ? 1 : 0.7,
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

function TapCatcher({ onTap }: { onTap: () => void }) {
  const map = useMap();
  useEffect(() => {
    map.on("click", onTap);
    return () => {
      map.off("click", onTap);
    };
  }, [map, onTap]);
  return null;
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

  const hoodStyle = (f?: Neighborhood) =>
    f && unlocked.has(f.properties.id) ? clearStyle(f.properties.color) : FOG;

  return (
    <MapContainer
      center={BOSTON_CENTER}
      zoom={13}
      minZoom={11}
      maxZoom={16}
      maxBounds={[
        [BOSTON_BOUNDS[0][0] - 0.08, BOSTON_BOUNDS[0][1] - 0.12],
        [BOSTON_BOUNDS[1][0] + 0.08, BOSTON_BOUNDS[1][1] + 0.12],
      ]}
      zoomControl={false}
      attributionControl
      className="h-full w-full"
    >
      <TileLayer
        // keyless, muted basemap so the fog and T colors stand out
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors | Data: <a href="https://www.openstreetmap.org/copyright">OSM</a>, MBTA, City of Boston'
        maxZoom={16}
      />
      <Flyer target={flyTo} />
      <TapCatcher onTap={onMapTap} />

      <Pane name="fog" style={{ zIndex: 400 }}>
        <GeoJSON
          // re-key so Leaflet restyles when the unlocked set changes
          key={[...unlocked].sort().join(",")}
          data={neighborhoods}
          style={hoodStyle as L.StyleFunction}
          onEachFeature={(f: Neighborhood, layer) => {
            layer.on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              onSelectNeighborhood(f.properties.id);
            });
          }}
        />
      </Pane>

      <Pane name="lines" style={{ zIndex: 410, pointerEvents: "none" }}>
        {lines.flatMap((l) =>
          l.branches.map((b, i) => (
            <Polyline
              key={`${l.id}-${i}`}
              positions={b.shape}
              pathOptions={{ color: l.color, weight: 3, opacity: 0.75, interactive: false, renderer: renderers.lines }}
            />
          )),
        )}
      </Pane>

      <Pane name="stations" style={{ zIndex: 420 }}>
        {stations.map((s) => {
          const fill = stationColor(s);
          const transfer = fill === "#ffffff";
          return (
            <CircleMarker
              key={s.id}
              center={[s.lat, s.lng]}
              radius={transfer ? 5 : 4}
              pathOptions={{
                renderer: renderers.stations,
                color: transfer ? "#0f172a" : "#ffffff",
                weight: transfer ? 2 : 1.5,
                fillColor: fill,
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
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1, interactive: false }}
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
