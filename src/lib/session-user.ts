import type { Db } from './db';

export type SessionUser = { id: string; email: string; role: 'super_admin' | 'owner' };

/**
 * The user a login cookie belongs to, read from the DATABASE: he must exist and be verified, and the cookie must
 * have been made AFTER his last password reset. So a reset logs out everybody who was logged in with the old
 * password (a cookie made in the same second as the reset still works: the cookie knows only whole seconds).
 */
export async function findSessionUser(db: Db, userId: string, issuedAt: number): Promise<SessionUser | null> {
  const res = await db.query(
    `SELECT id, email, role FROM users
     WHERE id = $1 AND email_verified_at IS NOT NULL
       AND (password_changed_at IS NULL OR floor(extract(epoch FROM password_changed_at)) <= $2)`,
    [userId, issuedAt],
  );
  return res.rows[0] ?? null;
}
