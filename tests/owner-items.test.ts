import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { add, count, makeDb } from './helpers';
import { parseLbp, parseUsd } from '../src/lib/owner-input';
import { MAX_ITEMS, createItem, deleteItem, listItems, moveItem, setItemAvailable, updateItem, type ItemInput } from '../src/lib/owner-items';
import { SUSPENDED_MESSAGE, createCategory, getOwnerRestaurant, listCategories, saveSettings } from '../src/lib/owner-menu';

describe('price parsers', () => {
  it('dollars: up to 2 decimals, comma or dot, Arabic digits', () => {
    expect(parseUsd('3')).toEqual({ ok: true, value: '3.00' });
    expect(parseUsd('3.5')).toEqual({ ok: true, value: '3.50' });
    expect(parseUsd('3,50')).toEqual({ ok: true, value: '3.50' });
    expect(parseUsd('٣٫٥')).toEqual({ ok: true, value: '3.50' });
    expect(parseUsd('  ')).toEqual({ ok: true, value: null });
    for (const bad of ['0', '0.00', '-1', '1.234', 'abc', 'NaN', 'Infinity', '1e3', '1,000.50', '99999999', '1.', '.5']) {
      expect(parseUsd(bad).ok, bad).toBe(false);
    }
  });
  it('lira: whole numbers, dot or comma only as thousands separator', () => {
    expect(parseLbp('150000')).toEqual({ ok: true, value: '150000' });
    expect(parseLbp('150,000')).toEqual({ ok: true, value: '150000' });
    expect(parseLbp('150.000')).toEqual({ ok: true, value: '150000' });
    expect(parseLbp('1,250,000')).toEqual({ ok: true, value: '1250000' });
    expect(parseLbp('')).toEqual({ ok: true, value: null });
    for (const bad of ['0', '-5', '150,5', '15,00', 'NaN', '1e5', '99999999999', 'abc', '1,2345']) {
      expect(parseLbp(bad).ok, bad).toBe(false);
    }
  });
});

async function setup(currencies: 'USD' | 'LBP' | 'BOTH' = 'USD') {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  await pg.query(`UPDATE restaurants SET currencies = $1 WHERE id = $2`, [currencies, a.restaurantId]);
  await createCategory(pg, a.ownerId, 'Burgers');
  await createCategory(pg, a.ownerId, 'Drinks');
  await createCategory(pg, b.ownerId, 'Theirs');
  const [burgers, drinks] = await listCategories(pg, a.ownerId);
  const [theirs] = await listCategories(pg, b.ownerId);
  return { pg, a, b, burgers: burgers.id, drinks: drinks.id, theirs: theirs.id };
}
const input = (categoryId: string, over: Partial<ItemInput> = {}): ItemInput => ({
  categoryId, name: 'Cheese burger', description: '', available: true, priceUsd: '5', priceLbp: '', sizes: [], ...over,
});
const sizes = (...rows: [string, string, string][]) => rows.map(([label, priceUsd, priceLbp]) => ({ label, priceUsd, priceLbp }));
const names = async (pg: PGlite, ownerId: string) => (await listItems(pg, ownerId)).map((i) => i.name);

describe('createItem', () => {
  it('saves a plain item with a dollar price', async () => {
    const { pg, a, burgers } = await setup();
    expect(await createItem(pg, a.ownerId, input(burgers, { name: '  برغر  ', description: ' لذيذ ', priceUsd: '5,5' }))).toEqual({ ok: true });
    expect((await listItems(pg, a.ownerId))[0]).toMatchObject({ name: 'برغر', description: 'لذيذ', available: true, price_usd: '5.50', price_lbp: null, sizes: [] });
  });
  it('needs the price in every currency the restaurant uses', async () => {
    const both = await setup('BOTH');
    expect(await createItem(both.pg, both.a.ownerId, input(both.burgers, { priceUsd: '5' }))).toMatchObject({ ok: false, status: 400 });
    expect(await createItem(both.pg, both.a.ownerId, input(both.burgers, { priceUsd: '', priceLbp: '450000' }))).toMatchObject({ ok: false, status: 400 });
    expect(await createItem(both.pg, both.a.ownerId, input(both.burgers, { priceUsd: '5', priceLbp: '450,000' }))).toEqual({ ok: true });
    expect((await listItems(both.pg, both.a.ownerId))[0]).toMatchObject({ price_usd: '5.00', price_lbp: '450000.00' });
    const lbp = await setup('LBP');
    expect(await createItem(lbp.pg, lbp.a.ownerId, input(lbp.burgers, { priceUsd: '5' }))).toMatchObject({ ok: false, status: 400 });
    expect(await createItem(lbp.pg, lbp.a.ownerId, input(lbp.burgers, { priceUsd: '5', priceLbp: '450000' }))).toEqual({ ok: true });
    // the dollar price typed for a lira-only restaurant is not stored
    expect((await listItems(lbp.pg, lbp.a.ownerId))[0]).toMatchObject({ price_usd: null, price_lbp: '450000.00' });
  });
  it('refuses bad names, descriptions and prices', async () => {
    const { pg, a, burgers } = await setup();
    for (const over of [{ name: '' }, { name: '🍕' }, { name: 'x'.repeat(81) }, { description: 'x'.repeat(301) }, { priceUsd: '' }, { priceUsd: '0' }, { priceUsd: 'NaN' }, { priceUsd: '-3' }]) {
      expect(await createItem(pg, a.ownerId, input(burgers, over)), JSON.stringify(over)).toMatchObject({ ok: false, status: 400 });
    }
    expect(await count(pg, 'items')).toBe(0);
  });
  it('item with sizes: labels in capitals, each size has its price, the item has none of its own', async () => {
    const { pg, a, burgers } = await setup('BOTH');
    expect(await createItem(pg, a.ownerId, input(burgers, { priceUsd: '9', priceLbp: '9', sizes: sizes(['s', '3', '270000'], ['m', '4', '360000'], ['xl', '6', '540000']) }))).toEqual({ ok: true });
    const item = (await listItems(pg, a.ownerId))[0];
    expect(item).toMatchObject({ price_usd: null, price_lbp: null });
    expect(item.sizes).toEqual([
      { label: 'S', price_usd: '3.00', price_lbp: '270000.00' }, { label: 'M', price_usd: '4.00', price_lbp: '360000.00' }, { label: 'XL', price_usd: '6.00', price_lbp: '540000.00' },
    ]);
  });
  it('size rules: at least 2, at most 6, no duplicates, short Latin labels, every currency priced', async () => {
    const { pg, a, burgers } = await setup('BOTH');
    const bad = async (rows: [string, string, string][]) => createItem(pg, a.ownerId, input(burgers, { sizes: sizes(...rows) }));
    expect(await bad([['S', '3', '270000']])).toMatchObject({ ok: false, status: 400 });
    expect(await bad([['S', '3', '1'], ['s', '4', '2']])).toMatchObject({ ok: false, status: 400 }); // S twice
    expect(await bad([['S', '3', '1'], ['صغير', '4', '2']])).toMatchObject({ ok: false, status: 400 });
    expect(await bad([['S', '3', '1'], ['TOOLONGX', '4', '2']])).toMatchObject({ ok: false, status: 400 });
    expect(await bad([['S', '3', '1'], ['M', '4', '']])).toMatchObject({ ok: false, status: 400 }); // no lira price
    expect(await bad(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => [l, '1', '1'] as [string, string, string]))).toMatchObject({ ok: false, status: 400 });
    expect(await count(pg, 'items')).toBe(0);
    expect(await count(pg, 'item_sizes')).toBe(0);
  });
  it("another restaurant's category: 404 and nothing is created", async () => {
    const { pg, a, theirs } = await setup();
    expect(await createItem(pg, a.ownerId, input(theirs))).toMatchObject({ ok: false, status: 404 });
    expect(await count(pg, 'items')).toBe(0);
  });
  it('new items go to the end of their category', async () => {
    const { pg, a, burgers, drinks } = await setup();
    for (const [c, n] of [[burgers, 'B1'], [drinks, 'D1'], [burgers, 'B2']] as const) await createItem(pg, a.ownerId, input(c, { name: n }));
    expect(await names(pg, a.ownerId)).toEqual(['B1', 'B2', 'D1']); // by category order, then item order
  });
  it('stops at the maximum', async () => {
    const { pg, a, burgers } = await setup();
    await pg.query(`INSERT INTO items (restaurant_id, category_id, name, price_usd, sort_order) SELECT $1, $2, 'i' || g, 1, g FROM generate_series(1, $3) g`, [a.restaurantId, burgers, MAX_ITEMS]);
    expect(await createItem(pg, a.ownerId, input(burgers))).toMatchObject({ ok: false, status: 409 });
    expect(await count(pg, 'items')).toBe(MAX_ITEMS);
  });
  it('two saves at the same moment both work and keep different positions', async () => {
    const { pg, a, burgers } = await setup();
    const out = await Promise.all(['X', 'Y', 'Z'].map((n) => createItem(pg, a.ownerId, input(burgers, { name: n }))));
    expect(out.every((o) => o.ok)).toBe(true);
    expect(await count(pg, 'items')).toBe(3);
  });
  it('if the restaurant changes its currency while the owner types, the save is refused (no item without a price)', async () => {
    const { pg, a, burgers } = await setup('USD');
    let switched = false;
    const racing = {
      query: async (text: string, params?: unknown[]) => {
        const res = await pg.query(text, params as never[]);
        if (!switched && text.includes('FROM restaurants WHERE owner_id')) {
          switched = true;
          await pg.query(`UPDATE restaurants SET currencies = 'BOTH'`); // the owner's other tab
        }
        return res;
      },
    };
    expect(await createItem(racing, a.ownerId, input(burgers))).toMatchObject({ ok: false, status: 409 });
    expect(await count(pg, 'items')).toBe(0);
  });
});

describe('updateItem', () => {
  it('changes fields, and moving to another category puts it at the end there', async () => {
    const { pg, a, burgers, drinks } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'One' }));
    await createItem(pg, a.ownerId, input(drinks, { name: 'Cola' }));
    const one = (await listItems(pg, a.ownerId)).find((i) => i.name === 'One')!;
    expect(await updateItem(pg, a.ownerId, one.id, input(drinks, { name: 'Juice', description: 'fresh', priceUsd: '2.5', available: false }))).toEqual({ ok: true });
    expect(await names(pg, a.ownerId)).toEqual(['Cola', 'Juice']);
    expect((await listItems(pg, a.ownerId)).find((i) => i.name === 'Juice')).toMatchObject({ category_id: drinks, description: 'fresh', price_usd: '2.50', available: false });
  });
  it('sizes: keep, change, add and remove in one save; switching between sizes and a plain price', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { sizes: sizes(['S', '3', ''], ['M', '4', ''], ['L', '5', '']) }));
    const id = (await listItems(pg, a.ownerId))[0].id;
    // S stays with a new price, M removed, L stays, XL added
    expect(await updateItem(pg, a.ownerId, id, input(burgers, { sizes: sizes(['S', '3.5', ''], ['L', '5', ''], ['XL', '7', '']) }))).toEqual({ ok: true });
    expect((await listItems(pg, a.ownerId))[0].sizes.map((s) => `${s.label}:${s.price_usd}`)).toEqual(['S:3.50', 'L:5.00', 'XL:7.00']);
    // back to a plain price: all sizes go
    expect(await updateItem(pg, a.ownerId, id, input(burgers, { priceUsd: '4' }))).toEqual({ ok: true });
    expect((await listItems(pg, a.ownerId))[0]).toMatchObject({ price_usd: '4.00', sizes: [] });
    expect(await count(pg, 'item_sizes')).toBe(0);
    // and to sizes again: the own price is cleared
    expect(await updateItem(pg, a.ownerId, id, input(burgers, { sizes: sizes(['S', '3', ''], ['M', '4', '']) }))).toEqual({ ok: true });
    expect((await listItems(pg, a.ownerId))[0]).toMatchObject({ price_usd: null });
  });
  it('a price in a currency the restaurant stopped using is kept, hidden', async () => {
    const { pg, a, burgers } = await setup('BOTH');
    await createItem(pg, a.ownerId, input(burgers, { priceUsd: '5', priceLbp: '450000' }));
    await createItem(pg, a.ownerId, input(burgers, { name: 'Sized', sizes: sizes(['S', '3', '270000'], ['M', '4', '360000']) }));
    await saveSettings(pg, a.ownerId, { name: 'R', currencies: 'USD', phone: '', mapUrl: '', instagram: '', facebook: '' });
    for (const item of await listItems(pg, a.ownerId)) {
      // the form of a dollar-only restaurant never sends lira prices
      await updateItem(pg, a.ownerId, item.id, input(burgers, { name: item.name + '!', priceUsd: '6', sizes: item.sizes.map((s) => ({ label: s.label, priceUsd: '7', priceLbp: '' })) }));
    }
    const items = await listItems(pg, a.ownerId);
    expect(items.find((i) => i.name === 'Cheese burger!')).toMatchObject({ price_usd: '6.00', price_lbp: '450000.00' });
    expect(items.find((i) => i.name === 'Sized!')!.sizes).toEqual([
      { label: 'S', price_usd: '7.00', price_lbp: '270000.00' }, { label: 'M', price_usd: '7.00', price_lbp: '360000.00' },
    ]);
  });
  it("cannot touch another restaurant's item, nor move an item into another restaurant's category", async () => {
    const { pg, a, b, burgers, theirs } = await setup();
    await createItem(pg, b.ownerId, input(theirs, { name: 'Theirs' }));
    await createItem(pg, a.ownerId, input(burgers, { name: 'Mine' }));
    const [mine] = await listItems(pg, a.ownerId);
    const [other] = await listItems(pg, b.ownerId);
    expect(await updateItem(pg, a.ownerId, other.id, input(burgers, { name: 'Hacked' }))).toMatchObject({ ok: false, status: 404 });
    expect(await updateItem(pg, a.ownerId, mine.id, input(theirs, { name: 'Stolen' }))).toMatchObject({ ok: false, status: 404 });
    expect(await setItemAvailable(pg, a.ownerId, other.id, false)).toMatchObject({ ok: false, status: 404 });
    expect(await moveItem(pg, a.ownerId, other.id, 'down')).toMatchObject({ ok: false, status: 404 });
    expect(await deleteItem(pg, a.ownerId, other.id)).toMatchObject({ ok: false, status: 404 });
    expect(await names(pg, b.ownerId)).toEqual(['Theirs']);
    expect((await listItems(pg, b.ownerId))[0]).toMatchObject({ available: true });
    expect(await names(pg, a.ownerId)).toEqual(['Mine']);
  });
  it('a failed save changes nothing (not even the sizes)', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { sizes: sizes(['S', '3', ''], ['M', '4', '']) }));
    const [item] = await listItems(pg, a.ownerId);
    expect(await updateItem(pg, a.ownerId, item.id, input(burgers, { name: 'Changed', sizes: sizes(['S', 'bad', ''], ['L', '4', '']) }))).toMatchObject({ ok: false, status: 400 });
    expect(await listItems(pg, a.ownerId)).toEqual([item]);
  });
});

describe('available, delete, move', () => {
  it('available can be switched off and on', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers));
    const [item] = await listItems(pg, a.ownerId);
    expect(await setItemAvailable(pg, a.ownerId, item.id, false)).toEqual({ ok: true });
    expect((await listItems(pg, a.ownerId))[0].available).toBe(false);
    await setItemAvailable(pg, a.ownerId, item.id, true);
    expect((await listItems(pg, a.ownerId))[0].available).toBe(true);
  });
  it('delete removes the item and its sizes', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { sizes: sizes(['S', '3', ''], ['M', '4', '']) }));
    const [item] = await listItems(pg, a.ownerId);
    expect(await deleteItem(pg, a.ownerId, item.id)).toEqual({ ok: true });
    expect(await count(pg, 'items')).toBe(0);
    expect(await count(pg, 'item_sizes')).toBe(0);
  });
  it('deleting a category deletes its items', async () => {
    const { pg, a, burgers } = await setup();
    await createItem(pg, a.ownerId, input(burgers));
    await pg.query(`DELETE FROM categories WHERE id = $1`, [burgers]);
    expect(await count(pg, 'items')).toBe(0);
  });
  it('moves up and down inside the category only, and stops at the ends', async () => {
    const { pg, a, burgers, drinks } = await setup();
    for (const n of ['A', 'B', 'C']) await createItem(pg, a.ownerId, input(burgers, { name: n }));
    await createItem(pg, a.ownerId, input(drinks, { name: 'D' }));
    const id = async (n: string) => (await listItems(pg, a.ownerId)).find((i) => i.name === n)!.id;
    expect(await moveItem(pg, a.ownerId, await id('C'), 'up')).toEqual({ ok: true });
    expect((await names(pg, a.ownerId)).join('')).toBe('ACBD');
    await moveItem(pg, a.ownerId, await id('A'), 'up'); // first: nothing
    await moveItem(pg, a.ownerId, await id('B'), 'down'); // last in burgers: nothing (D is another category)
    expect((await names(pg, a.ownerId)).join('')).toBe('ACBD');
    await moveItem(pg, a.ownerId, await id('A'), 'down');
    expect((await names(pg, a.ownerId)).join('')).toBe('CABD');
  });
  it('moving works with duplicate order numbers', async () => {
    const { pg, a, burgers } = await setup();
    for (const n of ['A', 'B', 'C']) await pg.query(`INSERT INTO items (restaurant_id, category_id, name, price_usd, sort_order) VALUES ($1, $2, $3, 1, 5)`, [a.restaurantId, burgers, n]);
    const before = await names(pg, a.ownerId);
    const second = (await listItems(pg, a.ownerId))[1];
    await moveItem(pg, a.ownerId, second.id, 'up');
    expect(await names(pg, a.ownerId)).toEqual([before[1], before[0], before[2]]);
  });
});

describe('a suspended restaurant cannot change any item', () => {
  it('every item write is refused with 403, nothing changes, reading still works', async () => {
    const { pg, a, burgers, drinks } = await setup();
    await createItem(pg, a.ownerId, input(burgers, { name: 'Keep', sizes: sizes(['S', '3', ''], ['M', '4', '']) }));
    const [item] = await listItems(pg, a.ownerId);
    await pg.query(`UPDATE restaurants SET status = 'suspended'`);
    const refused = { ok: false, status: 403, error: SUSPENDED_MESSAGE };
    const unknown = '11111111-1111-4111-8111-111111111111';
    expect(await createItem(pg, a.ownerId, input(burgers))).toEqual(refused);
    expect(await createItem(pg, a.ownerId, input(burgers, { name: '' }))).toEqual(refused); // even a mistake gets the same answer
    expect(await updateItem(pg, a.ownerId, item.id, input(drinks, { name: 'Changed' }))).toEqual(refused);
    expect(await updateItem(pg, a.ownerId, unknown, input(drinks))).toEqual(refused);
    expect(await setItemAvailable(pg, a.ownerId, item.id, false)).toEqual(refused);
    expect(await moveItem(pg, a.ownerId, item.id, 'down')).toEqual(refused);
    expect(await moveItem(pg, a.ownerId, unknown, 'up')).toEqual(refused);
    expect(await deleteItem(pg, a.ownerId, item.id)).toEqual(refused);
    expect(await deleteItem(pg, a.ownerId, unknown)).toEqual(refused);
    expect(await listItems(pg, a.ownerId)).toEqual([item]);
    expect(await getOwnerRestaurant(pg, a.ownerId)).toMatchObject({ status: 'suspended' });
    await pg.query(`UPDATE restaurants SET status = 'active'`);
    expect(await createItem(pg, a.ownerId, input(burgers))).toEqual({ ok: true });
  });
});

describe('listItems', () => {
  it('only my restaurant, grouped by category order, sizes in order', async () => {
    const { pg, a, b, burgers, drinks, theirs } = await setup();
    await createItem(pg, a.ownerId, input(drinks, { name: 'Cola' }));
    await createItem(pg, a.ownerId, input(burgers, { name: 'Burger', sizes: sizes(['L', '5', ''], ['S', '3', '']) }));
    await createItem(pg, b.ownerId, input(theirs, { name: 'Theirs' }));
    const items = await listItems(pg, a.ownerId);
    expect(items.map((i) => i.name)).toEqual(['Burger', 'Cola']);
    expect(items[0].sizes.map((s) => s.label)).toEqual(['L', 'S']); // the order the owner chose
  });
});
