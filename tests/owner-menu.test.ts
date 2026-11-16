import { describe, expect, it } from 'vitest';
import { add, makeDb } from './helpers';
import { checkOwnerRequest } from '../src/lib/owner-guard';
import { parseFacebook, parseInstagram, parseMapUrl, parsePhone } from '../src/lib/owner-input';
import {
  MAX_CATEGORIES, SUSPENDED_MESSAGE, createCategory, deleteCategory, getOwnerRestaurant, listCategories, moveCategory,
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
  it('Instagram: account name or a profile link, rebuilt in one safe shape', () => {
    expect(parseInstagram('@shaar.crepe')).toEqual({ ok: true, value: 'https://www.instagram.com/shaar.crepe' });
    expect(parseInstagram('shaar_crepe')).toEqual({ ok: true, value: 'https://www.instagram.com/shaar_crepe' });
    // tracking parameters and the trailing slash are dropped
    expect(parseInstagram('https://instagram.com/shaar.crepe/?igsh=abc&hl=en')).toEqual({ ok: true, value: 'https://www.instagram.com/shaar.crepe' });
    expect(parseInstagram('  ')).toEqual({ ok: true, value: null });
  });
  it('Instagram: refuses other sites, posts, login pages and redirect pages', () => {
    for (const bad of [
      'https://evil.com/instagram.com', 'https://instagram.com.evil.com/x', 'http://instagram.com/x', 'javascript:alert(1)',
      'https://facebook.com/x', 'a b', 'x'.repeat(31), 'https://www.instagram.com/p/Cabc123/', 'https://www.instagram.com/accounts/login',
      'https://l.instagram.com/?u=https%3A%2F%2Fevil.com', 'https://www.instagram.com/a/b', 'https://www.instagram.com/', 'explore', '@p',
      'https://user:pw@instagram.com/x',
    ]) {
      expect(parseInstagram(bad).ok, bad).toBe(false);
    }
  });
  it('Facebook: page name or a page link, rebuilt in one safe shape', () => {
    expect(parseFacebook('shaarcrepe')).toEqual({ ok: true, value: 'https://www.facebook.com/shaarcrepe' });
    expect(parseFacebook('https://fb.me/shaarcrepe')).toEqual({ ok: true, value: 'https://www.facebook.com/shaarcrepe' });
    expect(parseFacebook('https://m.facebook.com/shaarcrepe/?ref=x')).toEqual({ ok: true, value: 'https://www.facebook.com/shaarcrepe' });
    expect(parseFacebook('https://www.facebook.com/profile.php?id=100012345678901&sk=about')).toEqual({ ok: true, value: 'https://www.facebook.com/profile.php?id=100012345678901' });
    expect(parseFacebook('https://www.facebook.com/p/Shaar-Crepe-100012345678901/')).toEqual({ ok: true, value: 'https://www.facebook.com/p/Shaar-Crepe-100012345678901' });
    expect(parseFacebook('https://www.facebook.com/people/Shaar-Crepe/100012345678901/')).toEqual({ ok: true, value: 'https://www.facebook.com/people/Shaar-Crepe/100012345678901' });
  });
  it('Facebook: refuses other sites and the redirect, share and login pages', () => {
    for (const bad of [
      'https://instagram.com/x', 'https://facebook.com.evil.com', 'http://facebook.com/x', 'abc',
      'https://www.facebook.com/l.php?u=https%3A%2F%2Fevil.com', 'https://www.facebook.com/sharer/sharer.php?u=x',
      'https://www.facebook.com/login.php', 'https://l.facebook.com/l.php?u=x', 'https://www.facebook.com/profile.php?id=abc',
      'https://www.facebook.com/profile.php', 'https://www.facebook.com/dialog/share', 'l.php', 'https://www.facebook.com/',
      'https://www.facebook.com/' + 'م'.repeat(60),
    ]) {
      expect(parseFacebook(bad).ok, bad).toBe(false);
    }
  });
});

describe('parseMapUrl', () => {
  it('accepts real map pages only', () => {
    for (const good of [
      'https://maps.app.goo.gl/abc123', 'https://www.google.com/maps/place/Shaar+Crepe/@33.89,35.5,17z', 'https://google.com.lb/maps?q=33.89,35.5',
      'https://maps.google.com/?q=33.89,35.5', 'https://goo.gl/maps/xyz', 'https://waze.com/ul?ll=33.89,35.5', 'https://ul.waze.com/ul?ll=1,2',
      'https://maps.apple.com/?ll=33.89,35.5'
    ]) {
      expect(parseMapUrl(good).ok, good).toBe(true);
    }
    expect(parseMapUrl('')).toEqual({ ok: true, value: null });
  });
  it('refuses everything else: other sites, redirects, tricks', () => {
    for (const bad of [
      'http://maps.google.com/x', 'javascript:alert(1)', 'https://user:pw@maps.google.com', 'not a url', 'https://localhost/x',
      'https://evil.com', 'https://evil.com/maps', 'https://www.google.com/url?q=https://evil.com', 'https://www.google.com/search?q=x',
      'https://maps.google.com.evil.com/x', 'https://goo.gl/abc', 'https://google.com.evil.com/maps', 'https://notwaze.com/ul', 'https://google.abc.de/maps', 'https://www.google.ch/maps?q=1,2', 'https://www.google.ev.il/maps', 'https://google.xyz/maps',
      'https://maps.app.goo.gl.evil.com/x', 'https://maps.app.goo.gl/' + 'a'.repeat(600),
    ]) {
      expect(parseMapUrl(bad).ok, bad).toBe(false);
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

describe('a suspended restaurant cannot change anything', () => {
  async function suspended() {
    const ctx = await setup();
    await createCategory(ctx.pg, ctx.a.ownerId, 'First');
    await createCategory(ctx.pg, ctx.a.ownerId, 'Second');
    await createCategory(ctx.pg, ctx.b.ownerId, 'Other restaurant');
    const [first, second] = await listCategories(ctx.pg, ctx.a.ownerId);
    await ctx.pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [ctx.a.restaurantId]);
    return { ...ctx, first, second };
  }
  const refused = { ok: false, status: 403, error: SUSPENDED_MESSAGE };

  it('every write is refused with the same clear 403', async () => {
    const { pg, a, first, second } = await suspended();
    expect(await saveSettings(pg, a.ownerId, settings({ name: 'Changed', currencies: 'BOTH' }))).toEqual(refused);
    expect(await createCategory(pg, a.ownerId, 'New')).toEqual(refused);
    expect(await renameCategory(pg, a.ownerId, first.id, 'Renamed')).toEqual(refused);
    expect(await moveCategory(pg, a.ownerId, second.id, 'up')).toEqual(refused);
    expect(await moveCategory(pg, a.ownerId, first.id, 'up')).toEqual(refused); // even a move that would change nothing
    expect(await deleteCategory(pg, a.ownerId, first.id)).toEqual(refused);
  });

  it('and nothing in the database changed', async () => {
    const { pg, a } = await suspended();
    await saveSettings(pg, a.ownerId, settings({ name: 'Changed' }));
    await createCategory(pg, a.ownerId, 'New');
    const [first, second] = await listCategories(pg, a.ownerId);
    await renameCategory(pg, a.ownerId, first.id, 'Renamed');
    await moveCategory(pg, a.ownerId, second.id, 'up');
    await deleteCategory(pg, a.ownerId, first.id);
    expect((await listCategories(pg, a.ownerId)).map((c) => c.name)).toEqual(['First', 'Second']);
    expect((await getOwnerRestaurant(pg, a.ownerId))!.name).toBe('Some restaurant');
  });

  it('he can still look at everything', async () => {
    const { pg, a } = await suspended();
    expect(await listCategories(pg, a.ownerId)).toHaveLength(2);
    expect(await getOwnerRestaurant(pg, a.ownerId)).toMatchObject({ status: 'suspended' });
  });

  it('other restaurants are not affected', async () => {
    const { pg, b } = await suspended();
    expect(await createCategory(pg, b.ownerId, 'Still works')).toEqual({ ok: true });
    expect(await saveSettings(pg, b.ownerId, settings({ name: 'Beta renamed' }))).toEqual({ ok: true });
  });

  it('once the admin activates it again, everything works again', async () => {
    const { pg, a, first } = await suspended();
    await pg.query(`UPDATE restaurants SET status = 'active' WHERE id = $1`, [a.restaurantId]);
    expect(await renameCategory(pg, a.ownerId, first.id, 'Renamed')).toEqual({ ok: true });
    expect(await createCategory(pg, a.ownerId, 'New')).toEqual({ ok: true });
    expect(await saveSettings(pg, a.ownerId, settings({ name: 'Back' }))).toEqual({ ok: true });
  });

  it('suspended and also a wrong category id: still the suspended message (nothing is revealed)', async () => {
    const { pg, a } = await suspended();
    expect(await deleteCategory(pg, a.ownerId, '11111111-1111-4111-8111-111111111111')).toEqual(refused);
  });
});
