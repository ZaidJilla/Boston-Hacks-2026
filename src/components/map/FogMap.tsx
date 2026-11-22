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

/**
 * Pins grow with the map: none while zoomed far out, a small mark at city zoom, full size once you
 * are in close. 0 at zoom 12 and below, then 0.6, 0.75, 0.9, 1 from zoom 13 to 16.
 */
const PIN_MIN_ZOOM = 13;
const pinScale = (zoom: number) => (zoom < PIN_MIN_ZOOM ? 0 : Math.min(1, 0.6 + (zoom - PIN_MIN_ZOOM) * 0.15));

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
  // Station dots grow with the map like the pins do: gone when zoomed far out, bigger as you go in.
  const scale = pinScale(zoom);
  if (scale === 0) return null;
  return (
    <>
      {stations.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={Math.max(2.5, Math.round(5.5 * scale))}
          pathOptions={{ renderer, color: INK, weight: scale < 0.8 ? 2 : 2.5, fillColor: "#FFFFFF", fillOpacity: 1 }}
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
  // The padlock under a foggy neighborhood's name scales with zoom too (none until zoom 13).
  const lockPx = Math.round(16 * pinScale(zoom));
  const icons = useMemo(
    () =>
      new Map(
        neighborhoods.features.map((f) => {
          const name = escapeHtml(f.properties.name);
          const clear = unlocked.has(f.properties.id);
          const html = clear
            ? `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:${LINE_COLORS.green};color:#fff;border-radius:999px;padding:4px 12px;font:800 13px/1.2 var(--font-inter),sans-serif;letter-spacing:.8px;text-transform:uppercase">${name}</span>`
            : `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);white-space:nowrap;color:#2B3136;font:800 12px/1.2 var(--font-inter),sans-serif;letter-spacing:.8px;text-transform:uppercase;text-shadow:0 0 3px #fff,0 0 6px #fff">${name}${lockPx ? `<svg width="${lockPx}" height="${lockPx}" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#2B3136"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#2B3136" stroke-width="2.4"/></svg>` : ""}</span>`;
          return [f.properties.id, L.divIcon({ className: "hood-label", html, iconSize: [0, 0], iconAnchor: [0, 0] })];
        }),
      ),
    [unlocked, lockPx],
  );
  if (zoom < 12) return null;
  return (
    <>
      {neighborhoods.features
        // Tiny neighborhoods (Leather District, Bay Village, Chinatown...) pile their names on top of
        // each other when zoomed out, so they get a label once there is room. Unlocked ones always do.
        .filter((f) => zoom >= 14 || unlocked.has(f.properties.id) || (f.properties.sqmiles ?? 1) >= 0.6)
        .map((f) => (
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

// Landmarks are diamonds and shopping is a square, so each type reads at a glance next to the food
// pins. Same colors as food: amber while the neighborhood is in fog, white once it is clear.
/** Famous landmarks are drawn a little larger than other places. */
const FAMOUS_EXTRA = 3;
const placeIconCache = new Map<string, L.DivIcon>();
function placeIcon(type: MapPlace["type"], state: "selected" | "clear" | "fog", size: number): L.DivIcon {
  const key = `${type}|${state}|${size}`;
  const hit = placeIconCache.get(key);
  if (hit) return hit;
  const fill = state === "selected" ? LINE_COLORS.blue : state === "clear" ? "#FFFFFF" : AMBER;
  const stroke = state === "selected" ? "#FFFFFF" : INK;
  const w = state === "selected" ? 2.5 : 2;
  const shape =
    type === "landmark"
      ? `<polygon points="10,1.5 18.5,10 10,18.5 1.5,10" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`
      : `<rect x="3" y="3" width="14" height="14" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  // Small pins keep a 26 px tap target around them.
  const box = Math.max(size, 26);
  const icon = L.divIcon({
    className: "place-pin",
    html: `<div style="width:${box}px;height:${box}px;display:flex;align-items:center;justify-content:center"><svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${shape}</svg></div>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
  placeIconCache.set(key, icon);
  return icon;
}

function PlacePins({
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
  const map = useMap();
  const { zoom, bounds } = useView();
  const base = Math.round(18 * pinScale(zoom));

  // Label a famous place only if its label doesn't land on one already placed, so downtown doesn't
  // become a pile of overlapping names. Shorter names go first because they pack better.
  const labelled = useMemo(() => {
    const out = new Set<string>();
    if (zoom < 14) return out;
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const famous = places.filter((p) => p.famous && p.id !== selectedId).sort((a, b) => a.name.length - b.name.length);
    for (const p of famous) {
      const pt = map.latLngToContainerPoint([p.lat, p.lng]);
      const w = p.name.length * 6 + 14;
      const h = 20;
      const top = pt.y - (base + FAMOUS_EXTRA) / 2 - h - 3;
      const box = { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: top, y2: top + h };
      if (boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) continue;
      boxes.push(box);
      out.add(p.id);
    }
    return out;
    // `bounds` changes after every pan or zoom, and label positions are screen-relative
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, zoom, bounds, selectedId, map, base]);

  if (base === 0) return null;

  return (
    <>
      {places.map((p) => {
        const size = p.famous ? base + FAMOUS_EXTRA : base;
        const state = p.id === selectedId ? "selected" : unlocked.has(p.neighborhood) ? "clear" : "fog";
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={placeIcon(p.type, state, size)}
            title={p.name}
            keyboard={false}
            zIndexOffset={p.id === selectedId ? 1000 : p.famous ? 100 : 0}
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
              <span className="font-bold">{p.name}</span>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

function pinIcon(state: PinState, selected: boolean, base: number): L.DivIcon {
  const size = selected ? base + 6 : base;
  const glyphPx = Math.max(7, Math.round(size * 0.55));
  const glyph =
    state === "visited"
      ? `<svg width="${glyphPx}" height="${glyphPx}" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : state === "fog"
        ? `<span style="font:900 ${glyphPx}px/1 var(--font-inter),sans-serif;color:#000">?</span>`
        : "";
  const ring = selected ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${LINE_COLORS.blue};` : "box-shadow:0 2px 4px rgba(0,0,0,.25);";
  return L.divIcon({
    className: "food-pin",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;border:2px solid #000;background:${PIN_FILL[state]};box-sizing:border-box;${ring}">${glyph}</span>`,
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
  const scale = pinScale(zoom);
  const pinPx = Math.round(22 * scale);
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const s of ["visited", "fog", "clear"] as PinState[]) {
      m.set(`${s}-0`, pinIcon(s, false, pinPx));
      m.set(`${s}-1`, pinIcon(s, true, pinPx));
    }
    return m;
  }, [pinPx]);

  if (scale === 0) return null;

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
  const radius = Math.max(2, Math.round(4 * scale));
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
  places,
  selectedPlaceId,
  onSelectPlace,
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
      {/* Esri Light Gray Canvas: a quiet, modern base so the T lines, fog and pins carry the map. The
          reference layer on top adds street and place labels. No API key needed. */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · MBTA · City of Boston'
        maxNativeZoom={16}
        maxZoom={19}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={16}
        maxZoom={19}
        pane="overlayPane"
        zIndex={2}
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

      {/* above every pin, so a neighborhood name is never covered by a dot or diamond */}
      <Pane name="hoodlabels" style={{ zIndex: 450, pointerEvents: "none" }}>
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

      <Pane name="places" style={{ zIndex: 435 }}>
        <PlacePins places={places} unlocked={unlocked} selectedId={selectedPlaceId} onSelect={onSelectPlace} />
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
