import { randomUUID } from 'node:crypto';
import type { Db } from './db';

export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;
const CLEANUP_CHANCE = 0.05; // on average once every 20 logins

/** Old rows are useless, delete them to keep the table small. */
export async function deleteOldAttempts(db: Db) {
  await db.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);
}

/**
 * Reserve one attempt BEFORE checking the password.
 *
 * Why before: if we only checked "is he blocked?" first and wrote the failure afterwards,
 * 100 requests sent at the same moment would all pass the check (nobody has written yet)
 * and get 100 guesses. Here every request first writes its own row, then counts. Each
 * request is ranked by the time it wrote its row, and only the first 5 in the queue get through,
 * even when they run at the same time on different servers.
 *
 * `limit` is 5 per 15 minutes unless the caller says otherwise (photo uploads allow more).
 *
 * Returns the ids of the rows we wrote, so a successful login can remove them.
 */
export async function reserveAttempt(
  db: Db,
  keys: string[],
  limit: { max: number; minutes: number } = { max: MAX_FAILURES, minutes: WINDOW_MINUTES },
): Promise<{ allowed: true; ids: string[] } | { allowed: false }> {
  // Housekeeping is only needed now and then, so most logins skip this extra database trip.
  if (Math.random() < CLEANUP_CHANCE) await deleteOldAttempts(db);

  // All rows of this request share one request_id: that is what makes every key rank us the same way.
  const inserted = await db.query(
    `INSERT INTO login_attempts (key, request_id) SELECT unnest($1::text[]), $2::uuid RETURNING id`,
    [keys, randomUUID()],
  );
  const ids: string[] = inserted.rows.map((r) => r.id);

  // Count only the rows that are NOT newer than ours (same key, inside the window).
  // Counting everything would be wrong when many requests arrive together: all of them would
  // write first, then all would count 20 and ALL be refused. Ranking by (time, request_id) gives each
  // request its place in the queue: places 1-5 are checked, place 6 and later are refused.
  const counted = await db.query(
    `SELECT m.key, COUNT(*)::int AS n
     FROM login_attempts m
     JOIN login_attempts a
       ON a.key = m.key
      AND a.created_at > now() - make_interval(mins => $2)
      AND (a.created_at, a.request_id) <= (m.created_at, m.request_id)
     WHERE m.id = ANY($1::uuid[])
     GROUP BY m.key`,
    [ids, limit.minutes],
  );
  // Our own row is included in the count, so "more than MAX" means this is attempt number 6 or later.
  if (counted.rows.some((r) => r.n > limit.max)) {
    await releaseAttempts(db, ids); // a refused request must not extend the block
    return { allowed: false };
  }
  return { allowed: true, ids };
}

export async function releaseAttempts(db: Db, ids: string[]) {
  await db.query(`DELETE FROM login_attempts WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function clearFailures(db: Db, keys: string[]) {
  await db.query(`DELETE FROM login_attempts WHERE key = ANY($1::text[])`, [keys]);
}
