"use client";
// Check-in: geolocation + receipt photo (real), or "Simulate check-in" in demo mode.
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { DEMO_MODE } from "@/lib/config";
import { getClientAuth } from "@/lib/firebase";
import type { CheckinResult } from "@/lib/types";

/** Downscale a photo to ~1280 px JPEG and return base64 without the data: prefix. */
async function photoToBase64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Allow location access to check in.")),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

const prettyHood = (id: string) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function CheckinPanel({ restaurantId }: { restaurantId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(simulate: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let extra: Record<string, unknown> = {};
      if (!simulate) {
        if (!receipt) throw new Error("Add a photo of your receipt first.");
        const [pos, receiptBase64] = await Promise.all([getPosition(), photoToBase64(receipt)]);
        extra = { ...pos, receiptBase64 };
      }
      const idToken = await getClientAuth()?.currentUser?.getIdToken();
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ restaurantId, simulate, ...extra }),
      });
      const data = (await res.json()) as CheckinResult;
      if (!data.ok) throw new Error(data.error ?? "Check-in failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white p-3 space-y-2">
        <label htmlFor="receipt" className="block text-sm font-medium">Receipt photo</label>
        <input
          ref={fileRef} id="receipt" type="file" accept="image/*" capture="environment"
          onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink/10 file:px-3 file:py-2"
        />
        {receipt && <p className="text-xs text-ink/60 truncate">{receipt.name}</p>}
        <Button disabled={busy} onClick={() => submit(false)} className="w-full">
          {busy ? "Checking in…" : "Check in"}
        </Button>
        <p className="text-xs text-ink/50">You need to be at the restaurant, and the receipt has to be from today.</p>
      </div>

      {DEMO_MODE && (
        <Button disabled={busy} onClick={() => submit(true)} className="w-full bg-ink">
          Simulate check-in
        </Button>
      )}

      {error && <p role="alert" className="rounded-lg bg-line-red/10 p-3 text-sm text-line-red">{error}</p>}

      {result && (
        <div role="status" className="space-y-2">
          {result.unlockedNeighborhood && (
            <div className="rounded-lg border-2 border-line-green bg-line-green/10 p-4 text-center">
              <p className="text-lg font-bold text-line-green">{prettyHood(result.unlockedNeighborhood)} unlocked</p>
              <p className="text-sm">The fog is gone. Badge minted on Solana.</p>
              {result.badgeMint && <p className="mt-1 break-all font-mono text-[10px] text-ink/50">{result.badgeMint}</p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Points earned" value={`+${result.pointsEarned}`} />
            <Stat label="Total" value={String(result.totalPoints)} />
            <Stat label="CO₂ saved" value={`${result.co2SavedKg} kg`} />
          </div>
          {result.questCompleted && <p className="text-sm font-semibold">Line quest complete: {result.questCompleted} line</p>}
          {result.txSignature && !DEMO_MODE && (
            <a className="block text-xs text-line-blue underline" target="_blank" rel="noreferrer"
               href={`https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`}>
              View check-in on Solana
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <p className="text-base font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-ink/60">{label}</p>
    </div>
  );
}
