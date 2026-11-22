"use client";
// Type to find a place, pick it. Optionally offers "Use my location".
import { useEffect, useId, useRef, useState } from "react";
import { searchItems, type SearchItem } from "./searchItems";

export interface UiPlace {
  key?: string;
  name: string;
  lat: number;
  lng: number;
  dwellMin: number;
  openingHours?: string | null;
}

export const toUiPlace = (i: SearchItem): UiPlace => ({ key: i.key, name: i.name, lat: i.lat, lng: i.lng, dwellMin: i.dwellMin, openingHours: i.openingHours });

export default function PlacePicker({
  label,
  placeholder,
  value,
  onPick,
  onClear,
  allowLocation,
  hideLabel,
}: {
  label: string;
  placeholder: string;
  value: UiPlace | null;
  onPick: (p: UiPlace) => void;
  onClear?: () => void;
  allowLocation?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const results = searchItems(q);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (p: UiPlace) => { onPick(p); setQ(""); setOpen(false); setLocError(null); };

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setLocError("Location isn't available on this device.");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); pick({ name: "My location", lat: p.coords.latitude, lng: p.coords.longitude, dwellMin: 0 }); },
      (err) => { setLocating(false); setLocError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't find you."); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div ref={box} className="relative">
      {!hideLabel && <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/60">{label}</label>}
      {value ? (
        <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-black/15 bg-white px-3">
          <span className="min-w-0 truncate text-sm font-medium">{value.name}</span>
          {onClear && (
            <button type="button" onClick={onClear} aria-label={`Change ${label.toLowerCase()}`} className="shrink-0 text-sm text-line-blue underline">
              Change
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            id={id}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { e.preventDefault(); pick({ key: results[0].key, name: results[0].name, lat: results[0].lat, lng: results[0].lng, dwellMin: results[0].dwellMin, openingHours: results[0].openingHours }); } if (e.key === "Escape") setOpen(false); }}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={`${id}-list`}
            className="min-h-[44px] w-full rounded-lg border border-black/20 bg-white px-3 text-sm"
          />
          {allowLocation && (
            <button type="button" onClick={useMyLocation} disabled={locating} className="mt-1 min-h-[44px] text-sm text-line-blue underline disabled:opacity-50">
              {locating ? "Finding you…" : "Use my location"}
            </button>
          )}
          {locError && <p role="alert" className="text-xs text-line-red">{locError}</p>}
          {open && results.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg">
              {results.map((r) => (
                <li key={r.key} role="option" aria-selected={false}>
                  <button type="button" onClick={() => pick(toUiPlace(r))} className="flex min-h-[44px] w-full flex-col items-start justify-center px-3 py-1.5 text-left active:bg-black/5">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-xs text-ink/60">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {open && q.trim().length >= 2 && results.length === 0 && (
            <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-black/10 bg-white p-3 text-sm text-ink/60 shadow-lg">No match. Try a station or neighborhood.</p>
          )}
        </>
      )}
    </div>
  );
}
