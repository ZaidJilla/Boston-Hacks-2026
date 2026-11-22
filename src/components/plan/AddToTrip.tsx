"use client";
// "Add to trip" for any place card. Once added it becomes a link to the plan page.
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { addToDraft, MAX_DRAFT, removeFromDraft, useDraft } from "@/lib/tripDraft";

export default function AddToTrip({ itemKey, name }: { itemKey: string; name: string }) {
  const draft = useDraft();
  const inTrip = draft.includes(itemKey);
  const full = !inTrip && draft.length >= MAX_DRAFT;

  if (inTrip)
    return (
      <div className="flex flex-wrap items-center gap-x-4 text-[14px]" role="status">
        <span className="font-extrabold text-line-green">In your trip ({draft.length})</span>
        <Link href="/plan" className="hit-44 font-bold text-line-blue underline underline-offset-2">
          Open trip
        </Link>
        <button
          type="button"
          onClick={() => removeFromDraft(itemKey)}
          aria-label={`Remove ${name} from your trip`}
          className="hit-44 font-bold text-muted underline underline-offset-2"
        >
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
      className={`${buttonClass("outline")} w-full`}
    >
      {full ? "Trip is full" : "Add to trip"}
    </button>
  );
}
