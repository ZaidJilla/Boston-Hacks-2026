export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** The app's name (chewchoo.co). Used for the page title and the map header; rename here only. */
export const APP_NAME = "ChewChoo";

export const LINE_COLORS = {
  red: "#DA291C",
  orange: "#ED8B00",
  green: "#00843D",
  blue: "#003DA5",
  silver: "#7C878E",
} as const;

/**
 * Outline and name tag of a neighborhood you have unlocked. MBTA Commuter Rail purple: it can't be
 * mistaken for a subway line, unlike the T green it replaced (that clashed with the Green Line).
 */
export const UNLOCKED_COLOR = "#80276C";

export const BOSTON_CENTER: [number, number] = [42.3601, -71.0589];
export const DEFAULT_ORIGIN = { lat: 42.3398, lng: -71.0892 }; // Northeastern

// Server only. Override with GEMINI_MODEL in .env.local.
// gemini-2.0 and 2.5 are closed to new keys. The bigger 3.x flash models are slow (20 s+) or
// overloaded, so we default to the lite model (about 1 s).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
