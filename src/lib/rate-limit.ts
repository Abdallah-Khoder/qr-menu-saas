import type { Db } from './db';

export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

/** True if any of the keys already failed too many times recently. */
export async function isBlocked(db: Db, keys: string[]): Promise<boolean> {
  const res = await db.query(
    `SELECT key, COUNT(*)::int AS n FROM login_attempts
     WHERE key = ANY($1::text[]) AND created_at > now() - make_interval(mins => $2)
     GROUP BY key`,
    [keys, WINDOW_MINUTES],
  );
  return res.rows.some((r) => r.n >= MAX_FAILURES);
}

export async function recordFailure(db: Db, keys: string[]) {
  await db.query(`INSERT INTO login_attempts (key) SELECT unnest($1::text[])`, [keys]);
  // Housekeeping: old rows are useless, keep the table small.
  await db.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);
}

export async function clearFailures(db: Db, keys: string[]) {
  await db.query(`DELETE FROM login_attempts WHERE key = ANY($1::text[])`, [keys]);
}
