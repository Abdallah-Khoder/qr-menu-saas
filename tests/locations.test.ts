import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../scripts/migrate-lib.mjs';
import { TEST_BLOB_HOST, add, count, makeDb } from './helpers';
import BranchesList from '../src/components/BranchesList';
import FloatingContacts from '../src/components/FloatingContacts';
import { contactLinks } from '../src/lib/contact-links';
import { MAX_LOCATIONS } from '../src/lib/locations';
import { createCategory } from '../src/lib/owner-menu';
import { getOwnerRestaurant, saveSettings } from '../src/lib/owner-menu';
import { getPublicMenu } from '../src/lib/public-menu';

// Several branches per restaurant: each has a name and a map link, the owner edits the list in the settings,
// and the public menu shows ONE map icon (a list of branches when there are two or more).
beforeEach(() => vi.stubEnv('BLOB_PUBLIC_HOST', TEST_BLOB_HOST));
afterEach(() => vi.unstubAllEnvs());

const MAP1 = 'https://maps.app.goo.gl/one';
const MAP2 = 'https://www.google.com/maps/place/Two';
const MAP3 = 'https://maps.app.goo.gl/three';
const base = { name: 'Alpha', currencies: 'USD' as const, phone: '', instagram: '', facebook: '', tiktok: '' };
const branch = (name: string, mapUrl: string) => ({ name, mapUrl });

async function setup() {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  return { pg, a, b };
}
type Pg = Awaited<ReturnType<typeof makeDb>>;
const saved = async (pg: Pg, ownerId: string) => (await getOwnerRestaurant(pg, ownerId))!.locations;
const publicLocations = async (pg: Pg, slug = 'alpha-k3x9qp7vtz') => {
  const r = await getPublicMenu(pg, slug);
  if (r.state !== 'ok') throw new Error(`expected a menu, got ${r.state}`);
  return r.menu.locations;
};

describe('saving the branches in the settings', () => {
  it('a new restaurant has none', async () => {
    const { pg, a } = await setup();
    expect(await saved(pg, a.ownerId)).toEqual([]);
  });

  it('saves several branches in the owner order, trimmed, together with the other settings', async () => {
    const { pg, a } = await setup();
    const out = await saveSettings(pg, a.ownerId, { ...base, name: 'Renamed', locations: [branch('  فرع بيروت ', ` ${MAP2} `), branch('Tripoli', MAP1), branch('Saida', MAP3)] });
    expect(out).toEqual({ ok: true });
    const r = await getOwnerRestaurant(pg, a.ownerId);
    expect(r!.name).toBe('Renamed');
    expect(r!.locations).toEqual([
      { name: 'فرع بيروت', map_url: MAP2 }, { name: 'Tripoli', map_url: MAP1 }, { name: 'Saida', map_url: MAP3 },
    ]);
  });

  it('saving again replaces the whole list (a removed branch is really gone, the order follows the new list)', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('One', MAP1), branch('Two', MAP2)] });
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Three', MAP3), branch('One', MAP1)] });
    expect((await saved(pg, a.ownerId)).map((l) => l.name)).toEqual(['Three', 'One']);
    expect(await count(pg, 'restaurant_locations')).toBe(2);
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Only', MAP2)] });
    expect(await saved(pg, a.ownerId)).toEqual([{ name: 'Only', map_url: MAP2 }]);
    expect(await count(pg, 'restaurant_locations')).toBe(1);
  });

  it('an empty list removes them all, but leaving the field out changes nothing (an old settings page still saves)', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('One', MAP1), branch('Two', MAP2)] });
    expect(await saveSettings(pg, a.ownerId, { ...base, name: 'No branches field' })).toEqual({ ok: true });
    expect((await saved(pg, a.ownerId)).map((l) => l.name)).toEqual(['One', 'Two']);
    expect(await saveSettings(pg, a.ownerId, { ...base, locations: [] })).toEqual({ ok: true });
    expect(await saved(pg, a.ownerId)).toEqual([]);
    expect(await count(pg, 'restaurant_locations')).toBe(0);
  });

  it('rows the owner left completely blank are ignored (he pressed "add" and changed his mind)', async () => {
    const { pg, a } = await setup();
    const out = await saveSettings(pg, a.ownerId, { ...base, locations: [branch('', ''), branch('One', MAP1), branch('  ', '  ')] });
    expect(out).toEqual({ ok: true });
    expect(await saved(pg, a.ownerId)).toEqual([{ name: 'One', map_url: MAP1 }]);
  });

  it('the same restaurant may have two branches with the same name or the same link (nothing to be gained by refusing)', async () => {
    const { pg, a } = await setup();
    expect(await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Main', MAP1), branch('Main', MAP1)] })).toEqual({ ok: true });
    expect(await saved(pg, a.ownerId)).toHaveLength(2);
  });

  it(`at most ${MAX_LOCATIONS} branches`, async () => {
    const { pg, a } = await setup();
    const many = (n: number) => Array.from({ length: n }, (_, i) => branch(`Branch ${i + 1}`, MAP1));
    expect(await saveSettings(pg, a.ownerId, { ...base, locations: many(MAX_LOCATIONS) })).toEqual({ ok: true });
    expect(await saved(pg, a.ownerId)).toHaveLength(MAX_LOCATIONS);
    const out = await saveSettings(pg, a.ownerId, { ...base, name: 'Too many', locations: many(MAX_LOCATIONS + 1) });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect(await saved(pg, a.ownerId)).toHaveLength(MAX_LOCATIONS); // unchanged
    expect((await getOwnerRestaurant(pg, a.ownerId))!.name).not.toBe('Too many');
  });

  it('every refusal is a 400 that names the row, and nothing at all is saved (not even the other settings)', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Keep', MAP1)] });
    const bad: [string, { name: string; mapUrl: string }[], string][] = [
      ['plain http link', [branch('One', MAP1), branch('Two', 'http://maps.google.com/x')], 'الفرع رقم 2'],
      ['javascript link', [branch('One', 'javascript:alert(1)')], 'الفرع رقم 1'],
      ['a stranger\'s website', [branch('One', 'https://evil.com/maps')], 'الفرع رقم 1'],
      ['no link', [branch('One', '')], 'الفرع رقم 1'],
      ['no name', [branch('One', MAP1), branch('One', MAP1), branch('', MAP2)], 'الفرع رقم 3'],
      ['name with emoji', [branch('🍕', MAP1)], 'الفرع رقم 1'],
      ['name too long', [branch('x'.repeat(81), MAP1)], 'الفرع رقم 1'],
    ];
    for (const [why, locations, row] of bad) {
      const out = await saveSettings(pg, a.ownerId, { ...base, name: 'Changed', locations });
      expect(out, why).toMatchObject({ ok: false, status: 400 });
      expect((out as { error: string }).error, why).toContain(row);
    }
    const r = await getOwnerRestaurant(pg, a.ownerId);
    expect(r!.name).toBe('Alpha'); // the name of the first, good save
    expect(r!.locations).toEqual([{ name: 'Keep', map_url: MAP1 }]);
  });

  it('the error names the row as the owner SEES it on the page, even when blank rows above it were ignored', async () => {
    const { pg, a } = await setup();
    const say = async (locations: { name: string; mapUrl: string }[]) => {
      const out = await saveSettings(pg, a.ownerId, { ...base, locations });
      expect(out).toMatchObject({ ok: false, status: 400 });
      return (out as { error: string }).error;
    };
    expect(await say([branch('', ''), branch('Named, no link', '')])).toContain('الفرع رقم 2:');
    expect(await say([branch('One', MAP1), branch(' ', ' '), branch('', 'http://bad.example.com')])).toContain('الفرع رقم 3:');
    expect(await say([branch('', ''), branch('', ''), branch('🍕', MAP1)])).toContain('الفرع رقم 3:');
  });

  it('the saved order has no gaps, whatever blank rows were between the branches', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('', ''), branch('A', MAP1), branch('', ''), branch('', ''), branch('B', MAP2)] });
    const rows = (await pg.query(`SELECT name, sort_order FROM restaurant_locations ORDER BY sort_order`)).rows;
    expect(rows).toEqual([{ name: 'A', sort_order: 0 }, { name: 'B', sort_order: 1 }]);
  });

  it('a refused currency change (409) leaves the branches as they were', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Keep', MAP1)] });
    const cat = await add.category(pg, a.restaurantId);
    await add.item(pg, a.restaurantId, cat, '3.50'); // a dollar price only
    const out = await saveSettings(pg, a.ownerId, { ...base, currencies: 'BOTH', locations: [branch('New', MAP2), branch('Newer', MAP3)] });
    expect(out).toMatchObject({ ok: false, status: 409 });
    expect(await saved(pg, a.ownerId)).toEqual([{ name: 'Keep', map_url: MAP1 }]);
  });

  it('an owner never touches the branches of another restaurant', async () => {
    const { pg, a, b } = await setup();
    await saveSettings(pg, b.ownerId, { ...base, name: 'Beta', locations: [branch('Beta branch', MAP3)] });
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('One', MAP1)] });
    await saveSettings(pg, a.ownerId, { ...base, locations: [] });
    expect(await saved(pg, b.ownerId)).toEqual([{ name: 'Beta branch', map_url: MAP3 }]);
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Again', MAP1)] });
    expect(await saved(pg, b.ownerId)).toEqual([{ name: 'Beta branch', map_url: MAP3 }]);
  });

  it('a suspended restaurant cannot change its branches (403) and they stay as they were', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Keep', MAP1)] });
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    for (const locations of [[branch('New', MAP2)], []]) {
      expect(await saveSettings(pg, a.ownerId, { ...base, locations })).toMatchObject({ ok: false, status: 403 });
    }
    expect(await saved(pg, a.ownerId)).toEqual([{ name: 'Keep', map_url: MAP1 }]); // he can still see them
  });

  it('an owner without a restaurant gets 404 and no row is created', async () => {
    const { pg } = await setup();
    const lonely = await add.owner(pg, 'lonely@example.com');
    expect(await saveSettings(pg, lonely, { ...base, locations: [branch('One', MAP1)] })).toMatchObject({ ok: false, status: 404 });
    expect(await count(pg, 'restaurant_locations')).toBe(0);
  });
});

describe('the public menu gets the branches from the same single query', () => {
  it('in the owner order, with only name and link', async () => {
    const { pg, a } = await setup();
    // an order that is neither A to Z nor Z to A nor the link order, so only the owner's own order passes
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('M first', MAP2), branch('Z second', MAP3), branch('A third', MAP1)] });
    expect(await publicLocations(pg)).toEqual([{ name: 'M first', url: MAP2 }, { name: 'Z second', url: MAP3 }, { name: 'A third', url: MAP1 }]);
  });

  it('another restaurant\'s branches never show up', async () => {
    const { pg, a, b } = await setup();
    await saveSettings(pg, b.ownerId, { ...base, locations: [branch('Beta', MAP3)] });
    expect(await publicLocations(pg)).toEqual([]);
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Alpha', MAP1)] });
    expect(await publicLocations(pg)).toEqual([{ name: 'Alpha', url: MAP1 }]);
    expect(await publicLocations(pg, 'beta-k3x9qp7vtz')).toEqual([{ name: 'Beta', url: MAP3 }]);
  });

  it('a suspended restaurant shows no menu at all, so no branches either', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Alpha', MAP1)] });
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    expect(await getPublicMenu(pg, 'alpha-k3x9qp7vtz')).toEqual({ state: 'unavailable' });
  });

  it('and the query itself already leaves them out (the answer of the database is checked, not only what the code does with it)', async () => {
    const { pg, a } = await setup();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('Alpha', MAP1)] });
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    let rows: { locations: unknown }[] = [];
    const spy = { query: async (text: string, params?: unknown[]) => { const r = await pg.query(text, params as never); rows = r.rows as never; return r; } };
    await getPublicMenu(spy as never, 'alpha-k3x9qp7vtz');
    expect(rows).toHaveLength(1);
    expect(rows[0].locations).toEqual([]);
  });

  it('is still ONE database query for the whole page (branches included)', async () => {
    const { pg, a } = await setup();
    await createCategory(pg, a.ownerId, 'Burgers');
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('One', MAP1), branch('Two', MAP2)] });
    let queries = 0;
    const counting = { query: (text: string, params?: unknown[]) => { queries++; return pg.query(text, params as never); } };
    const r = await getPublicMenu(counting as never, 'alpha-k3x9qp7vtz');
    expect(r.state).toBe('ok');
    expect(queries).toBe(1);
  });
});

describe('the database itself guards the branches', () => {
  it('https map links only, at most 500 characters, a name of 1 to 80 characters', async () => {
    const { pg, a } = await setup();
    const insert = (name: string, url: string) =>
      pg.query(`INSERT INTO restaurant_locations (restaurant_id, name, map_url) VALUES ($1, $2, $3)`, [a.restaurantId, name, url]);
    await insert('ok', 'https://maps.example.com/x');
    await expect(insert('x', 'http://maps.example.com/x')).rejects.toThrow();
    await expect(insert('x', 'javascript:alert(1)')).rejects.toThrow();
    await expect(insert('x', 'https://maps.example.com/' + 'a'.repeat(500))).rejects.toThrow();
    await expect(insert('', 'https://maps.example.com/x')).rejects.toThrow();
    await expect(insert('   ', 'https://maps.example.com/x')).rejects.toThrow();
    await expect(insert('x'.repeat(81), 'https://maps.example.com/x')).rejects.toThrow();
    await insert('x'.repeat(80), 'https://maps.example.com/' + 'a'.repeat(400));
    await expect(pg.query(`INSERT INTO restaurant_locations (restaurant_id, name, map_url, sort_order) VALUES ($1, 'x', 'https://a.b/c', -1)`, [a.restaurantId])).rejects.toThrow();
    expect(await count(pg, 'restaurant_locations')).toBe(2);
  });

  it('a branch needs a restaurant, and goes away with it', async () => {
    const { pg, a, b } = await setup();
    await expect(pg.query(`INSERT INTO restaurant_locations (restaurant_id, name, map_url) VALUES (gen_random_uuid(), 'x', 'https://a.b/c')`)).rejects.toThrow();
    await saveSettings(pg, a.ownerId, { ...base, locations: [branch('One', MAP1)] });
    await saveSettings(pg, b.ownerId, { ...base, locations: [branch('Two', MAP2)] });
    await pg.query(`DELETE FROM restaurants WHERE id = $1`, [a.restaurantId]);
    expect(await count(pg, 'restaurant_locations')).toBe(1);
    await pg.query(`DELETE FROM users WHERE id = $1`, [b.ownerId]); // the owner's whole account
    expect(await count(pg, 'restaurant_locations')).toBe(0);
  });
});

describe('migration 010 keeps the map link every restaurant already had', () => {
  it('turns each old map_url into one branch called "الفرع الرئيسي", and leaves restaurants without one alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    const all = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
    const last = '010_locations.sql';
    expect(all.at(-1)).toBe(last);
    for (const f of all.filter((f) => f !== last)) copyFileSync(join('db/migrations', f), join(dir, f));
    const pg = new PGlite();
    await migrate(pg, dir); // the database as it is on production today
    const withMap = await add.tenant(pg, 'with');
    const without = await add.tenant(pg, 'without');
    const tooLong = await add.tenant(pg, 'long');
    await pg.query(`UPDATE restaurants SET map_url = $2 WHERE id = $1`, [withMap.restaurantId, MAP1]);
    await pg.query(`UPDATE restaurants SET map_url = $2 WHERE id = $1`, [tooLong.restaurantId, 'https://maps.example.com/' + 'a'.repeat(475)]);
    expect((await pg.query(`SELECT length(map_url) AS n FROM restaurants WHERE id = $1`, [tooLong.restaurantId])).rows[0]).toEqual({ n: 500 });
    copyFileSync(join('db/migrations', last), join(dir, last));
    await migrate(pg, dir);
    const rows = (await pg.query<{ restaurant_id: string; name: string; map_url: string; sort_order: number }>(`SELECT restaurant_id, name, map_url, sort_order FROM restaurant_locations`)).rows;
    expect(rows.filter((r) => r.restaurant_id === withMap.restaurantId)).toEqual([{ restaurant_id: withMap.restaurantId, name: 'الفرع الرئيسي', map_url: MAP1, sort_order: 0 }]);
    expect(rows.some((r) => r.restaurant_id === without.restaurantId)).toBe(false);
    expect(rows.filter((r) => r.restaurant_id === tooLong.restaurantId)).toHaveLength(1); // exactly 500 characters still fits
  });
});

describe('migration 010 does not drop a long map link silently', () => {
  const longLink = 'https://maps.example.com/' + 'a'.repeat(476); // 501 characters
  async function oldDatabase() {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    const all = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
    for (const f of all.filter((f) => f !== '010_locations.sql')) copyFileSync(join('db/migrations', f), join(dir, f));
    const pg = new PGlite();
    await migrate(pg, dir);
    copyFileSync(join('db/migrations', '010_locations.sql'), join(dir, '010_locations.sql'));
    return { pg, dir };
  }

  it('it stops, names the restaurants, and changes nothing at all', async () => {
    const { pg, dir } = await oldDatabase();
    const fine = await add.tenant(pg, 'fine');
    const long1 = await add.tenant(pg, 'longone');
    await add.tenant(pg, 'longtwo');
    await pg.query(`UPDATE restaurants SET map_url = $2 WHERE id = $1`, [fine.restaurantId, MAP1]);
    await pg.query(`UPDATE restaurants SET map_url = $1 WHERE public_slug IN ('longone-k3x9qp7vtz', 'longtwo-k3x9qp7vtz')`, [longLink]);
    await expect(migrate(pg, dir)).rejects.toThrow(/longer than 500 characters for: .*longone-k3x9qp7vtz.*longtwo-k3x9qp7vtz/);
    expect((await pg.query(`SELECT to_regclass('restaurant_locations') AS t`)).rows[0]).toEqual({ t: null }); // rolled back: no table
    expect((await pg.query(`SELECT count(*)::int AS n FROM schema_migrations WHERE filename = '010_locations.sql'`)).rows[0]).toEqual({ n: 0 });
    // after someone shortens the links, the same migration goes through and keeps every link
    await pg.query(`UPDATE restaurants SET map_url = $1 WHERE public_slug IN ('longone-k3x9qp7vtz', 'longtwo-k3x9qp7vtz')`, [MAP3]);
    await migrate(pg, dir);
    expect((await pg.query(`SELECT count(*)::int AS n FROM restaurant_locations`)).rows[0]).toEqual({ n: 3 });
    expect(long1.restaurantId).toBeTruthy();
  });
});

describe('the map icon on the public menu', () => {
  const none = { phone: null, instagram: null, facebook: null, tiktok: null };
  const map = (locations: { name: string; url: string }[]) => contactLinks({ ...none, locations });

  it('no branches: no map icon. One branch: a plain link to its map (as before)', () => {
    expect(map([])).toEqual([]);
    expect(map([{ name: 'Main', url: MAP1 }])).toEqual([{ href: MAP1, label: 'الموقع على الخريطة', icon: 'map' }]);
  });

  it('two or more: still ONE map icon, but it carries the list of branches instead of a link', () => {
    const links = map([{ name: 'Beirut', url: MAP1 }, { name: 'Tripoli', url: MAP2 }]);
    expect(links).toEqual([{ branches: [{ name: 'Beirut', href: MAP1 }, { name: 'Tripoli', href: MAP2 }], label: 'الفروع على الخريطة', icon: 'map' }]);
    expect(links[0]).not.toHaveProperty('href');
  });

  it('the page sends a button (closed) when there are several branches, and a normal link when there is one', () => {
    const several = renderToStaticMarkup(createElement(FloatingContacts, { links: map([{ name: 'Beirut', url: MAP1 }, { name: 'Tripoli', url: MAP2 }]) }));
    expect(several).toContain('aria-expanded="false"');
    expect(several).toContain('aria-controls="pm-branches"');
    expect(several).toContain('aria-label="الفروع على الخريطة"');
    expect(several).not.toContain('id="pm-branches"'); // the list itself is not on the page until it is opened
    expect(several).not.toContain('Beirut');
    const one = renderToStaticMarkup(createElement(FloatingContacts, { links: map([{ name: 'Main', url: MAP1 }]) }));
    expect(one).toContain(`href="${MAP1}"`);
    expect(one).not.toContain('aria-controls="pm-branches"');
  });

  it('the opened list: a title, one link per branch, each opening that branch\'s map in a new tab safely', () => {
    const html = renderToStaticMarkup(createElement(BranchesList, { label: 'الفروع على الخريطة', branches: [{ name: 'Beirut', href: MAP1 }, { name: 'طرابلس', href: MAP2 }] }));
    expect(html).toContain('id="pm-branches"');
    expect(html).toContain('اختر الفرع');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain(`href="${MAP1}"`);
    expect(html).toContain(`href="${MAP2}"`);
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toContain('<bdi>طرابلس</bdi>');
  });

  it('a branch name is text, never markup', () => {
    const html = renderToStaticMarkup(createElement(BranchesList, { label: 'x', branches: [{ name: '<img src=x onerror=alert(1)>', href: MAP1 }] }));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
