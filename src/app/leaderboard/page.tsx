import { citywide } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await citywide();
  // TODO(Person 4): Citywide / College / Neighborhood tabs, highlight current user.
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Leaderboard</h1>
      <ol className="mt-4 space-y-2">
        {rows.length === 0 && <li className="text-ink/60">No players yet. Run npm run data:seed.</li>}
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between rounded-lg bg-white p-3">
            <span>{i + 1}. {r.name} <span className="text-ink/50">{r.college}</span></span>
            <span className="font-semibold">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
