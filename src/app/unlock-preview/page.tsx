"use client";
// TEMPORARY: previews the unlock animation without making a check-in. Not committed.
import { useState } from "react";
import UnlockScreen from "@/components/restaurant/UnlockScreen";

export default function Preview() {
  const [n, setN] = useState(0);
  return (
    <div className="p-4">
      <button className="rounded-full bg-ink px-5 py-3 text-white" onClick={() => setN((x) => x + 1)}>Replay</button>
      {n > 0 && (
        <UnlockScreen
          key={n}
          result={{ ok: true, pointsEarned: 65, totalPoints: 95, co2SavedKg: 1, unlockedNeighborhood: "allston" }}
          hoodName="Allston"
          isChain={false}
          onClose={() => setN(0)}
        />
      )}
    </div>
  );
}
