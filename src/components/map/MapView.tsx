"use client";
// Client-only Leaflet map. Loaded via MapLoader (next/dynamic, ssr:false).
import { CircleMarker, GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import Link from "next/link";
import neighborhoods from "../../../data/neighborhoods.json";
import { restaurants, stations } from "@/lib/data";
import { BOSTON_CENTER } from "@/lib/config";
import { LINE_COLORS } from "@/lib/config";

export default function MapView({ unlocked = [] }: { unlocked?: string[] }) {
  return (
    <MapContainer center={BOSTON_CENTER} zoom={13} className="h-[calc(100vh-3.5rem)] w-full" zoomControl={false}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        data={neighborhoods as GeoJSON.FeatureCollection}
        style={(f) => {
          const open = unlocked.includes(f?.properties?.id);
          return open
            ? { color: "#00843D", weight: 3, fillOpacity: 0 }
            : { color: "#7C878E", weight: 1, fillColor: "#C9CED3", fillOpacity: 0.7 };
        }}
      />
      {stations.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={5}
          pathOptions={{ color: LINE_COLORS[s.lines[0]], fillOpacity: 1 }}
        />
      ))}
      {restaurants.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={8} pathOptions={{ color: "#14181C", fillColor: "#fff", fillOpacity: 1 }}>
          {/* TODO(Person 1): replace with Popup linking to /restaurant/[id], plus filters */}
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
