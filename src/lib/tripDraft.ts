"use client";
// The stops a person has collected for their trip, kept in this browser so the concierge, the map
// and the plan page share one list. Keys are the ones the plan page searches by (r:..., p:..., s:..., n:...).
import { useEffect, useState } from "react";

const STORAGE_KEY = "chewchoo.tripDraft";
export const MAX_DRAFT = 6;
const EVENT = "chewchoo:tripdraft";

export function readDraft(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_DRAFT) : [];
  } catch {
    return [];
  }
}

export function writeDraft(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(keys)].slice(0, MAX_DRAFT)));
  } catch {
    /* private mode or storage full: the draft just doesn't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToDraft(key: string): "added" | "exists" | "full" {
  const cur = readDraft();
  if (cur.includes(key)) return "exists";
  if (cur.length >= MAX_DRAFT) return "full";
  writeDraft([...cur, key]);
  return "added";
}

export function removeFromDraft(key: string) {
  writeDraft(readDraft().filter((k) => k !== key));
}

/** The current draft, kept in sync across components and tabs. Empty on the server and first paint. */
export function useDraft(): string[] {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setKeys(readDraft());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return keys;
}
