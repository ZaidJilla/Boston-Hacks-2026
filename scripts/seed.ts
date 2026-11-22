// npm run data:seed — ~40 fake players across 6 colleges, written to Tiger Data.
// Every visit goes through the same recordCheckin() the API uses, so points, unlocks and
// line quests follow the real rules. Check-ins are backdated over 14 days to give the
// hypertable real time-series history. Re-runnable: wipes seed rows + the demo player first.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  // Imported after .env.local is loaded.
  const { getPool } = await import("../src/lib/db");
  const { DEMO_USER, SEED_UID_PREFIX, buildSeedPlayers } = await import("../src/lib/seedData");
  const { checkinFacts, getStore } = await import("../src/lib/store");
  const { citywide } = await import("../src/lib/leaderboard");

  const players = buildSeedPlayers();
  const visitCount = players.reduce((n, p) => n + p.visits.length, 0);
  console.log(`Built ${players.length} players with ${visitCount} check-ins.`);

  const pool = getPool();
  if (!pool) {
    console.log("DATABASE_URL not set. Demo mode replays these same players in memory automatically.");
    return;
  }

  try {
    const who = [`${SEED_UID_PREFIX}%`, DEMO_USER.uid];
    for (const table of ["checkins", "first_visits", "unlocks", "quests", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE uid LIKE $1 OR uid = $2`, who);
    }
    console.log("Cleared previous seed rows.");

    const store = getStore();
    let done = 0;
    // Sequential on purpose: back-dated inserts create many new daily chunks, and parallel
    // chunk creation deadlocks. Visits stay in time order so unlocks land on the right one.
    for (const p of players) {
      for (const { restaurant: r, at } of p.visits) {
        await store.recordCheckin({ user: p.user, restaurant: r, lat: r.lat, lng: r.lng, createdAt: at, ...checkinFacts(r) });
        done++;
      }
      process.stdout.write(`\rWrote ${done} check-ins...`);
    }
    console.log(`\rWrote ${done} check-ins.   `);

    await pool.query(`CALL refresh_continuous_aggregate('checkins_daily', NULL, NULL)`).catch((err) => {
      console.warn("Couldn't refresh checkins_daily (run npm run db:migrate?):", err.message);
    });

    const board = await citywide(100);
    const rank = board.findIndex((r) => r.id === DEMO_USER.uid) + 1;
    console.log("\nTop 5:");
    board.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name} (${r.college}) ${r.points}`));
    console.log(`Demo player: #${rank || "-"} of ${board.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
