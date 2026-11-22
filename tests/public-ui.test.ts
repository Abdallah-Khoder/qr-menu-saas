import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PublicPhoto from '../src/components/PublicPhoto';
import PublicSizes from '../src/components/PublicSizes';
import { pickSize } from '../src/lib/pick-size';
import { priceParts, priceText } from '../src/lib/price';

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
    // each amount is its own unbreakable piece, so on a narrow card the line breaks between them
    expect(html).toContain('<span class="pm-amt">$4.00</span> · <span class="pm-amt">360,000 ل.ل</span>');
  });
});

describe('pickSize: the customer\'s choice survives a refresh where the list changed', () => {
  it('nothing chosen yet: the first size', () => {
    expect(pickSize(sizes, null).label).toBe('S');
  });
  it('keeps the chosen size by NAME even if another size was removed before it (M stays M, not L)', () => {
    const afterOwnerRemovedS = sizes.filter((s) => s.label !== 'S'); // [M, L]
    expect(pickSize(afterOwnerRemovedS, 'M').label).toBe('M');
    expect(pickSize(afterOwnerRemovedS, 'L').label).toBe('L'); // not the first one by accident
  });
  it('the chosen size itself was removed: back to the first one', () => {
    expect(pickSize(sizes.filter((s) => s.label !== 'M'), 'M').label).toBe('S');
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

describe('a price on a narrow card (320 px) never runs out of the card', () => {
  it('priceParts gives one piece per currency and priceText still joins them with a dot', () => {
    expect(priceParts('25', '2250000', 'BOTH')).toEqual(['$25.00', '2,250,000 ل.ل']);
    expect(priceParts('25', '2250000', 'USD')).toEqual(['$25.00']);
    expect(priceParts('25', '2250000', 'LBP')).toEqual(['2,250,000 ل.ل']);
    expect(priceText('25', '2250000', 'BOTH')).toBe('$25.00 · 2,250,000 ل.ل');
  });
  it('the CSS lets the price wrap: each amount is a block that never grows past the card (a no-wrap price was the bug)', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/\.pm-amt\s*\{[^}]*display:\s*inline-block[^}]*max-width:\s*100%/);
    expect(css).not.toMatch(/\.pm-(price|amt)\s*\{[^}]*white-space:\s*nowrap/);
  });
});
