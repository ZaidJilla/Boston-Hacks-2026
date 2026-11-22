// A neighborhood title as a round coin in the neighborhood purple, so it never looks like the overall rank
// (a T-colored shield). Wanderer, Neighbor and Insider deepen in color; the Mayor's coin is gold-ringed.
import { UNLOCKED_COLOR } from "@/lib/config";
import type { HoodRankId } from "@/lib/scoring";

export const HOOD_EMBLEM: Record<HoodRankId, string> = { wanderer: "🚶", neighbor: "🏘️", insider: "🔑", mayor: "🏛️" };
const FILL: Record<HoodRankId, string> = { wanderer: "#B98AAE", neighbor: UNLOCKED_COLOR, insider: "#561A48", mayor: "#561A48" };

export default function HoodMedallion({ id, size = 32 }: { id: HoodRankId; size?: number }) {
  const mayor = id === "mayor";
  return (
    <span
      role="img"
      aria-label={`${id} in this neighborhood`}
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: FILL[id],
        fontSize: size * 0.5,
        border: `${Math.max(2, size / 12)}px solid ${mayor ? "#FFB81C" : "#fff"}`,
        boxShadow: mayor ? "0 0 0 2px #561A48, 0 0 10px #FFB81C99" : "0 0 0 2px " + FILL[id],
      }}
    >
      <span aria-hidden="true">{HOOD_EMBLEM[id]}</span>
    </span>
  );
}

/** The title as a small pill with its coin: for rows and chips. */
export function HoodTitlePill({ id, name }: { id: HoodRankId; name: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 px-1.5 py-0 text-[11px] font-black uppercase tracking-[0.4px]" style={{ borderColor: UNLOCKED_COLOR, color: id === "wanderer" ? "#6B2B5C" : UNLOCKED_COLOR }}>
      <span aria-hidden="true">{HOOD_EMBLEM[id]}</span>
      {name}
    </span>
  );
}
