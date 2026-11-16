import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_DAYS } from './session';

/** The one place that sets the login cookie (login and sign-up both use it). */
export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript in the page cannot read it
    secure: process.env.NODE_ENV === 'production', // only over https when deployed
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}
