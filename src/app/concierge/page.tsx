"use client";
import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { ConciergeReply } from "@/lib/agent";

export default function ConciergePage() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState<ConciergeReply | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/concierge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
    setReply(await res.json());
    setBusy(false);
  }

  // TODO(Person 3): chat history, streaming, route/arrival chips per pick.
  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Concierge</h1>
      <form onSubmit={ask} className="space-y-2">
        <label htmlFor="q" className="text-sm text-ink/70">What are you craving?</label>
        <input id="q" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Cheap ramen near the Green Line" className="w-full rounded-lg border border-black/20 p-3" />
        <Button disabled={busy || !prompt}>Ask</Button>
      </form>
      {reply && (
        <div role="status" className="space-y-2">
          <p>{reply.message}</p>
          {reply.picks.map((r) => (
            <Link key={r.id} href={`/restaurant/${r.id}`} className="block rounded-lg bg-white p-3">{r.name} · {"$".repeat(r.price)}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
