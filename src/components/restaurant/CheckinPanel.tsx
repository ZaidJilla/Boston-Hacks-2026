"use client";
// Sticky check-in bar: geolocation + receipt photo (real), or "Simulate check-in" in demo mode.
// "Check in" asks for the receipt photo first if there isn't one, then submits.
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";
import { DEMO_MODE } from "@/lib/config";
import { getClientAuth } from "@/lib/firebase";
import { CHECKIN_RADIUS_M } from "@/lib/scoring";
import type { CheckinResult } from "@/lib/types";
import UnlockScreen from "./UnlockScreen";

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

const prettyHood = (id: string) => id.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

export default function CheckinPanel({
  restaurantId,
  isChain,
  hoodId,
  hoodName,
}: {
  restaurantId: string;
  isChain: boolean;
  hoodId: string;
  hoodName: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(simulate: boolean, photo: File | null = receipt) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let extra: Record<string, unknown> = {};
      if (!simulate) {
        if (!photo) throw new Error("Add a photo of your receipt first.");
        const [pos, receiptBase64] = await Promise.all([getPosition(), photoToBase64(photo)]);
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
      setShowUnlock(Boolean(data.unlockedNeighborhood));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed.");
    }
    setBusy(false);
  }

  const closeUnlock = useCallback(() => setShowUnlock(false), []);

  return (
    <>
      <div className="sticky bottom-nav z-[900] -mx-4 space-y-2.5 border-t-2 border-ink bg-white px-4 pb-3 pt-3">
        <label htmlFor="receipt" className="sr-only">
          Receipt photo
        </label>
        <input
          ref={fileRef}
          id="receipt"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setReceipt(f);
            if (f) submit(false, f);
          }}
        />

        {error && (
          <p role="alert" className="text-[14px] font-bold text-line-red">
            {error}
          </p>
        )}
        {result && !result.unlockedNeighborhood && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-card bg-ink px-4 py-2.5 text-white">
            <span className="text-[15px] font-bold">
              Checked in{result.co2SavedKg > 0 && <> · {result.co2SavedKg} kg CO2 saved</>}
              {result.questCompleted && <> · {result.questCompleted} line quest done</>}
            </span>
            <span className="shrink-0 text-[20px] font-black text-signal">+{result.pointsEarned}</span>
          </div>
        )}
        {result?.txSignature && !DEMO_MODE && (
          <a
            className="hit-44 inline-block text-[14px] font-bold text-line-blue underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
            href={`https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`}
          >
            View check-in on Solana
          </a>
        )}
        {result?.unlockedNeighborhood && !showUnlock && (
          <button
            type="button"
            onClick={() => setShowUnlock(true)}
            className="w-full rounded-card bg-line-green px-4 py-2.5 text-left text-[15px] font-bold text-white"
          >
            Neighborhood unlocked · +{result.pointsEarned} points
          </button>
        )}
        {!error && !result && (
          <p className="text-[14px] text-muted">
            {receipt
              ? `Receipt: ${receipt.name}`
              : `Be within ${CHECKIN_RADIUS_M} m and add your receipt to check in.`}
          </p>
        )}

        <div className="flex gap-2.5">
          <Button
            disabled={busy}
            onClick={() => (receipt ? submit(false) : fileRef.current?.click())}
            className="flex-1 whitespace-nowrap !px-2 !text-[15px]"
          >
            {busy ? "Checking in…" : "Check in"}
          </Button>
          {DEMO_MODE && (
            <Button
              variant="dark"
              disabled={busy}
              onClick={() => submit(true)}
              className="flex-1 whitespace-nowrap !px-2 !text-[15px]"
            >
              Simulate check-in
            </Button>
          )}
        </div>
        {receipt && !busy && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="hit-44 text-[14px] font-bold text-line-blue underline underline-offset-2"
          >
            Use a different receipt
          </button>
        )}
      </div>

      {/* Portal: a fixed overlay must not pick up margins or stacking from the page layout. */}
      {result?.unlockedNeighborhood &&
        showUnlock &&
        createPortal(
          <UnlockScreen
            result={result}
            // a check-in only unlocks the restaurant's own neighborhood
            hoodName={result.unlockedNeighborhood === hoodId ? hoodName : prettyHood(result.unlockedNeighborhood)}
            isChain={isChain}
            onClose={closeUnlock}
          />,
          document.body,
        )}
    </>
  );
}
