// Server only. Tiger Data connection. Returns null when DATABASE_URL is unset so demo mode
// falls back to the in-memory store.
import { Pool } from "pg";

const g = globalThis as unknown as { __pool?: Pool };

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return (g.__pool ??= new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 }));
}
