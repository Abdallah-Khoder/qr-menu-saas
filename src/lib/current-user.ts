import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { SESSION_COOKIE, readSession } from './session';
import { findSessionUser } from './session-user';

export type CurrentUser = { id: string; email: string; role: 'super_admin' | 'owner' };

/**
 * The logged-in user, read from the DATABASE on every request (not from the cookie),
 * so deleting a user or changing his role takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token);
  if (!session) return null;
  return findSessionUser(getDb(), session.userId, session.issuedAt);
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
