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
  visited: Set<string>;
  selectedId: string | null;
  userPos: { lat: number; lng: number } | null;
  flyTo: FlyTarget;
  onSelectRestaurant: (r: Restaurant) => void;
  onSelectNeighborhood: (id: string) => void;
  onMapTap: () => void;
}

const INK = "#000000";
const FOG = "#CDD2D7";
const MUTED = "#4A5158";
const AMBER = "#FFB81C";
/** At this zoom and closer, pins become DOM markers with a ✓ or ? glyph. */
const PIN_ZOOM = 14;

const FOG_FILL: PathOptions = { stroke: false, fillColor: FOG, fillOpacity: 0.9 };
const FOG_EDGE: PathOptions = { fill: false, color: MUTED, weight: 2, opacity: 0.9, dashArray: "6 6" };
const CLEAR_EDGE: PathOptions = { fill: false, color: LINE_COLORS.green, weight: 5, opacity: 1 };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type PinState = "visited" | "fog" | "clear";
const pinState = (r: Restaurant, unlocked: Set<string>, visited: Set<string>): PinState =>
  visited.has(r.id) ? "visited" : unlocked.has(r.neighborhood) ? "clear" : "fog";
const PIN_FILL: Record<PinState, string> = { visited: LINE_COLORS.green, fog: AMBER, clear: "#FFFFFF" };

function Flyer({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // leave room for the top bar and the peek card
    const pad = { paddingTopLeft: [24, 150] as [number, number], paddingBottomRight: [24, 230] as [number, number] };
    if (target.kind === "bounds") map.flyToBounds(target.bounds, { ...pad, duration: 0.8 });
    else map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [map, target]);
  return null;
}

/** Zoom and visible bounds, updated after each move. */
function useView() {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useEffect(() => {
    const on = () => setView({ zoom: map.getZoom(), bounds: map.getBounds() });
    map.on("zoomend moveend", on);
    return () => {
      map.off("zoomend moveend", on);
    };
  }, [map]);
  return view;
}

/**
 * Marker layers sit above the fog and swallow taps, so neighborhood taps are
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

function TLines({ renderer }: { renderer: L.Renderer }) {
  const { zoom } = useView();
  const weight = zoom >= 13 ? 8 : 5;
  return (
    <>
      {lines.flatMap((l) =>
        l.branches.map((b) => (
          <Polyline
            key={`${l.id}-${b.routeId}-${b.terminus}`}
            positions={b.shape}
            pathOptions={{ color: l.color, weight, opacity: 1, lineCap: "round", interactive: false, renderer }}
          />
        )),
      )}
    </>
  );
}

function Stations({ renderer }: { renderer: L.Renderer }) {
  const { zoom } = useView();
  if (zoom < 12) return null;
  return (
    <>
      {stations.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={zoom >= 14 ? 4.5 : 3.5}
          pathOptions={{ renderer, color: INK, weight: 2.5, fillColor: "#FFFFFF", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            <span className="font-bold">{s.name}</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

function HoodLabels({ unlocked }: { unlocked: Set<string> }) {
  const { zoom } = useView();
  const icons = useMemo(
    () =>
      new Map(
        neighborhoods.features.map((f) => {
          const name = escapeHtml(f.properties.name);
          const clear = unlocked.has(f.properties.id);
          const html = clear
            ? `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:${LINE_COLORS.green};color:#fff;border-radius:999px;padding:4px 12px;font:800 13px/1.2 var(--font-inter),sans-serif;letter-spacing:.8px;text-transform:uppercase">${name}</span>`
            : `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);white-space:nowrap;color:#2B3136;font:800 12px/1.2 var(--font-inter),sans-serif;letter-spacing:.8px;text-transform:uppercase;text-shadow:0 0 3px #fff,0 0 6px #fff">${name}<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#2B3136"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#2B3136" stroke-width="2.4"/></svg></span>`;
          return [f.properties.id, L.divIcon({ className: "hood-label", html, iconSize: [0, 0], iconAnchor: [0, 0] })];
        }),
      ),
    [unlocked],
  );
  if (zoom < 12) return null;
  return (
    <>
      {neighborhoods.features.map((f) => (
        <Marker
          key={f.properties.id}
          position={f.properties.center}
          icon={icons.get(f.properties.id)!}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}

function pinIcon(state: PinState, selected: boolean): L.DivIcon {
  const size = selected ? 34 : 26;
  const glyph =
    state === "visited"
      ? `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : state === "fog"
        ? `<span style="font:900 14px/1 var(--font-inter),sans-serif;color:#000">?</span>`
        : "";
  const ring = selected ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${LINE_COLORS.blue};` : "box-shadow:0 2px 4px rgba(0,0,0,.25);";
  return L.divIcon({
    className: "food-pin",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;border:2.5px solid #000;background:${PIN_FILL[state]};box-sizing:border-box;${ring}">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FoodPins({
  restaurants,
  unlocked,
  visited,
  selectedId,
  renderer,
  onSelect,
}: {
  restaurants: Restaurant[];
  unlocked: Set<string>;
  visited: Set<string>;
  selectedId: string | null;
  renderer: L.Renderer;
  onSelect: (r: Restaurant) => void;
}) {
  const { zoom, bounds } = useView();
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const s of ["visited", "fog", "clear"] as PinState[]) {
      m.set(`${s}-0`, pinIcon(s, false));
      m.set(`${s}-1`, pinIcon(s, true));
    }
    return m;
  }, []);

  if (zoom >= PIN_ZOOM) {
    // DOM markers only for what's on screen, so a phone isn't juggling 700 of them.
    const area = bounds.pad(0.25);
    return (
      <>
        {restaurants
          .filter((r) => r.id === selectedId || area.contains([r.lat, r.lng]))
          .map((r) => {
            const sel = r.id === selectedId;
            return (
              <Marker
                key={r.id}
                position={[r.lat, r.lng]}
                icon={icons.get(`${pinState(r, unlocked, visited)}-${sel ? 1 : 0}`)!}
                title={r.name}
                zIndexOffset={sel ? 1000 : 0}
                eventHandlers={{ click: () => onSelect(r) }}
              />
            );
          })}
      </>
    );
  }

  // Small at city zoom so 700 spots don't bury the lines; zoom in for full pins.
  const radius = zoom <= 12 ? 3 : 4;
  return (
    <>
      {restaurants.map((r) => {
        const sel = r.id === selectedId;
        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={sel ? radius + 4 : radius}
            pathOptions={{
              renderer,
              color: sel ? LINE_COLORS.blue : INK,
              weight: sel ? 3 : 1.25,
              fillColor: PIN_FILL[pinState(r, unlocked, visited)],
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
  visited,
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

  const fogged = useMemo(
    () => ({ ...neighborhoods, features: neighborhoods.features.filter((f) => !unlocked.has(f.properties.id)) }),
    [unlocked],
  );
  // Unlocked edges drawn last so the green sits on top of a shared dashed border.
  const edges = useMemo(
    () => ({
      ...neighborhoods,
      features: [...neighborhoods.features].sort(
        (a, b) => Number(unlocked.has(a.properties.id)) - Number(unlocked.has(b.properties.id)),
      ),
    }),
    [unlocked],
  );
  const edgeStyle = (f?: NeighborhoodFeature) => (f && unlocked.has(f.properties.id) ? CLEAR_EDGE : FOG_EDGE);
  const unlockKey = [...unlocked].sort().join(",");

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
      className="signage-map h-full w-full"
      style={{ background: FOG }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · MBTA · City of Boston'
        maxZoom={19}
      />
      <Flyer target={flyTo} />
      <TapCatcher onHood={onSelectNeighborhood} onEmpty={onMapTap} />

      {/* blurred by CSS (.leaflet-fogfill-pane) */}
      <Pane name="fogfill" style={{ zIndex: 400, pointerEvents: "none" }}>
        <GeoJSON key={`fill-${unlockKey}`} data={fogged} interactive={false} style={() => FOG_FILL} />
      </Pane>
      <Pane name="fogedge" style={{ zIndex: 405, pointerEvents: "none" }}>
        <GeoJSON key={`edge-${unlockKey}`} data={edges} interactive={false} style={edgeStyle as L.StyleFunction} />
      </Pane>

      <Pane name="lines" style={{ zIndex: 410, pointerEvents: "none" }}>
        <TLines renderer={renderers.lines} />
      </Pane>

      <Pane name="stations" style={{ zIndex: 420 }}>
        <Stations renderer={renderers.stations} />
      </Pane>

      <Pane name="hoodlabels" style={{ zIndex: 425, pointerEvents: "none" }}>
        <HoodLabels unlocked={unlocked} />
      </Pane>

      <Pane name="food" style={{ zIndex: 430 }}>
        <FoodPins
          restaurants={restaurants}
          unlocked={unlocked}
          visited={visited}
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
