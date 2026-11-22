import { LINE_COLORS } from "@/lib/config";
import type { RankId } from "@/lib/scoring";

// Ranks are progress, so they borrow the T palette: silver -> green -> blue -> red.
export const RANK_COLORS: Record<RankId, string> = {
  visitor: LINE_COLORS.silver,
  regular: LINE_COLORS.green,
  local: LINE_COLORS.blue,
  legend: LINE_COLORS.red,
};

export default function RankBadge({
  rank,
  size = "sm",
}: {
  rank: { id: RankId; name: string };
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold text-white ${
        size === "lg" ? "px-5 py-2 text-2xl" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{ background: RANK_COLORS[rank.id] }}
    >
      {rank.name}
    </span>
  );
}
