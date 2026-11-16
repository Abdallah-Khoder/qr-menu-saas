import { describe, expect, it } from 'vitest';
import { add, makeDb } from './helpers';
import { checkOwnerRequest } from '../src/lib/owner-guard';
import { parseFacebook, parseInstagram, parseMapUrl, parsePhone } from '../src/lib/owner-input';
import {
  MAX_CATEGORIES, createCategory, deleteCategory, getOwnerRestaurant, listCategories, moveCategory,
  renameCategory, saveSettings,
} from '../src/lib/owner-menu';

const json = { 'content-type': 'application/json' };
const req = (headers: Record<string, string> = json) => new Request('http://x/api/owner/x', { method: 'POST', headers, body: '{}' });
const owner = { id: 'o', email: 'o@example.com', role: 'owner' as const };
const admin = { id: 'a', email: 'a@example.com', role: 'super_admin' as const };

describe('checkOwnerRequest', () => {
  it('lets an owner with a JSON request through', () => expect(checkOwnerRequest(req(), owner)).toBeNull());
  it('401 nobody, 403 super-admin (admins have no restaurant), 415 not JSON', () => {
    expect(checkOwnerRequest(req(), null)?.status).toBe(401);
    expect(checkOwnerRequest(req(), admin)?.status).toBe(403);
    expect(checkOwnerRequest(req({ 'content-type': 'text/plain; note=application/json' }), owner)?.status).toBe(415);
  });
});

describe('parsePhone', () => {
  it('accepts international and Lebanese local forms, Arabic digits too', () => {
    expect(parsePhone('+961 70 123 456')).toEqual({ ok: true, value: '+96170123456' });
    expect(parsePhone('0096170123456')).toEqual({ ok: true, value: '+96170123456' });
    expect(parsePhone('070-123-456')).toEqual({ ok: true, value: '+96170123456' });
    expect(parsePhone('٠٣ ١٢٣ ٤٥٦')).toEqual({ ok: true, value: '+9613123456' });
    expect(parsePhone('  ')).toEqual({ ok: true, value: null });
  });
  it('refuses nonsense', () => {
    for (const bad of ['abc', '123', '+0123456789', '70123456', '+961 70 12 34 56 78 90 12 34', '<script>']) {
      expect(parsePhone(bad).ok).toBe(false);
    }
  });
});

describe('social links', () => {
  it('Instagram: account name or the real link, nothing else', () => {
    expect(parseInstagram('@shaar.crepe')).toEqual({ ok: true, value: 'https://www.instagram.com/shaar.crepe' });
    expect(parseInstagram('shaar_crepe')).toEqual({ ok: true, value: 'https://www.instagram.com/shaar_crepe' });
    expect(parseInstagram('https://www.instagram.com/shaar.crepe/?hl=en')).toMatchObject({ ok: true });
    expect(parseInstagram('  ')).toEqual({ ok: true, value: null });
    for (const bad of ['https://evil.com/instagram.com', 'https://instagram.com.evil.com/x', 'http://instagram.com/x', 'javascript:alert(1)', 'https://facebook.com/x', 'a b', 'x'.repeat(31)]) {
      expect(parseInstagram(bad).ok).toBe(false);
    }
  });
  it('Facebook: page name or the real link, nothing else', () => {
    expect(parseFacebook('shaarcrepe')).toEqual({ ok: true, value: 'https://www.facebook.com/shaarcrepe' });
    expect(parseFacebook('https://fb.me/shaarcrepe')).toMatchObject({ ok: true });
    expect(parseFacebook('https://m.facebook.com/shaarcrepe')).toMatchObject({ ok: true });
    for (const bad of ['https://instagram.com/x', 'https://facebook.com.evil.com', 'http://facebook.com/x', 'abc']) {
      expect(parseFacebook(bad).ok).toBe(false);
    }
  });
});

describe('parseMapUrl', () => {
  it('accepts https links only', () => {
    expect(parseMapUrl('https://maps.app.goo.gl/abc123')).toEqual({ ok: true, value: 'https://maps.app.goo.gl/abc123' });
    expect(parseMapUrl('')).toEqual({ ok: true, value: null });
    for (const bad of ['http://maps.google.com/x', 'javascript:alert(1)', 'https://user:pw@maps.google.com', 'not a url', 'https://localhost/x', 'https://' + 'a'.repeat(600) + '.com']) {
      expect(parseMapUrl(bad).ok).toBe(false);
    }
  });
});

async function setup() {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  return { pg, a, b };
}
const settings = (over = {}) => ({ name: 'New name', currencies: 'USD' as const, phone: '', mapUrl: '', instagram: '', facebook: '', ...over });

describe('saveSettings', () => {
  it('saves name, currency, phone and map; the public link stays the same', async () => {
    const { pg, a } = await setup();
    const before = await getOwnerRestaurant(pg, a.ownerId);
    expect(await saveSettings(pg, a.ownerId, settings({ name: ' مطعم جديد ', currencies: 'BOTH', phone: '03 123 456', mapUrl: 'https://maps.app.goo.gl/x' }))).toEqual({ ok: true });
    const after = await getOwnerRestaurant(pg, a.ownerId);
    expect(after).toMatchObject({ name: 'مطعم جديد', currencies: 'BOTH', phone_number: '+9613123456', map_url: 'https://maps.app.goo.gl/x' });
    expect(after!.public_slug).toBe(before!.public_slug);
  });
  it('social links: each one optional, any combination, saved per restaurant', async () => {
    const { pg, a, b } = await setup();
    await saveSettings(pg, a.ownerId, settings({ instagram: '@alpha.food', facebook: '' }));
    await saveSettings(pg, b.ownerId, settings({ instagram: '', facebook: 'betafood' }));
    expect(await getOwnerRestaurant(pg, a.ownerId)).toMatchObject({ instagram_url: 'https://www.instagram.com/alpha.food', facebook_url: null });
    expect(await getOwnerRestaurant(pg, b.ownerId)).toMatchObject({ instagram_url: null, facebook_url: 'https://www.facebook.com/betafood' });
    await saveSettings(pg, a.ownerId, settings({ instagram: '', facebook: '' })); // can be removed again
    expect(await getOwnerRestaurant(pg, a.ownerId)).toMatchObject({ instagram_url: null, facebook_url: null });
    expect(await saveSettings(pg, a.ownerId, settings({ instagram: 'https://evil.com/x' }))).toMatchObject({ ok: false, status: 400 });
  });
  it('does not touch another restaurant', async () => {
    const { pg, a, b } = await setup();
    await saveSettings(pg, a.ownerId, settings({ name: 'Changed' }));
    expect((await getOwnerRestaurant(pg, b.ownerId))!.name).toBe('Some restaurant');
  });
  it('refuses bad input with 400 and changes nothing', async () => {
    const { pg, a } = await setup();
    for (const over of [{ name: '🍕' }, { name: '   ' }, { name: 'x'.repeat(81) }, { phone: 'abc' }, { mapUrl: 'http://x.com' }]) {
      const out = await saveSettings(pg, a.ownerId, settings(over));
      expect(out).toMatchObject({ ok: false, status: 400 });
    }
    expect((await getOwnerRestaurant(pg, a.ownerId))!.name).toBe('Some restaurant');
  });
  it('an owner without a restaurant gets 404', async () => {
    const { pg } = await setup();
    const lonely = await add.owner(pg, 'lonely@example.com');
    expect(await saveSettings(pg, lonely, settings())).toMatchObject({ ok: false, status: 404 });
  });
  it('currency: refused while an item has no price in it, allowed once complete', async () => {
    const { pg, a } = await setup();
    const cat = await add.category(pg, a.restaurantId);
    await add.item(pg, a.restaurantId, cat, '3.50'); // only a dollar price
    const out = await saveSettings(pg, a.ownerId, settings({ currencies: 'BOTH' }));
    expect(out).toMatchObject({ ok: false, status: 409 });
    expect((await getOwnerRestaurant(pg, a.ownerId))!.currencies).toBe('USD'); // unchanged
    // USD only is fine; LBP only is not (no lira price)
    expect(await saveSettings(pg, a.ownerId, settings({ currencies: 'LBP' }))).toMatchObject({ ok: false, status: 409 });
    await pg.query(`UPDATE items SET price_lbp = 300000`);
    expect(await saveSettings(pg, a.ownerId, settings({ currencies: 'BOTH' }))).toEqual({ ok: true });
  });
  it('currency: sizes count too, and switching to one currency keeps the other price stored', async () => {
    const { pg, a } = await setup();
    const cat = await add.category(pg, a.restaurantId);
    const item = await add.item(pg, a.restaurantId, cat, null);
    await add.size(pg, a.restaurantId, item, 'S', '2.00', '180000');
    await add.size(pg, a.restaurantId, item, 'L', '3.00', null); // large has no lira price
    expect(await saveSettings(pg, a.ownerId, settings({ currencies: 'BOTH' }))).toMatchObject({ ok: false, status: 409 });
    expect(await saveSettings(pg, a.ownerId, settings({ currencies: 'USD' }))).toEqual({ ok: true });
    expect((await pg.query(`SELECT count(*)::int AS n FROM item_sizes WHERE price_lbp IS NOT NULL`)).rows[0]).toEqual({ n: 1 });
  });
  it("another restaurant's missing prices do not block me", async () => {
    const { pg, a, b } = await setup();
    const cat = await add.category(pg, b.restaurantId);
    await add.item(pg, b.restaurantId, cat, '3.50');
    expect(await saveSettings(pg, a.ownerId, settings({ currencies: 'BOTH' }))).toEqual({ ok: true });
  });
});

describe('categories', () => {
  it('creates in order, lists with item counts', async () => {
    const { pg, a } = await setup();
    for (const n of ['مشروبات', 'Burgers', 'Desserts']) expect(await createCategory(pg, a.ownerId, n)).toEqual({ ok: true });
    const cats = await listCategories(pg, a.ownerId);
    expect(cats.map((c) => c.name)).toEqual(['مشروبات', 'Burgers', 'Desserts']);
    await add.item(pg, a.restaurantId, cats[1].id);
    await add.item(pg, a.restaurantId, cats[1].id);
    expect((await listCategories(pg, a.ownerId)).map((c) => c.item_count)).toEqual([0, 2, 0]);
  });
  it('refuses bad names and stops at the maximum', async () => {
    const { pg, a } = await setup();
    for (const n of ['', '  ', '🍕', 'x'.repeat(81)]) expect(await createCategory(pg, a.ownerId, n)).toMatchObject({ ok: false, status: 400 });
    for (let i = 0; i < MAX_CATEGORIES; i++) await createCategory(pg, a.ownerId, `Cat ${i}`);
    expect(await createCategory(pg, a.ownerId, 'One more')).toMatchObject({ ok: false, status: 409 });
    expect(await listCategories(pg, a.ownerId)).toHaveLength(MAX_CATEGORIES);
  });
  it('a restaurant only ever sees its own categories', async () => {
    const { pg, a, b } = await setup();
    await createCategory(pg, a.ownerId, 'Mine');
    await createCategory(pg, b.ownerId, 'Theirs');
    expect((await listCategories(pg, a.ownerId)).map((c) => c.name)).toEqual(['Mine']);
  });
  it("cannot rename, move or delete another restaurant's category (404, nothing changes)", async () => {
    const { pg, a, b } = await setup();
    await createCategory(pg, b.ownerId, 'Theirs');
    await createCategory(pg, b.ownerId, 'Theirs 2');
    const [t1] = await listCategories(pg, b.ownerId);
    expect(await renameCategory(pg, a.ownerId, t1.id, 'Hacked')).toMatchObject({ ok: false, status: 404 });
    expect(await moveCategory(pg, a.ownerId, t1.id, 'down')).toMatchObject({ ok: false, status: 404 });
    expect(await deleteCategory(pg, a.ownerId, t1.id)).toMatchObject({ ok: false, status: 404 });
    expect((await listCategories(pg, b.ownerId)).map((c) => c.name)).toEqual(['Theirs', 'Theirs 2']);
  });
  it('rename works; delete also deletes the items inside', async () => {
    const { pg, a } = await setup();
    await createCategory(pg, a.ownerId, 'Old');
    const [c] = await listCategories(pg, a.ownerId);
    expect(await renameCategory(pg, a.ownerId, c.id, '  New ')).toEqual({ ok: true });
    expect((await listCategories(pg, a.ownerId))[0].name).toBe('New');
    await add.item(pg, a.restaurantId, c.id);
    expect(await deleteCategory(pg, a.ownerId, c.id)).toEqual({ ok: true });
    expect(await listCategories(pg, a.ownerId)).toEqual([]);
    expect((await pg.query(`SELECT count(*)::int AS n FROM items`)).rows[0]).toEqual({ n: 0 });
  });
  it('moves up and down, and does nothing at the ends', async () => {
    const { pg, a } = await setup();
    for (const n of ['A', 'B', 'C']) await createCategory(pg, a.ownerId, n);
    const names = async () => (await listCategories(pg, a.ownerId)).map((c) => c.name).join('');
    const id = async (n: string) => (await listCategories(pg, a.ownerId)).find((c) => c.name === n)!.id;
    expect(await moveCategory(pg, a.ownerId, await id('C'), 'up')).toEqual({ ok: true });
    expect(await names()).toBe('ACB');
    await moveCategory(pg, a.ownerId, await id('A'), 'down');
    expect(await names()).toBe('CAB');
    await moveCategory(pg, a.ownerId, await id('C'), 'up'); // already first
    await moveCategory(pg, a.ownerId, await id('B'), 'down'); // already last
    expect(await names()).toBe('CAB');
  });
  it('moving works even when the order numbers have duplicates or gaps', async () => {
    const { pg, a } = await setup();
    for (const [n, o] of [['A', 5], ['B', 5], ['C', 40]] as const) {
      await pg.query(`INSERT INTO categories (restaurant_id, name, sort_order) VALUES ($1, $2, $3)`, [a.restaurantId, n, o]);
    }
    const before = (await listCategories(pg, a.ownerId)).map((c) => c.name);
    const second = (await listCategories(pg, a.ownerId))[1];
    await moveCategory(pg, a.ownerId, second.id, 'up');
    const after = (await listCategories(pg, a.ownerId)).map((c) => c.name);
    expect(after).toEqual([before[1], before[0], before[2]]);
  });
  it('two creates at the same moment both succeed', async () => {
    const { pg, a } = await setup();
    const out = await Promise.all(['X', 'Y', 'Z'].map((n) => createCategory(pg, a.ownerId, n)));
    expect(out.every((o) => o.ok)).toBe(true);
    expect(await listCategories(pg, a.ownerId)).toHaveLength(3);
  });
});
