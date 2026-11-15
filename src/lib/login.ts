import type { Db } from './db';
import { dummyHash, verifyPassword } from './password.mjs';
import { clearFailures, releaseAttempts, reserveAttempt } from './rate-limit';

export type LoginResult =
  | { ok: true; user: { id: string; role: 'super_admin' | 'owner' } }
  | { ok: false; reason: 'invalid' | 'rate_limited' };

/**
 * Checks an email and password. The caller always shows the SAME message for 'invalid',
 * so an attacker cannot learn which emails exist.
 */
export async function login(db: Db, emailInput: string, password: string, ip: string): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${email}`];

  // Reserve our attempt first (see rate-limit.ts). A wrong password simply keeps it counted.
  const slot = await reserveAttempt(db, keys);
  if (!slot.allowed) return { ok: false, reason: 'rate_limited' };

  const res = await db.query(
    `SELECT id, role, password_hash, email_verified_at FROM users WHERE email = $1`,
    [email],
  );
  const user = res.rows[0];

  // Even when the email does not exist, do the same slow work, so timing reveals nothing.
  const matches = await verifyPassword(password, user ? user.password_hash : await dummyHash());

  if (!user || !matches || !user.email_verified_at) {
    return { ok: false, reason: 'invalid' };
  }

  await releaseAttempts(db, slot.ids);
  await clearFailures(db, [`email:${email}`]);
  return { ok: true, user: { id: user.id, role: user.role } };
}
