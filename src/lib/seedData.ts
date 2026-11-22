// Deterministic fake players. Used by `npm run data:seed` (Tiger Data) and by the in-memory
// store on first use (demo mode without DATABASE_URL), so both show the same leaderboard.
import { restaurants } from "./data";
import type { StoreUser } from "./store";
import type { Restaurant } from "./types";

export const SEED_UID_PREFIX = "seed-";

// The signed-out demo player lives in demoUser.ts, small enough for the client bundle.
import { DEMO_USER } from "./demoUser";
export { DEMO_USER };

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
const MAX_UNLOCKS = 12; // the very top players are Legends (10+)

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

  const byHood = new Map<string, Restaurant[]>();
  for (const r of restaurants) byHood.set(r.neighborhood, [...(byHood.get(r.neighborhood) ?? []), r]);
  const hoodsWithFood = [...byHood.keys()].filter((h) => byHood.get(h)!.length >= 3).sort();

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

      // Players explore neighborhood by neighborhood, like the real game: 3 restaurants unlocks one, and
      // points follow from that, so rank and points agree. rand()^2.6 skews low: a few power users, most
      // casual. 0 unlocks = Visitor, 1+ = Regular, 4+ = Local, 10+ = Legend.
      const unlocks = Math.floor(rand() ** 2.6 * (MAX_UNLOCKS + 1));
      const hoods = shuffled(hoodsWithFood);
      const chosen: Restaurant[] = [];
      for (const h of hoods.slice(0, unlocks)) chosen.push(...shuffled(byHood.get(h)!).slice(0, 3));
      // Everyone has dipped a toe somewhere else: one or two visits that don't complete a neighborhood.
      const dip = hoods[unlocks];
      if (dip && (unlocks > 0 || rand() < 0.7)) chosen.push(...shuffled(byHood.get(dip)!).slice(0, 1 + Math.floor(rand() * 2)));
      const visits = chosen
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
 * The demo player is the Mayor of Allston (6 spots there, no seed player has more than 3), has a second
 * neighborhood open, and a third at 2 of 3, so the profile shows an overall rank AND neighborhood ranks,
 * and ONE simulated check-in on stage still triggers the unlock celebration.
 */
export const DEMO_HOME_TURF = "allston";

function demoVisits(now: number): SeedVisit[] {
  const byHood = new Map<string, Restaurant[]>();
  for (const r of restaurants) byHood.set(r.neighborhood, [...(byHood.get(r.neighborhood) ?? []), r]);
  const independentsFirst = (rs: Restaurant[]) => [...rs].sort((a, b) => Number(a.isChain) - Number(b.isChain));
  const others = [...byHood.entries()]
    .filter(([id, rs]) => id !== DEMO_HOME_TURF && rs.length >= 3)
    .sort((a, b) => b[1].filter((r) => !r.isChain).length - a[1].filter((r) => !r.isChain).length)
    .slice(0, 2)
    .map(([, rs]) => independentsFirst(rs));
  const picks: Restaurant[] = [
    ...independentsFirst(byHood.get(DEMO_HOME_TURF) ?? []).slice(0, 6),
    ...(others[0] ?? []).slice(0, 3),
    ...(others[1] ?? []).slice(0, 2),
  ];
  const day = 86_400_000;
  return picks.map((restaurant, i) => ({ restaurant, at: new Date(now - (picks.length - i) * day * 0.5) }));
}
