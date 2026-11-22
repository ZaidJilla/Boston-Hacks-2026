// A rank as an actual badge: a shield in the rank's color with its emblem, stars for how high it is,
// and the rank name on a ribbon. Shown on the rank-up screen, the profile and the map strip.
import { RANKS, type RankId } from "@/lib/scoring";
import { RANK_COLORS } from "./RankBadge";

export const RANK_EMBLEM: Record<RankId, string> = { visitor: "🎒", regular: "🎟️", local: "🏠", legend: "👑" };

export default function RankMedallion({ rankId, size = 132, ribbon = true }: { rankId: RankId; size?: number; ribbon?: boolean }) {
  const n = RANKS.findIndex((r) => r.id === rankId) + 1;
  const name = RANKS[n - 1].name;
  const color = RANK_COLORS[rankId];
  return (
    <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={`${name} rank badge`} className="shrink-0 overflow-visible">
      <path d="M66 4 L116 20 V62 C116 90 94 108 66 120 C38 108 16 90 16 62 V20 Z" fill={color} stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
      <path d="M66 17 L104 29 V62 C104 83 88 97 66 107 C44 97 28 83 28 62 V29 Z" fill="#fff" fillOpacity="0.18" />
      <text x="66" y="68" textAnchor="middle" fontSize="40">{RANK_EMBLEM[rankId]}</text>
      {Array.from({ length: n }, (_, i) => (
        <text key={i} x={66 + (i - (n - 1) / 2) * 15} y="40" textAnchor="middle" fontSize="13" fill="#fff">★</text>
      ))}
      {ribbon && (
        <g>
          <rect x="22" y="92" width="88" height="22" rx="11" fill="#fff" stroke={color} strokeWidth="3" />
          <text x="66" y="108" textAnchor="middle" fontSize="13" fontWeight="900" fill="#000" letterSpacing="1">{name.toUpperCase()}</text>
        </g>
      )}
    </svg>
  );
}
