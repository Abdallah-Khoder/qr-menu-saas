// Password hashing with scrypt (built into Node, no extra package).
// Written as a plain .mjs file so both the Next app and the command-line scripts can import it.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384; // cost: how slow one guess is. Higher = harder to brute-force.
const R = 8;
const P = 1;
const KEY_LEN = 64;

function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns "scrypt$N$r$p$salt$hash" (everything needed to check the password later). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** True only if the password matches. Never throws on a malformed stored value. */
export async function verifyPassword(password, stored) {
  try {
    const [tag, n, r, p, salt, hash] = String(stored).split('$');
    if (tag !== 'scrypt' || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** A real hash of a random password: used to spend the same time when the email does not exist. */
let dummy;
export function dummyHash() {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}
