"use client";
// Bottom card for a landmark or shopping place picked on the map.
import AddToTrip from "@/components/plan/AddToTrip";
import ArrivalBoard from "@/components/signage/ArrivalBoard";
import { LINE_ORDER } from "@/components/signage/LineBullet";
import LineBullet from "@/components/signage/LineBullet";
import { CloseIcon } from "@/components/signage/Icons";
import type { MapPlace } from "@/lib/geo";

const TYPE_LABEL: Record<MapPlace["type"], string> = { landmark: "Landmark", shopping: "Shopping", store: "Store" };

export default function PlaceCard({ p, unlocked, onClose }: { p: MapPlace; unlocked: boolean; onClose: () => void }) {
  const st = p.nearestStation;
  const what = p.subtype.replace(/^historic-/, "").replace(/_/g, " ");
  const line = LINE_ORDER.find((l) => st.lines.includes(l));
  return (
    <div className="overflow-hidden rounded-card bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2.5 text-white">
        <span className="eyebrow min-w-0 truncate text-[13px]">
          {p.neighborhoodName} · {unlocked ? "Unlocked" : "In fog"}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="hit-44 shrink-0 text-white">
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="max-h-[52vh] space-y-3 overflow-y-auto px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-3">
          {line && <LineBullet line={line} size={36} />}
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-black leading-tight tracking-[-0.5px]">{p.name}</p>
            <p className="text-[14px] capitalize leading-snug text-muted">
              {TYPE_LABEL[p.type]} · {what}
            </p>
            <p className="text-[14px] leading-snug text-muted">
              {st.name}, {st.walkMin} min walk
            </p>
          </div>
        </div>
        <ArrivalBoard stopId={st.id} stationName={st.name} limit={2} />
        {p.openingHours && <p className="text-[13px] text-muted">Hours: {p.openingHours}</p>}
        <AddToTrip itemKey={`p:${p.id}`} name={p.name} />
        {p.website && (
          <a
            href={p.website}
            target="_blank"
            rel="noreferrer"
            className="hit-44 inline-block text-[14px] font-bold text-line-blue underline underline-offset-2"
          >
            Open website
          </a>
        )}
      </div>
    </div>
  );
}
