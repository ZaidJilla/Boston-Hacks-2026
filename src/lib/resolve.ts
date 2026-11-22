// Turn "Northeastern", "Park Street" or "Fenway" into coordinates. Plain TypeScript, no keys.
// The concierge uses it so a student can say "I'm at Kenmore, heading to Chinatown".
import { neighborhoods, stations } from "./geo";

export interface Resolved {
  lat: number;
  lng: number;
  label: string;
}

const ANCHORS: [RegExp, Resolved][] = [
  [/\bnortheastern\b|\bnu\b|\bhuntington\b/, { lat: 42.3398, lng: -71.0892, label: "Northeastern" }],
  [/\bboston university\b|\bbu\b/, { lat: 42.3505, lng: -71.1054, label: "Boston University" }],
  [/\bmit\b/, { lat: 42.3625, lng: -71.0862, label: "MIT" }],
  [/\bharvard\b/, { lat: 42.3736, lng: -71.119, label: "Harvard" }],
  [/\btufts\b/, { lat: 42.4075, lng: -71.119, label: "Tufts" }],
  [/\bemerson\b/, { lat: 42.3523, lng: -71.065, label: "Emerson" }],
  [/\bboston college\b|\bbc\b/, { lat: 42.3355, lng: -71.1685, label: "Boston College" }],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function resolveLocation(text: string | undefined): Resolved | null {
  const q = norm(text ?? "");
  if (!q) return null;
  for (const [re, r] of ANCHORS) if (re.test(q)) return r;
  const named = (name: string) => norm(name.replace(/\s+station$/i, ""));
  const stationHit =
    stations.find((s) => named(s.name) === q) ??
    stations.filter((s) => s.lines.some((l) => l !== "silver")).find((s) => q.includes(named(s.name)) && named(s.name).length > 3);
  if (stationHit) return { lat: stationHit.lat, lng: stationHit.lng, label: stationHit.name };
  const hood = neighborhoods.features.find((f) => norm(f.properties.name) === q || q.includes(norm(f.properties.name)));
  if (hood) return { lat: hood.properties.center[0], lng: hood.properties.center[1], label: hood.properties.name };
  return null;
}

/** "from X to Y", "I'm at X and want to go to Y", "X to Y". Returns null when it can't find two places. */
export function parseTrip(text: string): { from: Resolved; to: Resolved } | null {
  const t = text.replace(/[?.!]+$/g, "");
  const m =
    /\b(?:from|at|in|leaving)\s+(.+?)\s+(?:to|towards?|heading to|going to|and (?:i )?(?:want|need) to go to|and heading to)\s+(.+?)(?:\s+(?:but|and|with|i also|also|,)\b.*)?$/i.exec(t) ??
    /^(.+?)\s+to\s+(.+?)(?:\s+(?:but|and|with|i also|also)\b.*)?$/i.exec(t);
  if (!m) return null;
  const from = resolveLocation(m[1]);
  const to = resolveLocation(m[2]);
  return from && to ? { from, to } : null;
}
