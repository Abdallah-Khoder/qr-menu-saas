import { randomInt } from 'node:crypto';
import { slugify } from './slugify';

export { slugify };

const RANDOM_LENGTH = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Full public slug: readable part + "-" + 10 random characters (so links can't be guessed). */
export function makeSlug(name: string): string {
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i++) random += ALPHABET[randomInt(ALPHABET.length)];
  return `${slugify(name)}-${random}`;
}
