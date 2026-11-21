// Server only. Tiger Data connection. Returns null when DATABASE_URL is unset so demo mode
// falls back to the in-memory store.
import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { __pool?: Pool };

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return (g.__pool ??= new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 }));
}

/**
 * Run `fn` inside BEGIN/COMMIT on one pooled client. Any throw rolls everything back,
 * so a check-in either fully lands (checkin + points + unlock + quest) or not at all.
 */
export async function withTransaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error("withTransaction called without DATABASE_URL");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
