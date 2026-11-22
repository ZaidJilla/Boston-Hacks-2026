import Link from "next/link";
import { Podium, Rows } from "@/components/leaderboard/Board";
import PageHeader from "@/components/signage/PageHeader";
import { TrophyIcon } from "@/components/signage/Icons";
import { chipClass } from "@/components/ui/Button";
import { neighborhoods } from "@/lib/geo";
import { byCollege, byNeighborhood, citywide, collegeStandings, withRanks } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "citywide", label: "Citywide" },
  { id: "college", label: "Colleges" },
  { id: "hood", label: "Neighborhoods" },
] as const;

const hoods = [...neighborhoods.features].map((f) => f.properties).sort((a, b) => a.name.localeCompare(b.name));
const DEFAULT_HOOD = "fenway";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { tab?: string; college?: string; hood?: string };
}) {
  const tab = TABS.find((t) => t.id === searchParams.tab)?.id ?? "citywide";
  const hood = hoods.find((h) => h.id === searchParams.hood)?.id ?? DEFAULT_HOOD;
  const college = searchParams.college;

  // One board per tab. Colleges show standings first; tap a college to see its players.
  let rows;
  let unit = "pts";
  let title = "Citywide";
  if (tab === "college" && !college) {
    rows = await collegeStandings();
    title = "College standings";
  } else if (tab === "college" && college) {
    rows = await byCollege(college);
    title = college;
  } else if (tab === "hood") {
    rows = await byNeighborhood(hood);
    unit = "spots";
    title = hoods.find((h) => h.id === hood)?.name ?? "Neighborhood";
  } else {
    rows = await citywide();
  }
  if (!(tab === "college" && !college)) rows = await withRanks(rows);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="pb-6">
      <PageHeader
        eyebrow="Leaderboard"
        title={title}
        subtitle={
          tab === "hood"
            ? "Most restaurants visited in this neighborhood"
            : tab === "college" && !college
              ? "Tap a college to see its players"
              : "Points from check-ins, neighborhoods and line quests"
        }
        leading={
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-signal text-ink">
            <TrophyIcon size={24} />
          </span>
        }
      >
        <nav aria-label="Leaderboard views" className="mt-4 flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/leaderboard?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-full px-2 text-[14px] font-extrabold ${
                tab === t.id ? "bg-signal text-ink" : "bg-white text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Podium rows={top} unit={unit} />
      </PageHeader>

      {tab === "college" && college && (
        <p className="px-4 pt-4">
          <Link href="/leaderboard?tab=college" className="hit-44 text-[15px] font-bold text-line-blue underline underline-offset-2">
            All colleges
          </Link>
        </p>
      )}

      {tab === "hood" && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Neighborhood">
          {hoods.map((h) => (
            <Link
              key={h.id}
              href={`/leaderboard?tab=hood&hood=${h.id}`}
              aria-current={hood === h.id ? "page" : undefined}
              className={chipClass(hood === h.id)}
            >
              {h.name}
            </Link>
          ))}
        </div>
      )}

      <div className="px-4 pt-4">
        {rows.length === 0 ? (
          <div className="rounded-card border-2 border-hairline bg-panel p-5 text-center">
            <p className="text-[18px] font-black tracking-[-0.5px]">No players here yet</p>
            <p className="mt-1 text-[15px] text-muted">
              {tab === "hood" ? "Be the first to eat in this neighborhood." : "Check in at a restaurant to get on the board."}
            </p>
            <Link href="/" className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-ink px-5 text-[15px] font-extrabold text-white">
              Open the map
            </Link>
          </div>
        ) : rest.length > 0 ? (
          <Rows rows={rest} unit={unit} startAt={4} linkToCollege={tab === "college" && !college} />
        ) : (
          <p className="text-[15px] text-muted">That&rsquo;s everyone so far.</p>
        )}
      </div>
    </div>
  );
}
