import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'session';
export const SESSION_DAYS = 7;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

/** A signed token that contains ONLY the user id. Everything else is read from the database. */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

/** The user id and the moment the cookie was made (seconds), or null if it is missing, forged, or expired. */
export async function readSession(token: string | undefined): Promise<{ userId: string; issuedAt: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' && typeof payload.iat === 'number' ? { userId: payload.sub, issuedAt: payload.iat } : null;
  } catch {
    return null;
  }
}

/** Returns the user id, or null if the token is missing, forged, or expired. */
export async function readSessionToken(token: string | undefined): Promise<string | null> {
  return (await readSession(token))?.userId ?? null;
}
