"use client";
// "+95 for you": what a check-in here would earn this player, with the reason in words.
import { usePointsContext, previewFor } from "@/components/map/usePointsPreview";
import type { LineId } from "@/lib/types";

export function reasonText(p: ReturnType<typeof previewFor>): string {
  const bits: string[] = [];
  if (p.inHome) bits.push("home neighborhood, half base");
  else if (p.multiplier > 1) bits.push(`×${p.multiplier} for ${p.stopsFromHome} stops from home`);
  if (p.newNeighborhood) bits.push("new neighborhood");
  if (p.newLine) bits.push("new line");
  return bits.join(", ");
}

export default function PointsChip({
  neighborhood,
  nearestStopId,
  isChain,
  lines,
}: {
  neighborhood: string;
  nearestStopId: string;
  isChain: boolean;
  lines: LineId[];
}) {
  const ctx = usePointsContext();
  if (!ctx) return null;
  const p = previewFor(ctx, { neighborhood, nearestStopId, isChain, nearestStation: { lines } });
  const why = reasonText(p);
  return (
    <li className="inline-flex min-h-[32px] items-center rounded-full bg-ink px-3 text-[14px] font-extrabold text-signal">
      <span>+{p.total} for you</span>
      {why && <span className="ml-2 hidden text-[12px] font-semibold text-white/80 min-[400px]:inline">{why}</span>}
      <span className="sr-only">. {why}</span>
    </li>
  );
}
