"use client";

import {
  activeFilterCount,
  cravings,
  DEFAULT_FILTERS,
  LINE_ORDER,
  lineColor,
  neighborhoods,
  type LineId,
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

const LINE_LABEL: Record<LineId, string> = { red: "Red", orange: "Orange", green: "Green", blue: "Blue", silver: "Silver" };

const hoodOptions = [...neighborhoods.features]
  .map((f) => f.properties)
  .sort((a, b) => a.name.localeCompare(b.name));

function Chip({
  active,
  onClick,
  children,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={active && activeColor ? { background: activeColor, borderColor: activeColor } : undefined}
      className={`min-h-[44px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        active ? "border-ink bg-ink text-white" : "border-black/20 bg-white text-ink active:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60">{title}</h3>
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
    // sits on top of the app's bottom nav (h-14)
    <div
      className={`fixed inset-x-0 bottom-14 z-[1001] mx-auto flex max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(20,24,28,0.18)] transition-[max-height] duration-300 ${
        open ? "max-h-[calc(100dvh-8rem)]" : "max-h-[92px]"
      }`}
    >
      {/* Handle + summary: the whole row toggles the sheet */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full flex-col items-center px-5 pb-3 pt-2"
      >
        <span className="mb-2 h-1.5 w-10 rounded-full bg-black/20" />
        <span className="flex w-full items-center justify-between">
          <span className="text-left">
            <span className="block text-base font-bold text-ink">
              {resultCount} {resultCount === 1 ? "spot" : "spots"}
            </span>
            <span className="block text-xs text-ink/60">
              {count ? `${count} filter${count > 1 ? "s" : ""} on` : "What are you craving?"}
            </span>
          </span>
          <span className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white">
            {open ? "Done" : "Filters"}
            {!open && count > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line-red text-[11px]">{count}</span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4">
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
                  <span className="ml-1 text-xs opacity-70">{p === 1 ? "under $15" : p === 2 ? "$15–30" : "$30+"}</span>
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
                Area
              </Chip>
            </div>

            {loc.kind === "near" && (
              <div className="flex gap-2">
                {RADII.map((r) => (
                  <Chip key={r.m} active={loc.radiusM === r.m} onClick={() => onNearMe(r.m)}>
                    {r.label} walk
                  </Chip>
                ))}
              </div>
            )}
            {locateError && (
              <p role="alert" className="text-sm text-line-red">
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
                  className="min-h-[44px] w-full rounded-xl border border-black/20 bg-white px-3 text-base"
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

          <Section title="T line">
            <div className="flex flex-wrap gap-2">
              {LINE_ORDER.map((l) => (
                <Chip
                  key={l}
                  active={filters.lines.includes(l)}
                  activeColor={lineColor(l)}
                  onClick={() => onChange({ ...filters, lines: toggle(filters.lines, l) })}
                >
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ background: filters.lines.includes(l) ? "#fff" : lineColor(l) }}
                  />
                  {LINE_LABEL[l]}
                </Chip>
              ))}
            </div>
          </Section>

          <label className="flex min-h-[44px] items-center justify-between rounded-xl bg-paper px-3">
            <span className="text-sm font-medium text-ink">Local spots only (hide chains)</span>
            <input
              type="checkbox"
              checked={filters.hideChains}
              onChange={(e) => onChange({ ...filters, hideChains: e.target.checked })}
              className="h-5 w-5 accent-ink"
            />
          </label>
        </div>
      )}

      {open && (
        <div className="flex gap-2 border-t border-black/5 bg-white px-5 pb-3 pt-3">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="min-h-[48px] flex-1 rounded-2xl border border-black/20 text-sm font-semibold text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[48px] flex-[2] rounded-2xl bg-line-blue text-sm font-semibold text-white"
          >
            Show {resultCount} spots
          </button>
        </div>
      )}
    </div>
  );
}
