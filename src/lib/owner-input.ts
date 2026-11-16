// Validation of what the owner types. Pure functions: easy to test.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const toAsciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Phone for the call / WhatsApp buttons, saved as +<country><number>.
 * Accepts "+961 70 123 456", "0096170123456", and Lebanese local "070 123 456" or "03 123 456".
 * Empty = no phone.
 */
export function parsePhone(input: string): Parsed<string | null> {
  let p = toAsciiDigits(input).replace(/[\s\-().]/g, '');
  if (p === '') return { ok: true, value: null };
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+961' + p.slice(1); // local Lebanese number
  if (!/^\+[1-9][0-9]{7,14}$/.test(p)) {
    return { ok: false, error: 'رقم الهاتف غير صالح. اكتبه بصيغة دولية مثل ‎+96170123456 أو برقم لبناني مثل 070123456' };
  }
  return { ok: true, value: p };
}

/** Link to the restaurant on the map. Must be https. Empty = none. */
export function parseMapUrl(input: string): Parsed<string | null> {
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  const bad = { ok: false as const, error: 'رابط الخريطة غير صالح. يجب أن يبدأ بـ https://' };
  if (s.length > 500) return bad;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return bad;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return bad;
  return { ok: true, value: url.toString() };
}

function parseSocial(
  input: string, hosts: string[], handlePattern: RegExp, handleBase: string, what: string,
): Parsed<string | null> {
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  const bad = { ok: false as const, error: `رابط ${what} غير صالح. الصق رابط الصفحة أو اكتب اسم الحساب فقط` };
  if (s.length > 300) return bad;
  // Just the account name (with or without @): we build the link.
  const handle = s.replace(/^@/, '');
  if (handlePattern.test(handle)) return { ok: true, value: handleBase + handle };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return bad;
  }
  // Only the real site: an icon for Instagram must never lead somewhere else.
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname.toLowerCase())) return bad;
  return { ok: true, value: url.toString() };
}

export const parseInstagram = (input: string) =>
  parseSocial(input, ['instagram.com', 'www.instagram.com', 'instagr.am'], /^[A-Za-z0-9._]{1,30}$/, 'https://www.instagram.com/', 'إنستغرام');

export const parseFacebook = (input: string) =>
  parseSocial(input, ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com', 'www.fb.com', 'fb.me'], /^[A-Za-z0-9.]{5,50}$/, 'https://www.facebook.com/', 'فيسبوك');
