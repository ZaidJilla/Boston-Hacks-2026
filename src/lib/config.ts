export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const LINE_COLORS = {
  red: "#DA291C",
  orange: "#ED8B00",
  green: "#00843D",
  blue: "#003DA5",
  silver: "#7C878E",
} as const;

export const BOSTON_CENTER: [number, number] = [42.3601, -71.0589];
export const DEFAULT_ORIGIN = { lat: 42.3398, lng: -71.0892 }; // Northeastern
