// Deterministic fake players. Used by `npm run data:seed` (Tiger Data) and by the in-memory
// store on first use (demo mode without DATABASE_URL), so both show the same leaderboard.
import { restaurants } from "./data";
import type { StoreUser } from "./store";
import type { Restaurant } from "./types";

export const SEED_UID_PREFIX = "seed-";

/** The signed-out demo player. Must match DEMO_USER in auth.tsx (client). */
export const DEMO_USER: StoreUser = {
  uid: "demo-user",
  displayName: "Demo Student",
  email: "demo@northeastern.edu",
  college: "Northeastern",
};

const COLLEGES = [
  { name: "Boston University", domain: "bu.edu" },
  { name: "Northeastern", domain: "northeastern.edu" },
  { name: "Tufts", domain: "tufts.edu" },
  { name: "MIT", domain: "mit.edu" },
  { name: "Harvard", domain: "harvard.edu" },
  { name: "Emerson", domain: "emerson.edu" },
];
const PLAYERS_PER_COLLEGE = 7; // 42 total
const HISTORY_DAYS = 14;
const MAX_VISITS = 15;

const FIRST = ["Ava", "Liam", "Maya", "Noah", "Priya", "Diego", "Zoe", "Omar", "Lena", "Kai", "Sofia", "Eli", "Hana", "Theo"];
const LAST = ["Chen", "Patel", "Garcia", "Kim", "Nguyen", "Okafor", "Silva", "Cohen", "Rossi", "Haddad", "Murphy", "Tran"];

export interface SeedVisit {
  restaurant: Restaurant;
  at: Date;
}
export interface SeedPlayer {
  user: StoreUser;
  visits: SeedVisit[]; // oldest first
}

/** mulberry32: tiny seeded PRNG so every run builds the same players. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeedPlayers(now = Date.now()): SeedPlayer[] {
  const rand = rng(2026);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const shuffled = <T>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const randomPastDate = () => new Date(now - rand() * HISTORY_DAYS * 86_400_000);

  const players: SeedPlayer[] = [];
  const usedNames = new Set<string>();
  for (const c of COLLEGES) {
    for (let i = 0; i < PLAYERS_PER_COLLEGE; i++) {
      let first: string, last: string;
      do {
        first = pick(FIRST);
        last = pick(LAST);
      } while (usedNames.has(first + last));
      usedNames.add(first + last);

      // rand()^2 skews low: a few power users, most casual. Good for a "climb" in the demo.
      const n = Math.floor(rand() ** 2 * (Math.min(restaurants.length, MAX_VISITS) + 1));
      const visits = shuffled(restaurants)
        .slice(0, n)
        .map((restaurant) => ({ restaurant, at: randomPastDate() }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      players.push({
        user: {
          uid: `${SEED_UID_PREFIX}${c.domain.split(".")[0]}-${i}`,
          displayName: `${first} ${last[0]}.`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${c.domain}`,
          college: c.name,
        },
        visits,
      });
    }
  }

  players.push({ user: DEMO_USER, visits: demoVisits(now) });
  return players;
}

/**
 * The demo player starts 2/3 of the way into the neighborhood with the most independent
 * restaurants, so ONE simulated check-in on stage triggers the unlock celebration.
 */
function demoVisits(now: number): SeedVisit[] {
  const byHood = new Map<string, Restaurant[]>();
  for (const r of restaurants) byHood.set(r.neighborhood, [...(byHood.get(r.neighborhood) ?? []), r]);
  const best = [...byHood.values()]
    .filter((rs) => rs.length >= 3)
    .sort((a, b) => b.filter((r) => !r.isChain).length - a.filter((r) => !r.isChain).length)[0];
  if (!best) return [];
  const ordered = [...best].sort((a, b) => Number(a.isChain) - Number(b.isChain)); // independents first
  return ordered.slice(0, 2).map((restaurant, i) => ({ restaurant, at: new Date(now - (2 - i) * 86_400_000) }));
}
