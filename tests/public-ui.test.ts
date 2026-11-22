import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FloatingContacts from '../src/components/FloatingContacts';
import PublicContacts from '../src/components/PublicContacts';
import { contactLinks } from '../src/lib/contact-links';
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
    // each amount is its own piece: the first is the main price, the second the smaller one, side by side or one under the other
    expect(html).toContain('<bdi dir="ltr" class="pm-amt">$4.00</bdi><bdi dir="ltr" class="pm-amt">360,000 ل.ل</bdi>');
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
  it('the CSS lets the price wrap: the amounts sit at the two ends of a row that wraps, and none grows past the card (a no-wrap price was the bug)', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/\.pm-price\s*\{[^}]*flex-wrap:\s*wrap[^}]*justify-content:\s*space-between/);
    expect(css).toMatch(/\.pm-amt\s*\{[^}]*max-width:\s*100%/);
    expect(css).not.toMatch(/\.pm-(price|amt)\s*\{[^}]*white-space:\s*nowrap/);
  });
});

describe('contact icons on the public page', () => {
  const none = { phone: null, instagram: null, facebook: null, tiktok: null, mapUrl: null };
  it('shows nothing when the owner filled in nothing', () => {
    expect(renderToStaticMarkup(createElement(PublicContacts, none))).toBe('');
  });
  it('shows ONE round icon per filled link, in a fixed order, each with its own name (no text button, no call link)', () => {
    const html = renderToStaticMarkup(createElement(PublicContacts, {
      phone: '+96170123456', instagram: 'https://www.instagram.com/a', facebook: 'https://www.facebook.com/a',
      tiktok: 'https://www.tiktok.com/@a', mapUrl: 'https://maps.app.goo.gl/x',
    }));
    expect(html.match(/class="pm-icon"/g)).toHaveLength(5);
    const labels = [...html.matchAll(/aria-label="([^"]+)" title/g)].map((m) => m[1]);
    expect(labels).toEqual(['واتساب', 'إنستغرام', 'فيسبوك', 'تيك توك', 'الموقع على الخريطة']);
    expect(html).toContain('href="https://wa.me/96170123456"');
    expect(html).toContain('href="https://www.tiktok.com/@a"');
    expect(html).not.toContain('tel:');
    expect(html).not.toContain('اتصال');
    expect(html).not.toContain('pm-btn');
    expect((html.match(/<svg/g) ?? []).length).toBe(5); // an icon in every button
    expect((html.match(/rel="noopener noreferrer"/g) ?? []).length).toBe(5);
    expect((html.match(/target="_blank"/g) ?? []).length).toBe(5);
  });
  it('a phone number now gives only the WhatsApp icon, and TikTok is optional', () => {
    const html = renderToStaticMarkup(createElement(PublicContacts, { ...none, phone: '+96170123456' }));
    expect(html.match(/class="pm-icon"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="واتساب"');
    expect(html).not.toContain('تيك توك');
  });
});

describe('the sections wrap instead of scrolling sideways, and the motion respects reduced-motion', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const rule = (selector: string) => css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
  it('.pm-tabs wraps, is not sticky and has no horizontal scroll', () => {
    const tabs = rule('.pm-tabs');
    expect(tabs).toContain('flex-wrap: wrap');
    expect(tabs).not.toContain('overflow-x');
    expect(tabs).not.toContain('sticky');
  });
  it('entrance animations use "backwards", never "both": a kept end value would block the press and hover effects', () => {
    const entrances = [...css.matchAll(/animation:\s*pm-(?:rise|pop-in)[^;]*;/g)].map((m) => m[0]);
    expect(entrances).toHaveLength(4); // the name, the icons, the section chips, the cards
    for (const a of entrances) {
      expect(a).toContain('backwards');
      expect(a).not.toMatch(/\bboth\b/);
    }
  });
  it('every entrance animation is switched off for people who asked for less motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['.pm-icon', '.pm-tabs a', '.pm-item', '.pm-head h1']) expect(reduced, name).toContain(name);
    expect(reduced).toMatch(/animation:\s*none/);
  });
});

describe('the contact links list (one list for the icons under the name and the floating buttons)', () => {
  const all = { phone: '+96170123456', instagram: 'https://www.instagram.com/a', facebook: 'https://www.facebook.com/a', tiktok: 'https://www.tiktok.com/@a', mapUrl: 'https://maps.app.goo.gl/x' };
  it('only the filled ones, in a fixed order, with no call link', () => {
    expect(contactLinks(all).map((l) => l.icon)).toEqual(['whatsapp', 'instagram', 'facebook', 'tiktok', 'map']);
    expect(contactLinks({ ...all, instagram: null, mapUrl: null }).map((l) => l.icon)).toEqual(['whatsapp', 'facebook', 'tiktok']);
    expect(contactLinks({ phone: null, instagram: null, facebook: null, tiktok: null, mapUrl: null })).toEqual([]);
    expect(contactLinks(all).some((l) => l.href.startsWith('tel:'))).toBe(false);
  });
});

describe('floating buttons', () => {
  const links = contactLinks({ phone: '+96170123456', instagram: 'https://www.instagram.com/a', facebook: null, tiktok: null, mapUrl: null });
  it('start hidden (they appear after a scroll), closed, with an accessible round toggle and a back-to-top arrow', () => {
    const html = renderToStaticMarkup(createElement(FloatingContacts, { links }));
    expect(html).toContain('class="pm-float" data-show="false" data-open="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="pm-float-links"');
    expect(html).toContain('aria-label="التواصل مع المطعم"');
    expect(html).toContain('aria-label="العودة إلى أعلى الصفحة"');
    expect(html.match(/class="pm-icon pm-float-icon"/g)).toHaveLength(2);
    expect(html).toContain('href="https://wa.me/96170123456"');
    expect(html).not.toContain('tel:');
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });
  it('with no contact links there is no contact button, only the back-to-top arrow', () => {
    const html = renderToStaticMarkup(createElement(FloatingContacts, { links: [] }));
    expect(html).not.toContain('pm-float-toggle');
    expect(html).toContain('pm-top');
  });
  const css = readFileSync('src/app/globals.css', 'utf8');
  it('the CSS hides them with "translate" (not "transform", which would block the press effect), and opens the column only on wide screens', () => {
    expect(css).toMatch(/\.pm-float-icon\s*\{[^}]*translate:\s*0 10px/);
    expect(css).not.toMatch(/\.pm-float-icon\s*\{[^}]*[^-]transform:\s*translate/);
    expect(css).toMatch(/@media \(min-width: 1200px\)\s*\{[^@]*\.pm-float-toggle\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.pm \{[^}]*padding: 0 16px 96px/); // room so the last card is never covered
  });
  it('their transitions are switched off for people who asked for less motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['.pm-float', '.pm-float-icon', '.pm-float-toggle', '.pm-top']) expect(reduced, name).toContain(name);
  });
});
