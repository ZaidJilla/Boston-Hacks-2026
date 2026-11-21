// npm run data:seed — ~40 fake users across 6 colleges, with check-ins, unlocks and quests,
// so the leaderboards look alive in the demo. Deterministic: same output every run.
import { existsSync } from "node:fs";
import { Pool } from "pg";
import restaurants from "../data/restaurants.json";
import type { Restaurant } from "../src/lib/types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const COLLEGES = [
  { name: "Boston University", domain: "bu.edu" },
  { name: "Northeastern", domain: "northeastern.edu" },
  { name: "Tufts", domain: "tufts.edu" },
  { name: "MIT", domain: "mit.edu" },
  { name: "Harvard", domain: "harvard.edu" },
  { name: "Emerson", domain: "emerson.edu" },
];
const USERS_PER_COLLEGE = 7; // 42 total

const FIRST = ["Ava", "Liam", "Maya", "Noah", "Priya", "Diego", "Zoe", "Omar", "Lena", "Kai", "Sofia", "Eli"];
const LAST = ["Chen", "Patel", "Garcia", "Kim", "Nguyen", "Okafor", "Silva", "Cohen", "Rossi", "Haddad"];

/** Seeded PRNG (mulberry32) so the leaderboard doesn't reshuffle every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedUser {
  uid: string;
  displayName: string;
  email: string;
  college: string;
  visits: Restaurant[]; // restaurants this user "ate at"
}

function buildUsers(): SeedUser[] {
  const rand = rng(2026);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const all = restaurants as Restaurant[];
  const users: SeedUser[] = [];
  for (const c of COLLEGES) {
    for (let i = 0; i < USERS_PER_COLLEGE; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      // Skewed so a few users are high and most are mid/low: good for a "climb" demo.
      const n = Math.floor(rand() ** 2 * Math.min(all.length, 15));
      const visits = [...all].sort(() => rand() - 0.5).slice(0, n);
      users.push({
        uid: `seed-${c.domain.split(".")[0]}-${i}`,
        displayName: `${first} ${last[0]}.`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${c.domain}`,
        college: c.name,
        visits,
      });
    }
  }
  return users;
}

async function main() {
  const users = buildUsers();
  console.log(`Built ${users.length} seed users from ${(restaurants as Restaurant[]).length} restaurants.`);

  if (!process.env.DATABASE_URL) {
    // TODO(Raed): decide how demo mode without a DB gets these users. Option: export
    // buildUsers() and have store.ts replay them through memStore on first use.
    console.log("DATABASE_URL not set, nothing written.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    // TODO(Raed): in one transaction, for each user:
    //   1. INSERT INTO users ... ON CONFLICT (uid) DO NOTHING
    //   2. For each visit: first_visits + checkins row with created_at spread over the
    //      past ~14 days (makes the hypertable/time-series story real for Tiger Data).
    //   3. Recompute unlocks, quests and points with the scoring.ts rules.
    //      Simplest: reuse the same logic as pgStore.recordCheckin.
    // Make it re-runnable: DELETE rows WHERE uid LIKE 'seed-%' first.
    void pool;
    console.log("TODO: write seed users to Tiger Data");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
