import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PublicPhoto from '../src/components/PublicPhoto';
import PublicSizes from '../src/components/PublicSizes';

// What the server sends before any JavaScript runs: the customer sees the right thing at once.
const sizes = [
  { label: 'S', price_usd: '4.00', price_lbp: null },
  { label: 'M', price_usd: '5.50', price_lbp: null },
  { label: 'L', price_usd: '7.00', price_lbp: null },
];

describe('item sizes on the public page', () => {
  it('shows ONE price (the first size) and one button per size, the first pressed', () => {
    const html = renderToStaticMarkup(createElement(PublicSizes, { sizes, currencies: 'USD' }));
    expect(html).toContain('$4.00');
    expect(html).not.toContain('$5.50');
    expect(html).not.toContain('$7.00');
    expect((html.match(/<button/g) ?? []).length).toBe(3);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*><bdi dir="ltr">S</);
  });
  it('shows both currencies when the restaurant uses both', () => {
    const html = renderToStaticMarkup(createElement(PublicSizes, {
      sizes: [{ label: 'S', price_usd: '4.00', price_lbp: '360000' }], currencies: 'BOTH',
    }));
    expect(html).toContain('$4.00 · 360,000 ل.ل');
  });
});

describe('item photo on the public page', () => {
  const html = renderToStaticMarkup(createElement(PublicPhoto, { src: 'https://x.example/a.webp' }));
  it('has a small lazy photo inside a button, and a closed dialog with the big one and an X', () => {
    expect(html).toContain('class="pm-photo-btn"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="إغلاق"');
    expect((html.match(/<img/g) ?? []).length).toBe(2);
    expect(html).not.toContain('open'); // closed until a tap
  });
  it('never sends the page address to the image host', () => {
    expect((html.match(/referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/gi) ?? []).length).toBe(2);
  });
});
