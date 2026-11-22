// Everything a trip can stop at, searchable by name. Built once in the browser from the bundled data.
import { mapPlaces, neighborhoods, restaurants, stations } from "@/lib/geo";

export type ItemKind = "restaurant" | "landmark" | "shopping" | "station" | "neighborhood";

export interface SearchItem {
  key: string; // stable, used in share links
  name: string;
  sub: string;
  lat: number;
  lng: number;
  kind: ItemKind;
  openingHours?: string | null;
  /** Suggested minutes to spend. */
  dwellMin: number;
}

const DWELL: Record<ItemKind, number> = { restaurant: 60, landmark: 45, shopping: 60, station: 15, neighborhood: 30 };
const KIND_LABEL: Record<ItemKind, string> = { restaurant: "Food", landmark: "Landmark", shopping: "Shopping", station: "T stop", neighborhood: "Neighborhood" };

let cache: SearchItem[] | null = null;

export function allItems(): SearchItem[] {
  if (cache) return cache;
  const out: SearchItem[] = [];
  for (const n of neighborhoods.features)
    out.push({ key: `n:${n.properties.id}`, name: n.properties.name, sub: "Neighborhood", lat: n.properties.center[0], lng: n.properties.center[1], kind: "neighborhood", dwellMin: DWELL.neighborhood });
  for (const s of stations)
    if (s.lines.some((l) => l !== "silver"))
      out.push({ key: `s:${s.id}`, name: s.name, sub: `T stop · ${s.lines.join(", ")}`, lat: s.lat, lng: s.lng, kind: "station", dwellMin: DWELL.station });
  for (const p of mapPlaces) {
    if (p.type === "store") continue;
    const kind: ItemKind = p.type === "landmark" ? "landmark" : "shopping";
    out.push({ key: `p:${p.id}`, name: p.name, sub: `${KIND_LABEL[kind]} · ${p.neighborhoodName}`, lat: p.lat, lng: p.lng, kind, openingHours: p.openingHours, dwellMin: p.subtype === "museum" ? 90 : DWELL[kind] });
  }
  for (const r of restaurants)
    out.push({ key: `r:${r.id}`, name: r.name, sub: `${r.categoryLabel} · ${r.neighborhoodName}`, lat: r.lat, lng: r.lng, kind: "restaurant", openingHours: (r as { openingHours?: string | null }).openingHours, dwellMin: DWELL.restaurant });
  return (cache = out);
}

export const itemByKey = (key: string) => allItems().find((i) => i.key === key);

export function searchItems(query: string, limit = 8): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: [number, SearchItem][] = [];
  for (const it of allItems()) {
    const n = it.name.toLowerCase();
    const at = n.indexOf(q);
    if (at < 0) continue;
    const rank = at === 0 ? 0 : n[at - 1] === " " ? 1 : 2;
    scored.push([rank * 100 + (it.kind === "station" || it.kind === "neighborhood" ? 0 : 5) + Math.min(n.length, 60) / 10, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, it]) => it);
}
