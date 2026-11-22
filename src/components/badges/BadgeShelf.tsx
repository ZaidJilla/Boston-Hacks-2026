// The badge shelf on the profile: earned badges in full color, locked ones greyed with how to earn them.
import { BADGES, earnedIds, type Facts } from "@/lib/badges";
import BadgeMedallion from "./BadgeMedallion";

export default function BadgeShelf({ facts }: { facts: Facts }) {
  const have = earnedIds(facts);
  // Earned first, in the order they're defined; then the ones still to get.
  const sorted = [...BADGES].sort((a, b) => Number(have.has(b.id)) - Number(have.has(a.id)));
  return (
    <section aria-labelledby="badges-h" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="badges-h" className="text-[20px] font-black leading-tight tracking-[-0.5px]">
          Badges
        </h2>
        <span className="text-[16px] font-black tabular-nums">
          {have.size} of {BADGES.length}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2.5">
        {sorted.map((b, i) => {
          const earned = have.has(b.id);
          return (
            <li
              key={b.id}
              className="unlock-rise flex flex-col items-center rounded-card border-2 border-hairline bg-white px-1.5 py-3 text-center"
              style={{ ["--d" as string]: `${Math.min(i, 12) * 0.03}s` }}
            >
              <BadgeMedallion emoji={b.emoji} color={b.color} earned={earned} />
              <p className={`mt-2 text-[13px] font-extrabold leading-tight ${earned ? "" : "text-muted"}`}>{b.name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{earned ? "Earned" : b.how}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
