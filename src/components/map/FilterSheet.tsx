"use client";

import { useEffect, useRef } from "react";
import { buttonClass, chipClass } from "@/components/ui/Button";
import { lineTextColor } from "@/components/signage/LineBullet";
import {
  cravings,
  DEFAULT_FILTERS,
  LINE_ORDER,
  lineColor,
  neighborhoods,
  type LineId,
  type PriceTier,
  type RestaurantFilters,
} from "@/lib/geo";

export type FilterSection = "show" | "craving" | "price" | "line";

export type SheetLayer = "food" | "landmark" | "shopping";
const LAYERS: { id: SheetLayer; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "landmark", label: "Landmarks" },
  { id: "shopping", label: "Shopping" },
];

interface Props {
  open: boolean;
  /** section to scroll to when the sheet opens */
  focusSection: FilterSection;
  onClose: () => void;
  filters: RestaurantFilters;
  onChange: (f: RestaurantFilters) => void;
  /** Which kinds of places are on the map. */
  layers: Set<SheetLayer>;
  onLayersChange: (next: Set<SheetLayer>) => void;
  resultCount: number;
  unlocked: Set<string>;
  onNearMe: (radiusM: number) => void;
  locating: boolean;
  locateError: string | null;
}

const RADII = [
  { m: 400, label: "5 min" },
  { m: 800, label: "10 min" },
  { m: 1200, label: "15 min" },
];

const LINE_LABEL: Record<LineId, string> = { red: "Red", orange: "Orange", green: "Green", blue: "Blue", silver: "Silver" };

const hoodOptions = [...neighborhoods.features]
  .map((f) => f.properties)
  .sort((a, b) => a.name.localeCompare(b.name));

function Chip({
  active,
  onClick,
  children,
  activeColor,
  activeText,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
  activeText?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={active && activeColor ? { background: activeColor, borderColor: activeColor, color: activeText } : undefined}
      className={chipClass(active)}
    >
      {children}
    </button>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2.5" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="eyebrow text-muted">{title}</h3>
      {children}
    </section>
  );
}

export default function FilterSheet({
  open,
  focusSection,
  onClose,
  filters,
  onChange,
  layers,
  onLayersChange,
  resultCount,
  unlocked,
  onNearMe,
  locating,
  locateError,
}: Props) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const loc = filters.location;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Latest values without re-running the open effect on every filter change.
  const latest = useRef({ focusSection, onClose });
  latest.current = { focusSection, onClose };

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();
    document.getElementById(`filter-${latest.current.focusSection}`)?.scrollIntoView({ block: "start" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fade-in fixed inset-x-0 bottom-nav top-0 z-[1001] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-h"
        className="sheet-up fixed inset-x-0 bottom-nav z-[1002] mx-auto flex max-h-[calc(100dvh-140px)] max-w-md flex-col overflow-hidden rounded-t-sheet bg-white shadow-card"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 id="filters-h" ref={headingRef} tabIndex={-1} className="text-[22px] font-black tracking-[-0.5px]">
            Filters
          </h2>
          <button type="button" onClick={onClose} className={chipClass(true)}>
            Done
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
          <Section id="filter-show" title="What to show">
            <div className="flex flex-wrap gap-2.5">
              {LAYERS.map((l) => (
                <Chip
                  key={l.id}
                  active={layers.has(l.id)}
                  onClick={() => {
                    const next = new Set(layers);
                    if (next.has(l.id)) next.delete(l.id);
                    else next.add(l.id);
                    onLayersChange(next);
                  }}
                >
                  {l.label}
                </Chip>
              ))}
            </div>
            <p className="text-[13px] text-muted">Pick one or more. Opening a neighborhood shows everything inside it.</p>
          </Section>

          <Section id="filter-craving" title="Craving">
            {!layers.has("food") && <p className="text-[13px] text-muted">Turn on Food to filter by craving.</p>}
            <div className={`flex flex-wrap gap-2.5 ${layers.has("food") ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!layers.has("food")}>
              {cravings.map((c) => (
                <Chip
                  key={c.id}
                  active={filters.cravings.includes(c.id)}
                  onClick={() => onChange({ ...filters, cravings: toggle(filters.cravings, c.id) })}
                >
                  <span aria-hidden="true">{c.emoji}</span>
                  {c.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section id="filter-price" title="Budget">
            <div className="flex flex-wrap gap-2.5">
              {([1, 2, 3] as PriceTier[]).map((p) => (
                <Chip
                  key={p}
                  active={filters.prices.includes(p)}
                  onClick={() => onChange({ ...filters, prices: toggle(filters.prices, p) })}
                >
                  {"$".repeat(p)}
                  <span className="font-semibold">{p === 1 ? "under $15" : p === 2 ? "$15–30" : "$30+"}</span>
                </Chip>
              ))}
            </div>
          </Section>

          <Section id="filter-location" title="Location">
            <div className="flex flex-wrap gap-2.5">
              <Chip active={loc.kind === "anywhere"} onClick={() => onChange({ ...filters, location: { kind: "anywhere" } })}>
                Anywhere
              </Chip>
              <Chip active={loc.kind === "near"} onClick={() => onNearMe(loc.kind === "near" ? loc.radiusM : 800)}>
                {locating ? "Locating…" : "Near me"}
              </Chip>
              <Chip
                active={loc.kind === "neighborhood"}
                onClick={() =>
                  onChange({
                    ...filters,
                    location: { kind: "neighborhood", id: loc.kind === "neighborhood" ? loc.id : hoodOptions[0].id },
                  })
                }
              >
                Neighborhood
              </Chip>
            </div>

            {loc.kind === "near" && (
              <div className="flex flex-wrap gap-2.5">
                {RADII.map((r) => (
                  <Chip key={r.m} active={loc.radiusM === r.m} onClick={() => onNearMe(r.m)}>
                    {r.label} walk
                  </Chip>
                ))}
              </div>
            )}
            {locateError && (
              <p role="alert" className="text-[14px] font-semibold text-line-red">
                {locateError}
              </p>
            )}

            {loc.kind === "neighborhood" && (
              <>
                <label htmlFor="hood" className="sr-only">
                  Neighborhood
                </label>
                <select
                  id="hood"
                  value={loc.id}
                  onChange={(e) => onChange({ ...filters, location: { kind: "neighborhood", id: e.target.value } })}
                  className="min-h-[48px] w-full rounded-full border-2 border-ink bg-white px-4 text-[16px] font-semibold"
                >
                  {hoodOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {unlocked.has(h.id) ? " (unlocked)" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
          </Section>

          <Section id="filter-line" title="T line">
            <div className="flex flex-wrap gap-2.5">
              {LINE_ORDER.map((l) => {
                const on = filters.lines.includes(l);
                return (
                  <Chip
                    key={l}
                    active={on}
                    activeColor={lineColor(l)}
                    activeText={lineTextColor(l)}
                    onClick={() => onChange({ ...filters, lines: toggle(filters.lines, l) })}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: on ? lineTextColor(l) : lineColor(l) }}
                    />
                    {LINE_LABEL[l]}
                  </Chip>
                );
              })}
            </div>
          </Section>

          <label className="flex min-h-[48px] items-center justify-between gap-3 rounded-card bg-panel px-4">
            <span className="text-[15px] font-bold">Local spots only (hide chains)</span>
            <input
              type="checkbox"
              checked={filters.hideChains}
              onChange={(e) => onChange({ ...filters, hideChains: e.target.checked })}
              className="h-5 w-5 accent-ink"
            />
          </label>
        </div>

        <div className="flex gap-2.5 border-t-2 border-ink bg-white px-5 py-3">
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_FILTERS);
              onLayersChange(new Set<SheetLayer>(["food", "landmark", "shopping"]));
            }}
            className={`${buttonClass("outline")} flex-1 !px-3`}
          >
            Reset
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass("primary")} flex-[2] !px-3`}>
            Show {resultCount} {resultCount === 1 ? "spot" : "spots"}
          </button>
        </div>
      </div>
    </>
  );
}
