import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CategoryItems from '../src/components/CategoryItems';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// On the menu page every category starts CLOSED: an owner with many products would otherwise scroll for ages.
const item = (id: string, name: string) => ({
  id, category_id: 'c1', name, description: '', available: true, image_url: null, price_usd: '1.00', price_lbp: null, sizes: [],
});
const html = (items: ReturnType<typeof item>[], disabled = false) =>
  renderToStaticMarkup(createElement(CategoryItems, {
    category: { id: 'c1', name: 'Crepe' }, items, categories: [{ id: 'c1', name: 'Crepe' }],
    currencies: 'USD' as const, disabled,
  }));

describe('a category on the menu page (what the server sends)', () => {
  it('starts closed: the products are not on the page, only the title line', () => {
    const out = html([item('i1', 'Nutella'), item('i2', 'Lotus')]);
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('Nutella');
    expect(out).not.toContain('Lotus');
    expect(out).not.toContain('class="rows"');
    expect(out).not.toContain('class="cat-body"');
  });

  it('the closed title line still shows the name, how many products, and the "add product" button', () => {
    const out = html([item('i1', 'Nutella'), item('i2', 'Lotus')]);
    expect(out).toContain('>Crepe<');
    expect(out).toContain('2 صنف');
    expect(out).toMatch(/<button[^>]*>\+ إضافة منتج<\/button>/);
  });

  it('an empty category says 0 and is closed too (its "nothing here" note appears only when opened)', () => {
    const out = html([]);
    expect(out).toContain('0 صنف');
    expect(out).not.toContain('لا توجد منتجات');
  });

  it('the toggle is a real button inside the heading, tied to the list it opens', () => {
    const out = html([item('i1', 'Nutella')]);
    expect(out).toMatch(/<h2 class="cat-title"><button type="button" class="cat-toggle" aria-expanded="false" aria-controls="([^"]+)"/);
  });

  it('a suspended restaurant cannot add (the button is off) but can still open and read', () => {
    const out = html([item('i1', 'Nutella')], true);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>\+ إضافة منتج<\/button>/);
    expect(out).not.toMatch(/class="cat-toggle"[^>]*disabled/);
  });
});

describe('the arrow style', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  it('points down when closed and turns up when open, without transform', () => {
    expect(css).toMatch(/\.cat-toggle\[aria-expanded="true"\] \.cat-arrow \{ rotate: 180deg; \}/);
    expect(css).not.toMatch(/\.cat-arrow[^{]*\{[^}]*transform/);
  });
  it('its turning is switched off for people who asked for less motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)![0];
    expect(block).toMatch(/\.cat-arrow \{ transition: none; \}/);
  });
  it('the title line is tall enough to tap', () => {
    expect(css).toMatch(/\.cat-toggle \{[^}]*min-height: 44px/);
  });
});
