"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { DEMO_MODE } from "@/lib/config";
import { useUser } from "@/lib/auth";
import type { CheckinResult } from "@/lib/types";

export default function CheckinPanel({ restaurantId }: { restaurantId: string }) {
  const { user } = useUser();
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkIn(simulate: boolean) {
    setBusy(true);
    // TODO(Person 3): real flow = geolocation + receipt upload (base64) when !simulate.
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, simulate, uid: user?.uid, college: user?.college, displayName: user?.displayName }),
    });
    setResult(await res.json());
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <Button disabled={busy} onClick={() => checkIn(false)}>Check in</Button>
      {DEMO_MODE && (
        <Button disabled={busy} className="bg-ink" onClick={() => checkIn(true)}>Simulate check-in</Button>
      )}
      {result && (
        <p role="status" className="rounded-lg bg-white p-3">
          {result.ok
            ? `+${result.pointsEarned} points${result.unlockedNeighborhood ? ` · Unlocked ${result.unlockedNeighborhood}!` : ""}`
            : result.error}
        </p>
      )}
    </div>
  );
}
