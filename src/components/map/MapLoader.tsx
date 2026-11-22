"use client";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so the whole map screen is client-only.
const MapLoader = dynamic(() => import("./MapScreen"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-x-0 bottom-nav top-0 flex items-center justify-center bg-fog text-[15px] font-bold text-muted">
      Loading the map…
    </div>
  ),
});

export default MapLoader;
