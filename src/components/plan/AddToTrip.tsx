"use client";
// "Add to trip" for any place card. Once added it becomes a link to the plan page.
import Link from "next/link";
import { addToDraft, MAX_DRAFT, removeFromDraft, useDraft } from "@/lib/tripDraft";

export default function AddToTrip({ itemKey, name }: { itemKey: string; name: string }) {
  const draft = useDraft();
  const inTrip = draft.includes(itemKey);
  const full = !inTrip && draft.length >= MAX_DRAFT;

  if (inTrip)
    return (
      <div className="flex items-center gap-3 text-sm" role="status">
        <span className="font-medium text-line-green">In your trip ({draft.length})</span>
        <Link href="/plan" className="font-medium text-line-blue underline">Open trip</Link>
        <button type="button" onClick={() => removeFromDraft(itemKey)} aria-label={`Remove ${name} from your trip`} className="min-h-[44px] text-ink/60 underline">
          Remove
        </button>
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => addToDraft(itemKey)}
      disabled={full}
      aria-label={`Add ${name} to your trip`}
      className="min-h-[44px] w-full rounded-lg border border-black/20 bg-white text-sm font-semibold disabled:opacity-50"
    >
      {full ? "Trip is full" : "Add to trip"}
    </button>
  );
}
