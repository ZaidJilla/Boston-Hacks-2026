"use client";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-[calc(100vh-3.5rem)] bg-fog" />,
});

export default MapView;
