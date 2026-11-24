import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SettingsForm from '../src/components/SettingsForm';
import { MAX_LOCATIONS } from '../src/lib/locations';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const restaurant = (locations: { name: string; map_url: string }[]) => ({
  name: 'Alpha', currencies: 'USD' as const, phone_number: null, instagram_url: null, facebook_url: null, tiktok_url: null,
  menu_direction: 'rtl' as const, locations,
});
const html = (locations: { name: string; map_url: string }[], disabled = false) =>
  renderToStaticMarkup(createElement(SettingsForm, { restaurant: restaurant(locations), disabled }));

describe('the branches part of the settings page (what the server sends)', () => {
  it('no branch yet: a short note and the add button (no empty row to fill)', () => {
    const out = html([]);
    expect(out).toContain('لم تضف أي فرع بعد');
    expect(out).toContain('+ إضافة فرع');
    expect(out).not.toContain('branch-row');
  });

  it('one row per saved branch, with its name and link filled in and a delete button that says which branch', () => {
    const out = html([{ name: 'فرع الحمرا', map_url: 'https://maps.app.goo.gl/a' }, { name: 'فرع جونية', map_url: 'https://maps.app.goo.gl/b' }]);
    expect(out.match(/class="branch-row"/g)).toHaveLength(2);
    expect(out).toContain('value="فرع الحمرا"');
    expect(out).toContain('value="https://maps.app.goo.gl/b"');
    expect(out).toContain('aria-label="حذف الفرع 1"');
    expect(out).toContain('aria-label="حذف الفرع 2"');
    expect(out).not.toContain('لم تضف أي فرع بعد');
  });

  it('the map link is typed left to right, and the old single map field is gone', () => {
    const out = html([{ name: 'x', map_url: 'https://maps.app.goo.gl/a' }]);
    expect(out).toMatch(/dir="ltr"[^>]*placeholder="https:\/\/maps\.app\.goo\.gl\/\.\.\."/);
    expect(out).not.toContain('name="mapUrl"');
  });

  it('the add button is switched off at the limit, and not before', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `B${i}`, map_url: 'https://maps.app.goo.gl/a' }));
    const add = (out: string) => out.match(/<button[^>]*>\s*\+ إضافة فرع/)![0];
    expect(add(html(many(MAX_LOCATIONS - 1)))).not.toContain('disabled');
    expect(add(html(many(MAX_LOCATIONS)))).toContain('disabled');
  });
});

describe('the branches list style', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  it('the list opens beside the icon and can be tapped even though the icons column ignores taps while closed', () => {
    const r = rule('.pm-branches');
    expect(r).toMatch(/position:\s*absolute/);
    expect(r).toMatch(/inset-inline-end:\s*calc\(100% \+ 10px\)/);
    expect(r).toMatch(/pointer-events:\s*auto/);
  });

  it('it never uses transform to hide or show (the same rule as the other floating parts)', () => {
    expect(rule('.pm-branches')).not.toMatch(/transform/);
    expect(rule('.pm-branch-wrap')).not.toMatch(/transform/);
  });

  it('its animation is switched off for people who asked for less motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)![0];
    expect(block).toMatch(/\.pm-branches[^{]*\{ animation: none; \}|\.pm-branches\s*\{\s*animation:\s*none/);
  });

  it('every branch link is big enough to tap', () => {
    expect(rule('.pm-branches a')).toMatch(/padding:\s*12px/);
  });
});
