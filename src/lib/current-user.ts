import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { SESSION_COOKIE, readSessionToken } from './session';

export type CurrentUser = { id: string; email: string; role: 'super_admin' | 'owner' };

/**
 * The logged-in user, read from the DATABASE on every request (not from the cookie),
 * so deleting a user or changing his role takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = await readSessionToken(token);
  if (!id) return null;
  const res = await getDb().query(
    `SELECT id, email, role FROM users WHERE id = $1 AND email_verified_at IS NOT NULL`,
    [id],
  );
  return res.rows[0] ?? null;
});

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'super_admin') redirect('/dashboard');
  return user;
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'owner') redirect('/admin');
  return user;
}
