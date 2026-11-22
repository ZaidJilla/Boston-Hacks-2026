"use client";
// 190px mini map at the top of a restaurant page: the station's T lines, the station, a dotted
// walk to the restaurant pin. Not interactive; it's a picture of where the place is.
import L from "leaflet";
import { useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import { LINE_COLORS } from "@/lib/config";
import { lines, LINE_ORDER, type Restaurant } from "@/lib/geo";
import type { Station } from "@/lib/types";
import { lineTextColor } from "@/components/signage/LineBullet";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapBanner({ r, station }: { r: Restaurant; station: Station | undefined }) {
  const line = station ? LINE_ORDER.find((l) => station.lines.includes(l)) : undefined;
  const color = line ? LINE_COLORS[line] : LINE_COLORS.green;

  const bounds = useMemo(() => {
    const pts: [number, number][] = [[r.lat, r.lng]];
    if (station) pts.push([station.lat, station.lng]);
    return L.latLngBounds(pts).pad(0.6);
  }, [r, station]);

  const pin = useMemo(
    () =>
      L.divIcon({
        className: "food-pin",
        html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#000;box-shadow:0 2px 6px rgba(0,0,0,.3)"><span style="width:12px;height:12px;border-radius:999px;background:#FFB81C"></span></span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    [],
  );

  const label = useMemo(
    () =>
      station
        ? L.divIcon({
            className: "hood-label",
            html: `<span style="display:inline-block;transform:translate(-50%,calc(-100% - 12px));white-space:nowrap;background:${color};color:${line ? lineTextColor(line) : "#fff"};border-radius:999px;padding:4px 14px;font:800 13px/1.2 var(--font-inter),sans-serif;letter-spacing:.8px;text-transform:uppercase">${escapeHtml(station.name)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })
        : null,
    [station, color, line],
  );

  const stationLines = station ? lines.filter((l) => station.lines.includes(l.id)) : [];

  return (
    <div className="relative h-[190px] w-full overflow-hidden bg-fog">
      <MapContainer
        bounds={bounds}
        maxZoom={17}
        zoomControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        attributionControl
        className="signage-map h-full w-full"
        style={{ background: "#CDD2D7" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        {stationLines.flatMap((l) =>
          l.branches.map((b) => (
            <Polyline
              key={`${l.id}-${b.routeId}-${b.terminus}`}
              positions={b.shape}
              pathOptions={{ color: l.color, weight: 8, opacity: 1, lineCap: "round", interactive: false }}
            />
          )),
        )}
        {station && (
          <>
            <Polyline
              positions={[
                [station.lat, station.lng],
                [r.lat, r.lng],
              ]}
              pathOptions={{ color: "#000", weight: 3.5, dashArray: "1 8", lineCap: "round", interactive: false }}
            />
            <CircleMarker
              center={[station.lat, station.lng]}
              radius={7}
              pathOptions={{ color: "#000", weight: 3.5, fillColor: "#fff", fillOpacity: 1, interactive: false }}
            />
            {label && <Marker position={[station.lat, station.lng]} icon={label} interactive={false} keyboard={false} />}
          </>
        )}
        <Marker position={[r.lat, r.lng]} icon={pin} interactive={false} keyboard={false} />
      </MapContainer>

      {/* fog creeping in at the corners */}
      <div
        className="pointer-events-none absolute inset-0 z-[500]"
        style={{
          background:
            "radial-gradient(circle at 0% 100%, rgba(205,210,215,.95), rgba(205,210,215,0) 38%), radial-gradient(circle at 100% 100%, rgba(205,210,215,.9), rgba(205,210,215,0) 34%), radial-gradient(circle at 100% 0%, rgba(205,210,215,.8), rgba(205,210,215,0) 28%)",
          filter: "blur(2px)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
