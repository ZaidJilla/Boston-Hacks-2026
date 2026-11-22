"use client";
/**
 * Detects a rank-up between visits to the map. Remembers the last rank this player saw (per uid,
 * in localStorage) and returns the new rank once when it goes up. A player's first visit only
 * records their rank; it doesn't celebrate it.
 */
import { useCallback, useEffect, useState } from "react";
import { rankFor, rankIndex, type Rank, type RankId } from "@/lib/scoring";

const keyFor = (uid: string) => `rank-seen:${uid}`;

function read(uid: string): RankId | null {
  try {
    return localStorage.getItem(keyFor(uid)) as RankId | null;
  } catch {
    return null;
  }
}

function write(uid: string, id: RankId) {
  try {
    localStorage.setItem(keyFor(uid), id);
  } catch {
    /* private mode etc: no celebration memory, nothing else breaks */
  }
}

export function useRankUp(uid: string | null, points: number, loaded: boolean) {
  const [rankUp, setRankUp] = useState<Rank | null>(null);

  useEffect(() => {
    if (!loaded || !uid) return;
    const now = rankFor(points);
    const seen = read(uid);
    if (seen === null || rankIndex(seen) < 0) {
      write(uid, now.id); // first visit: just remember
      return;
    }
    if (rankIndex(now.id) > rankIndex(seen)) setRankUp(now);
    write(uid, now.id); // also records rank drops (e.g. a new season), so the next climb shows
  }, [uid, points, loaded]);

  const dismiss = useCallback(() => setRankUp(null), []);
  return { rankUp, dismiss };
}
