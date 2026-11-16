import { randomInt } from 'node:crypto';

// Arabic letters are written with Latin letters (sound-alike), not translated.
const ARABIC: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'a', آ: 'a', ٱ: 'a', ء: 'a', ع: 'a', ة: 'a', ى: 'a',
  ب: 'b', پ: 'b', ت: 't', ث: 'th', ج: 'j', چ: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd',
  ط: 't', ظ: 'z', غ: 'gh', ف: 'f', ڤ: 'v', ق: 'q', ك: 'k', گ: 'g',
  ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ؤ: 'w', ي: 'y', ئ: 'y',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const READABLE_MAX = 49; // 49 + "-" + 10 random = 60 (the database limit)
const RANDOM_LENGTH = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** The readable part of the link: lowercase Latin letters, digits and single dashes. */
export function slugify(name: string): string {
  const latin = Array.from(name.normalize('NFD'))
    .map((ch) => ARABIC[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[̀-ͯـً-ٰٟ]/g, '') // accents, tatweel, Arabic diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, READABLE_MAX)
    .replace(/-+$/g, '');
  return latin || 'menu';
}

/** Full public slug: readable part + "-" + 10 random characters (so links can't be guessed). */
export function makeSlug(name: string): string {
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i++) random += ALPHABET[randomInt(ALPHABET.length)];
  return `${slugify(name)}-${random}`;
}
