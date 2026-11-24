import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_BLOB_HOST, add, makeDb, photoUrl } from './helpers';
import { PUBLIC_MENU_VERSION, getPublicMenu, whatsappUrl } from '../src/lib/public-menu';
import { createCategory, listCategories, saveSettings } from '../src/lib/owner-menu';
import { createItem, listItems, setItemAvailable, type ItemInput } from '../src/lib/owner-items';

const SLUG = 'alpha-k3x9qp7vtz';
beforeEach(() => vi.stubEnv('BLOB_PUBLIC_HOST', TEST_BLOB_HOST));
afterEach(() => vi.unstubAllEnvs());
let photo = ''; // the photo link of the restaurant made by the latest setup() (every item needs a photo)
const input = (categoryId: string, over: Partial<ItemInput> = {}): ItemInput => ({
  categoryId, name: 'Burger', description: '', available: true, imageUrl: photo, priceUsd: '5', priceLbp: '', sizes: [], ...over,
});

async function setup() {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  photo = photoUrl(a.restaurantId);
  await createCategory(pg, a.ownerId, 'Burgers');
  await createCategory(pg, a.ownerId, 'Drinks');
  await createCategory(pg, a.ownerId, 'Empty');
  await createCategory(pg, b.ownerId, 'Theirs');
  const [burgers, drinks] = await listCategories(pg, a.ownerId);
  const [theirs] = await listCategories(pg, b.ownerId);
  return { pg, a, b, burgers: burgers.id, drinks: drinks.id, theirs: theirs.id };
}
const menuOf = async (pg: Awaited<ReturnType<typeof makeDb>>, slug = SLUG) => {
  const r = await getPublicMenu(pg, slug);
  if (r.state !== 'ok') throw new Error(`expected a menu, got ${r.state}`);
  return r.menu;
};

describe('getPublicMenu', () => {
  it('shows categories and items in the owner order, with sizes', async () => {
    const { pg, a, burgers, drinks } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'First', description: 'tasty' }));
    await createItem(pg, a.ownerId, input(burgers, { name: 'Second', priceUsd: '3.5' }));
    await createItem(pg, a.ownerId, input(drinks, { name: 'Cola', priceUsd: '', sizes: [{ label: 's', priceUsd: '1', priceLbp: '' }, { label: 'L', priceUsd: '2', priceLbp: '' }] }));
    const menu = await menuOf(pg);
    expect(menu.name).toBe('Some restaurant');
    expect(menu.categories.map((c) => c.name)).toEqual(['Burgers', 'Drinks']);
    expect(menu.categories[0].items.map((i) => i.name)).toEqual(['First', 'Second']);
    expect(menu.categories[0].items[0]).toMatchObject({ description: 'tasty', price_usd: '5.00', sizes: [] });
    expect(menu.categories[1].items[0].sizes).toMatchObject([{ label: 'S', price_usd: '1.00' }, { label: 'L', price_usd: '2.00' }]);
  });

  it('hides unavailable items and categories that end up empty (also the ones that were empty from the start)', async () => {
    const { pg, a, burgers, drinks } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'Hidden' }));
    await createItem(pg, a.ownerId, input(drinks, { name: 'Shown' }));
    const hidden = (await listItems(pg, a.ownerId)).find((i) => i.name === 'Hidden')!;
    await setItemAvailable(pg, a.ownerId, hidden.id, false);
    const menu = await menuOf(pg);
    expect(menu.categories.map((c) => c.name)).toEqual(['Drinks']);
    expect(JSON.stringify(menu)).not.toContain('Hidden');
  });

  it('never shows another restaurant\'s items, even in a category that is not its own', async () => {
    const { pg, a, b, burgers, theirs } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'Mine' }));
    await add.item(pg, b.restaurantId, theirs, '9');
    const menu = await menuOf(pg);
    expect(menu.categories.flatMap((c) => c.items.map((i) => i.name))).toEqual(['Mine']);
    expect((await menuOf(pg, 'beta-k3x9qp7vtz')).categories.flatMap((c) => c.items.map((i) => i.name))).toEqual(['Burger']);
  });

  it('a suspended restaurant gives "unavailable" and nothing else', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'Secret dish' }));
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    expect(await getPublicMenu(pg, SLUG)).toEqual({ state: 'unavailable' });
    await pg.query(`UPDATE restaurants SET status = 'active' WHERE id = $1`, [a.restaurantId]);
    expect((await menuOf(pg)).categories).toHaveLength(1);
  });

  it('an unknown or badly shaped link is "missing" (the database is not even asked for bad shapes)', async () => {
    const { pg } = await setup();
    for (const slug of ['nobody-k3x9qp7vtz', 'ALPHA-K3X9QP7VTZ', '', '-x', 'a'.repeat(61), "alpha'--", 'a b', '../x', 'alpha-k3x9qp7vtz/']) {
      expect(await getPublicMenu(pg, slug), slug).toEqual({ state: 'missing' });
    }
    const never = { query: () => { throw new Error('database was asked'); } };
    expect(await getPublicMenu(never as never, "x'; DROP TABLE users;--")).toEqual({ state: 'missing' });
  });

  it('the SHAPE of the menu is pinned: if this fails, bump PUBLIC_MENU_VERSION (the cache keeps old shapes across deployments)', async () => {
    const { pg, a, drinks } = await setup();
    await createItem(pg, a.ownerId, input(drinks, { name: 'Cola', description: 'cold', priceUsd: '', sizes: [{ label: 'S', priceUsd: '1', priceLbp: '' }, { label: 'L', priceUsd: '2', priceLbp: '' }] }));
    const menu = await menuOf(pg);
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(menu)).toEqual(['categories', 'currencies', 'direction', 'facebook', 'instagram', 'locations', 'name', 'phone', 'tiktok']);
    expect(keys(menu.categories[0])).toEqual(['items', 'name']);
    expect(keys(menu.categories[0].items[0])).toEqual(['description', 'image', 'name', 'price_lbp', 'price_usd', 'sizes']);
    expect(keys(menu.categories[0].items[0].sizes[0])).toEqual(['label', 'price_lbp', 'price_usd']);
    expect(PUBLIC_MENU_VERSION).toBe('v2'); // v1 = the shape with mapUrl (before the branches)
  });

  it('gives only the contact data the owner filled in', async () => {
    const { pg, a } = await setup();
    expect(await menuOf(pg)).toMatchObject({ phone: null, locations: [], instagram: null, facebook: null, tiktok: null });
    await saveSettings(pg, a.ownerId, { name: 'Alpha', currencies: 'USD', phone: '03 123 456', instagram: '@alpha.food', facebook: '', tiktok: '' });
    expect(await menuOf(pg)).toMatchObject({ name: 'Alpha', phone: '+9613123456', instagram: 'https://www.instagram.com/alpha.food', facebook: null, tiktok: null });
    await saveSettings(pg, a.ownerId, { name: 'Alpha', currencies: 'USD', phone: '', instagram: '', facebook: '', tiktok: '@alpha.food' });
    expect(await menuOf(pg)).toMatchObject({ phone: null, instagram: null, tiktok: 'https://www.tiktok.com/@alpha.food' });
  });

  it('gives the direction the owner chose (right to left until he changes it)', async () => {
    const { pg, a } = await setup();
    expect(await menuOf(pg)).toMatchObject({ direction: 'rtl' });
    await saveSettings(pg, a.ownerId, { name: 'Alpha', currencies: 'USD', phone: '', instagram: '', facebook: '', tiktok: '', direction: 'ltr' });
    expect(await menuOf(pg)).toMatchObject({ direction: 'ltr' });
  });

  it('prices come back as exact text', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'X', priceUsd: '5' }));
    const menu = await menuOf(pg);
    expect(menu.currencies).toBe('USD');
    expect(menu.categories[0].items[0]).toMatchObject({ price_usd: '5.00', price_lbp: null });
  });
});

describe('contact links', () => {
  it('the WhatsApp link (digits only); there is no call link any more', () => {
    expect(whatsappUrl('+96170123456')).toBe('https://wa.me/96170123456');
  });
});
