// Client-safe (no Node imports): the signup form uses it for the live link preview.
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

export const READABLE_MAX = 49; // 49 + "-" + 10 random = 60 (the database limit)

/** The name written with Latin letters and digits only (single dashes). Empty if it has no letter or digit. */
export function transliterate(name: string): string {
  return Array.from(name.normalize('NFD'))
    .map((ch) => ARABIC[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[\u0300-\u036f\u0640\u064b-\u065f\u0670]/g, '') // accents, tatweel, Arabic diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, READABLE_MAX)
    .replace(/-+$/g, '');
}

/** True if the name has at least one letter or digit (a name of only symbols or emoji is refused). */
export function hasLetterOrDigit(name: string): boolean {
  return transliterate(name) !== '';
}

/** The readable part of the link; 'menu' only as a last safety net (names without letters are refused earlier). */
export function slugify(name: string): string {
  return transliterate(name) || 'menu';
}

