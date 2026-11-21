import { notFound } from "next/navigation";
import { getRestaurant, getStation } from "@/lib/data";
import CheckinPanel from "@/components/restaurant/CheckinPanel";

export default function RestaurantPage({ params }: { params: { id: string } }) {
  const r = getRestaurant(params.id);
  if (!r) notFound();
  const station = getStation(r.nearestStopId);
  // TODO(Person 3): live arrivals (poll /api/predictions), "Get there" route, line chips.
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">{r.name}</h1>
      <p className="text-ink/70">
        {r.craving} · {"$".repeat(r.price)} · {r.isChain ? "Chain" : "Independent"}
      </p>
      <p>Nearest stop: {station?.name ?? "Unknown"}</p>
      <CheckinPanel restaurantId={r.id} />
    </div>
  );
}
