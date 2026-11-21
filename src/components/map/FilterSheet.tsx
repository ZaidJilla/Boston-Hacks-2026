"use client";

import {
  activeFilterCount,
  cravings,
  DEFAULT_FILTERS,
  neighborhoods,
  type PriceTier,
  type RestaurantFilters,
} from "@/lib/geo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: RestaurantFilters;
  onChange: (f: RestaurantFilters) => void;
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

const hoodOptions = [...neighborhoods.features]
  .map((f) => f.properties)
  .sort((a, b) => a.name.localeCompare(b.name));

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 active:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

export default function FilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  resultCount,
  unlocked,
  onNearMe,
  locating,
  locateError,
}: Props) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = activeFilterCount(filters);
  const loc = filters.location;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[1000] mx-auto flex max-w-md flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.18)] transition-[max-height] duration-300 ${
        open ? "max-h-[78dvh]" : "max-h-[92px]"
      }`}
    >
      {/* Handle + summary: the whole row toggles the sheet */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full flex-col items-center px-5 pb-3 pt-2"
      >
        <span className="mb-2 h-1.5 w-10 rounded-full bg-slate-300" />
        <span className="flex w-full items-center justify-between">
          <span className="text-left">
            <span className="block text-base font-bold text-slate-900">
              {resultCount} {resultCount === 1 ? "spot" : "spots"}
            </span>
            <span className="block text-xs text-slate-500">
              {count ? `${count} filter${count > 1 ? "s" : ""} on` : "What are you craving?"}
            </span>
          </span>
          <span className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white">
            {open ? "Done" : "Filters"}
            {!open && count > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px]">{count}</span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <Section title="Craving">
            <div className="flex flex-wrap gap-2">
              {cravings.map((c) => (
                <Chip
                  key={c.id}
                  active={filters.cravings.includes(c.id)}
                  onClick={() => onChange({ ...filters, cravings: toggle(filters.cravings, c.id) })}
                >
                  <span className="mr-1">{c.emoji}</span>
                  {c.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Budget">
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as PriceTier[]).map((p) => (
                <Chip
                  key={p}
                  active={filters.prices.includes(p)}
                  onClick={() => onChange({ ...filters, prices: toggle(filters.prices, p) })}
                >
                  {"$".repeat(p)}
                  <span className="ml-1 text-xs opacity-70">{p === 1 ? "<$15" : p === 2 ? "$15–30" : "$30+"}</span>
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Location">
            <div className="grid grid-cols-3 gap-2">
              <Chip active={loc.kind === "anywhere"} onClick={() => onChange({ ...filters, location: { kind: "anywhere" } })}>
                Anywhere
              </Chip>
              <Chip active={loc.kind === "near"} onClick={() => onNearMe(loc.kind === "near" ? loc.radiusM : 800)}>
                {locating ? "Locating…" : "📍 Near me"}
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
                Area
              </Chip>
            </div>

            {loc.kind === "near" && (
              <div className="flex gap-2">
                {RADII.map((r) => (
                  <Chip key={r.m} active={loc.radiusM === r.m} onClick={() => onNearMe(r.m)}>
                    🚶 {r.label}
                  </Chip>
                ))}
              </div>
            )}
            {locateError && <p className="text-sm text-rose-600">{locateError}</p>}

            {loc.kind === "neighborhood" && (
              <select
                value={loc.id}
                onChange={(e) => onChange({ ...filters, location: { kind: "neighborhood", id: e.target.value } })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
              >
                {hoodOptions.map((h) => (
                  <option key={h.id} value={h.id}>
                    {unlocked.has(h.id) ? "✓ " : "🌫️ "}
                    {h.name}
                  </option>
                ))}
              </select>
            )}
          </Section>

          <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-slate-50 px-3">
            <span className="text-sm font-medium text-slate-700">Local spots only (hide chains)</span>
            <input
              type="checkbox"
              checked={filters.hideChains}
              onChange={(e) => onChange({ ...filters, hideChains: e.target.checked })}
              className="h-5 w-5 accent-slate-900"
            />
          </label>

          <div className="sticky bottom-0 -mx-5 flex gap-2 bg-white px-5 pt-2">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="min-h-[48px] flex-1 rounded-2xl border border-slate-300 text-sm font-semibold text-slate-700"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-[48px] flex-[2] rounded-2xl bg-rose-600 text-sm font-semibold text-white"
            >
              Show {resultCount} spots
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
