"use client";
// Preview of the placeholder rank-up screen: /rank-up?to=local (visitor | regular | local | legend).
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import RankUpScreen from "@/components/rank/RankUpScreen";
import { RANKS } from "@/lib/scoring";

function Preview() {
  const router = useRouter();
  const to = useSearchParams().get("to");
  const rank = RANKS.find((r) => r.id === to) ?? RANKS[1];
  return <RankUpScreen rank={rank} points={rank.minPoints} onClose={() => router.push("/")} />;
}

export default function RankUpPreviewPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
