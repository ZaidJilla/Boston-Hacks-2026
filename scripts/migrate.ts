// Applies db/schema.sql to Tiger Data. Person 2.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set, skipping. Demo mode uses the in-memory store.");
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query(readFileSync("db/schema.sql", "utf8"));
  await pool.end();
  console.log("Schema applied.");
}
main();
