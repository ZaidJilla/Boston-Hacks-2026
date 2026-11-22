// Applies db/schema.sql to Tiger Data. Safe to re-run (schema uses IF NOT EXISTS).
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

// tsx doesn't load .env.local like Next does.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set, skipping. Demo mode uses the in-memory store.");
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(readFileSync("db/schema.sql", "utf8"));
    const { rows } = await pool.query(
      "SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = 'checkins'",
    );
    console.log(`Schema applied. checkins hypertable: ${rows.length ? "yes" : "NO, check schema.sql"}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
