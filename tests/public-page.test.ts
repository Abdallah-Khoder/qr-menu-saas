import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PublicMenu } from '../src/lib/public-menu';

// The whole public page, rendered the way the server sends it, for both directions the owner can choose.
const mocks = vi.hoisted(() => ({ menu: null as unknown as PublicMenu }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }), notFound: () => { throw new Error('notFound'); } }));
vi.mock('../src/lib/public-cache', () => ({ getCachedPublicMenu: async () => ({ state: 'ok', menu: mocks.menu }) }));
import PublicMenuPage from '../src/app/m/[slug]/page';

const menu = (over: Partial<PublicMenu> = {}): PublicMenu => ({
  name: 'jareb', currencies: 'LBP', phone: '+96170123456', locations: [], instagram: null, facebook: null, tiktok: null, direction: 'rtl',
  categories: [{ name: 'Crepe', items: [{ name: 'Lotus (new!)', description: 'with cream', image: null, price_usd: null, price_lbp: '250000', sizes: [] }] }],
  ...over,
});
const render = async (over: Partial<PublicMenu> = {}) => {
  mocks.menu = menu(over);
  return renderToStaticMarkup(await PublicMenuPage({ params: Promise.resolve({ slug: 'jareb-k3x9qp7vtz' }) }));
};

describe('the public page follows the direction the owner chose', () => {
  it('right to left (Arabic) is the page direction when the owner chose it', async () => {
    expect(await render({ direction: 'rtl' })).toContain('<main class="pm" dir="rtl">');
  });
  it('left to right (English) is the page direction when the owner chose it', async () => {
    const html = await render({ direction: 'ltr' });
    expect(html).toContain('<main class="pm" dir="ltr">');
    expect(html).not.toContain('<main class="pm" dir="rtl">');
  });
  it('the names are isolated with <bdi>, so a name in the other language or with punctuation never breaks the line, and nothing picks its own side with dir="auto"', async () => {
    for (const direction of ['rtl', 'ltr'] as const) {
      const html = await render({ direction });
      expect(html, direction).not.toContain('dir="auto"');
      expect(html, direction).toContain('<h1><bdi>jareb</bdi></h1>');
      expect(html, direction).toContain('<h2><bdi>Crepe</bdi></h2>');
      expect(html, direction).toContain('<b><bdi>Lotus (new!)</bdi></b>');
      expect(html, direction).toContain('<p><bdi>with cream</bdi></p>');
      expect(html, direction).toContain('><bdi>Crepe</bdi></a>'); // the section chip
    }
  });
  it('a customer\'s page has no owner bar, and the owner\'s ?preview=1 is not read by the server (the page stays the same for everybody)', async () => {
    for (const direction of ['rtl', 'ltr'] as const) expect(await render({ direction }), direction).not.toContain('pm-preview');
    const source = readFileSync('src/app/m/[slug]/page.tsx', 'utf8');
    expect(source).toContain('<PreviewBar />');
    expect(source).not.toMatch(/searchParams|cookies\(|headers\(/); // reading any of these would make every customer's page dynamic and slower
  });
  it('the contact button is on the page in both directions', async () => {
    for (const direction of ['rtl', 'ltr'] as const) expect(await render({ direction }), direction).toContain('pm-float-toggle');
  });
});

describe('an English (left to right) menu lines its size buttons up with the names', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  it('the sizes stay left-to-right (S M L) and sit at the start side of the page in both directions', () => {
    expect(css).toMatch(/\.pm-size-btns\s*\{[^}]*direction:\s*ltr/);
    expect(css).toMatch(/\.pm\[dir="ltr"\] \.pm-size-btns\s*\{[^}]*justify-content:\s*flex-start/);
  });
});
