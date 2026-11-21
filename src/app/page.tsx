"use client";


import dynamic from "next/dynamic";

// Leaflet touches `window`, so the whole map is client-only.
const MapScreen = dynamic(() => import("@/components/map/MapScreen"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-200 text-sm text-slate-500">
      Lifting the fog…
    </div>
  ),
});

export default function Home() {
  return <MapScreen />;
}
