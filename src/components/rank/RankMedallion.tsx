// A big rank medallion for the rank-up screen: the rank's color, its number, and its name.
import { RANKS, type RankId } from "@/lib/scoring";
import { RANK_COLORS } from "./RankBadge";

export default function RankMedallion({ rankId }: { rankId: RankId }) {
  const n = RANKS.findIndex((r) => r.id === rankId) + 1;
  return (
    <div
      className="flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full border-8 border-white text-white shadow-card"
      style={{ background: RANK_COLORS[rankId] }}
      aria-hidden="true"
    >
      <span className="text-[13px] font-black tracking-[2px]">RANK</span>
      <span className="-mt-1 text-[64px] font-black leading-none tracking-[-2px]">{n}</span>
    </div>
  );
}
