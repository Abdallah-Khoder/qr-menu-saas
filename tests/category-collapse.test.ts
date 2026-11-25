import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CategoryItems, { opened, toggled, type Fold } from '../src/components/CategoryItems';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// On the menu page every category starts CLOSED: an owner with many products would otherwise scroll for ages.
const item = (id: string, name: string) => ({
  id, category_id: 'c1', name, description: '', available: true, image_url: null, price_usd: '1.00', price_lbp: null, sizes: [],
});
const html = (items: ReturnType<typeof item>[], disabled = false, initialFold?: Fold) =>
  renderToStaticMarkup(createElement(CategoryItems, {
    category: { id: 'c1', name: 'Crepe' }, items, categories: [{ id: 'c1', name: 'Crepe' }],
    currencies: 'USD' as const, disabled, initialFold,
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

describe('closing keeps what the owner typed (the list is hidden, never taken away)', () => {
  const two = [item('i1', 'Nutella'), item('i2', 'Lotus')];

  it('the arrow goes never → mounting (built closed, opens one frame later) → closed → open → closed', () => {
    expect(toggled('never')).toBe('mounting');
    expect(toggled('open')).toBe('closed');
    expect(toggled('closed')).toBe('open');
    expect(toggled('mounting')).toBe('closed'); // pressed again within that one frame: the owner wants it shut
  });

  it('"+ إضافة منتج" opens the same way: the first time folded (so it slides), later straight away', () => {
    expect(opened('never')).toBe('mounting');
    expect(opened('closed')).toBe('open');
    expect(opened('open')).toBe('open');
    expect(opened('mounting')).toBe('open');
  });

  it('just built (the one frame before it opens): the list is on the page but still FOLDED, so there is something to slide from', () => {
    const out = html(two, false, 'mounting');
    expect(out).toContain('aria-expanded="true"'); // the arrow already says "open"
    expect(out).toContain('Nutella');
    expect(out).toMatch(/<div class="cat-body" id="[^"]+" data-open="false">/);
  });

  it('opened: the list is on the page and shown', () => {
    const out = html(two, false, 'open');
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('Nutella');
    expect(out).toMatch(/<div class="cat-body" id="[^"]+" data-open="true"><div class="cat-inner"><ul class="rows">/);
  });

  it('closed after having been opened: the list is STILL on the page (so its forms keep their state), only hidden', () => {
    const out = html(two, false, 'closed');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Nutella');
    expect(out).toContain('Lotus');
    expect(out).toMatch(/<div class="cat-body" id="[^"]+" data-open="false">/);
    expect(out).not.toContain('hidden=""'); // folded to zero height by the style, not taken out with display: none (that cannot slide)
  });

  it('never opened: nothing of the list is built (the page stays light)', () => {
    const out = html(two, false, 'never');
    expect(out).not.toContain('Nutella');
    expect(out).not.toContain('cat-body');
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
    expect(block).toMatch(/\.cat-arrow, \.cat-body \{ transition: none; \}/);
    expect(block).toMatch(/\.cat-body\[data-open="true"\][^{]*\{ animation: none; \}/);
  });
  const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it('closed: zero height and invisible (so nothing inside can be tabbed to), and it slides on the way shut', () => {
    const r = rule('.cat-body');
    expect(r).toMatch(/grid-template-rows:\s*0fr/);
    expect(r).toMatch(/visibility:\s*hidden/);
    expect(r).toMatch(/transition:\s*grid-template-rows \.45s[^;]*visibility 0s \.45s/); // hidden only AFTER the slide is over
  });
  it('open: full height, visible at once, and the SAME transition as closing (so it can turn round half way, which an animation cannot)', () => {
    const r = rule('.cat-body[data-open="true"]');
    expect(r).toMatch(/grid-template-rows:\s*1fr/);
    expect(r).toMatch(/visibility:\s*visible/);
    expect(r).toMatch(/transition:\s*grid-template-rows \.45s[^;]*visibility 0s;/);
    expect(r).not.toContain('animation'); // an animation would start from zero again when the arrow is pressed during the closing slide
    expect(css).not.toContain('@keyframes cat-open');
  });
  it('the content is clipped while it slides', () => {
    expect(rule('.cat-inner')).toMatch(/min-height:\s*0/);
    expect(rule('.cat-inner')).toMatch(/overflow:\s*hidden/);
  });
  it('the products rise one after the other (each opening), "backwards" not "both", and never with transform', () => {
    const rise = css.match(/\.cat-body\[data-open="true"\] \.rows > li[^{]*\{([^}]*)\}/)![1];
    expect(rise).toMatch(/animation:\s*cat-rise [^;]*backwards;/);
    expect(rise).not.toContain('both');
    expect(rise).toMatch(/animation-delay:\s*calc\(var\(--n, 0\) \* 70ms/);
    expect(css).toMatch(/@keyframes cat-rise \{ from \{ opacity: 0; translate: 0 14px; \} to \{ opacity: 1; translate: 0 0; \} \}/);
    expect(css).not.toMatch(/@keyframes cat-(?:open|rise)[^\n]*transform/);
    for (const n of [2, 3, 4, 5, 6, 7]) expect(css).toContain(`.cat-body .rows > li:nth-child(${n}) { --n: ${n - 1}; }`);
    expect(css).toContain('.cat-body .rows > li:nth-child(n + 8) { --n: 7; }'); // the 8th and after come together
  });
  it('the add form and the empty note rise too', () => {
    expect(css).toMatch(/\.cat-body\[data-open="true"\] \.item-form, \.cat-body\[data-open="true"\] \.empty \{/);
  });
  it('the title line is tall enough to tap', () => {
    expect(css).toMatch(/\.cat-toggle \{[^}]*min-height: 44px/);
  });
});
