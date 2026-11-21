"use client";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the whole map screen is client-only.
const MapLoader = dynamic(() => import("./MapScreen"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-x-0 bottom-14 top-0 flex items-center justify-center bg-fog text-sm text-ink/60">
      Loading the map…
    </div>
  ),
});

export default MapLoader;
