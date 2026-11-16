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

const MAP_BAD = { ok: false as const, error: 'رابط الخريطة غير صالح. استخدم رابطًا من خرائط غوغل أو Waze أو خرائط أبل' };

const GOOGLE_DOMAINS = new Set([
  'google.com', 'google.com.lb', 'google.fr', 'google.de', 'google.it', 'google.es', 'google.nl', 'google.ca', 'google.co.uk',
  'google.ae', 'google.com.sa', 'google.com.eg', 'google.com.tr', 'google.com.au', 'google.co.in', 'google.com.br', 'google.ru',
]);

/** Is this https address a real map page (and not just any website)? */
function isMapAddress(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'maps.app.goo.gl' || host === 'maps.google.com' || host === 'maps.apple.com' || host === 'ul.waze.com') return true;
  if (host === 'goo.gl') return path.startsWith('/maps');
  if (host === 'waze.com' || host === 'www.waze.com') return path.startsWith('/ul') || path.startsWith('/live-map');
  // Google's own domains (an explicit list: a pattern would also match someone else's google.xx.yy), /maps pages only
  const bare = host.replace(/^www\./, '');
  if (GOOGLE_DOMAINS.has(bare)) return path === '/maps' || path.startsWith('/maps/');
  return false;
}

/**
 * Link to the restaurant on a map. Only real map sites are accepted, so the "map" button can never
 * lead to a stranger's website. Empty = none.
 */
export function parseMapUrl(input: string): Parsed<string | null> {
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  if (s.length > 500) return MAP_BAD;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return MAP_BAD;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !isMapAddress(url)) return MAP_BAD;
  const value = url.toString();
  return value.length <= 500 ? { ok: true, value } : MAP_BAD;
}

const SOCIAL_MAX = 300;

/**
 * Social links are REBUILT from the account name, never kept as typed. So the saved link is always
 * https://www.<site>/<account> with no query string: no redirect pages (like facebook.com/l.php?u=...),
 * no tracking, no other website. Typing only the account name works too.
 */
const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com', 'instagr.am'];
const INSTAGRAM_RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal',
  'privacy', 'web', 'l', 'challenge', 'oauth', 'emails', 'download', 'directory', 'press', 'api',
]);
const INSTAGRAM_ACCOUNT = /^[A-Za-z0-9._]{1,30}$/;

export function parseInstagram(input: string): Parsed<string | null> {
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  const bad = { ok: false as const, error: 'رابط إنستغرام غير صالح. اكتب اسم الحساب فقط أو الصق رابط الصفحة' };
  const asAccount = s.replace(/^@/, '');
  let account = asAccount;
  if (!INSTAGRAM_ACCOUNT.test(asAccount)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      return bad;
    }
    if (url.protocol !== 'https:' || url.username || url.password || !INSTAGRAM_HOSTS.includes(url.hostname.toLowerCase())) return bad;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return bad; // a profile only: not a post, a login page or a redirect
    account = parts[0];
  }
  if (!INSTAGRAM_ACCOUNT.test(account) || INSTAGRAM_RESERVED.has(account.toLowerCase())) return bad;
  return { ok: true, value: `https://www.instagram.com/${account}` };
}

const FACEBOOK_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com', 'fb.me'];
const FACEBOOK_RESERVED = new Set([
  'sharer', 'dialog', 'login', 'plugins', 'share', 'tr', 'policy', 'policies', 'help', 'settings', 'marketplace',
  'groups', 'events', 'watch', 'gaming', 'pages', 'people', 'p', 'reel', 'photo', 'story', 'ads', 'business',
  'recover', 'privacy', 'legal', 'l', 'ajax', 'ads', 'permalink', 'video', 'videos', 'hashtag', 'search',
]);
const FACEBOOK_NAME = /^[A-Za-z0-9.]{5,50}$/;
const FACEBOOK_SLUG = /^[A-Za-z0-9._%-]{1,100}$/; // inside /p/<slug> and /people/<name>/<id>

export function parseFacebook(input: string): Parsed<string | null> {
  const s = input.trim();
  if (s === '') return { ok: true, value: null };
  const bad = { ok: false as const, error: 'رابط فيسبوك غير صالح. اكتب اسم الصفحة فقط أو الصق رابط الصفحة' };
  const ok = (path: string): Parsed<string | null> => {
    const value = `https://www.facebook.com/${path}`;
    return value.length <= SOCIAL_MAX ? { ok: true, value } : bad;
  };
  const isName = (n: string) => FACEBOOK_NAME.test(n) && !n.toLowerCase().endsWith('.php') && !FACEBOOK_RESERVED.has(n.toLowerCase());
  const asName = s.replace(/^@/, '');
  if (isName(asName)) return ok(asName);

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return bad;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !FACEBOOK_HOSTS.includes(url.hostname.toLowerCase())) return bad;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 1 && isName(parts[0])) return ok(parts[0]);
  if (parts.length === 1 && parts[0] === 'profile.php') {
    const id = url.searchParams.get('id') ?? '';
    return /^[0-9]{5,20}$/.test(id) ? ok(`profile.php?id=${id}`) : bad;
  }
  if (parts.length === 2 && parts[0] === 'p' && FACEBOOK_SLUG.test(parts[1])) return ok(`p/${parts[1]}`);
  if (parts.length === 3 && parts[0] === 'people' && FACEBOOK_SLUG.test(parts[1]) && /^[0-9]{5,20}$/.test(parts[2])) {
    return ok(`people/${parts[1]}/${parts[2]}`);
  }
  return bad;
}
