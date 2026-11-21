// Server only. Tiger Data connection. Returns null when DATABASE_URL is unset so demo mode
// falls back to the in-memory store.
import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { __pool?: Pool };

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return (g.__pool ??= new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 5 }));
}

// Postgres asks the client to retry these: deadlock_detected, serialization_failure.
const RETRYABLE = new Set(["40P01", "40001"]);
const MAX_ATTEMPTS = 3;

/**
 * Run `fn` inside BEGIN/COMMIT on one pooled client. Any throw rolls everything back,
 * so a check-in either fully lands (checkin + points + unlock + quest) or not at all.
 * Deadlocks (e.g. two inserts creating the same new hypertable chunk) are retried.
 */
export async function withTransaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error("withTransaction called without DATABASE_URL");
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    // If ROLLBACK itself fails, the connection is broken: destroy it instead of pooling it.
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {
        broken = true;
      });
      const code = (err as { code?: string }).code;
      if (broken || !code || !RETRYABLE.has(code) || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 50 * attempt + Math.random() * 100));
    } finally {
      client.release(broken);
    }
  }
}
