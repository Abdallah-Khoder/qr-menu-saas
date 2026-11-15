import { describe, expect, it } from 'vitest';
import { add, count, makeDb, slug } from './helpers';
import { deleteOwnerAccount, deleteRestaurant, listRestaurants, setRestaurantStatus } from '../src/lib/restaurants-admin';

describe('restaurants admin', () => {
  it('lists every restaurant with its owner email', async () => {
    const pg = await makeDb();
    await add.tenant(pg, 'alpha');
    await add.tenant(pg, 'beta');
    const rows = await listRestaurants(pg);
    expect(rows.map((r) => r.owner_email).sort()).toEqual(['alpha@example.com', 'beta@example.com']);
    expect(rows[0]).toHaveProperty('public_slug');
  });
  it('suspends and re-activates one restaurant without touching the others', async () => {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    expect(await setRestaurantStatus(pg, a.restaurantId, 'suspended')).toBe(true);
    const status = Object.fromEntries((await listRestaurants(pg)).map((r) => [r.id, r.status]));
    expect(status[a.restaurantId]).toBe('suspended');
    expect(status[b.restaurantId]).toBe('active');
    expect(await setRestaurantStatus(pg, a.restaurantId, 'active')).toBe(true);
    expect((await listRestaurants(pg)).every((r) => r.status === 'active')).toBe(true);
  });
  it('returns false for an id that does not exist', async () => {
    const pg = await makeDb();
    const nobody = '00000000-0000-0000-0000-000000000000';
    expect(await setRestaurantStatus(pg, nobody, 'suspended')).toBe(false);
    expect(await deleteRestaurant(pg, nobody)).toBe(false);
    expect(await deleteOwnerAccount(pg, nobody)).toBe(false);
  });
  it('deleting a restaurant removes its menu but KEEPS the owner account', async () => {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    const cat = await add.category(pg, a.restaurantId, 'Burgers');
    await add.item(pg, a.restaurantId, cat);
    const catB = await add.category(pg, b.restaurantId, 'Pizza');
    await add.item(pg, b.restaurantId, catB);
    expect(await deleteRestaurant(pg, a.restaurantId)).toBe(true);
    expect(await count(pg, 'restaurants')).toBe(1);
    expect(await count(pg, 'categories')).toBe(1);
    expect(await count(pg, 'items')).toBe(1);
    expect(await count(pg, 'users')).toBe(2);
  });
  it('deleting the owner account removes the account, restaurant and menu, only for that owner', async () => {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    await add.tenant(pg, 'beta');
    await add.category(pg, a.restaurantId, 'Burgers');
    expect(await deleteOwnerAccount(pg, a.restaurantId)).toBe(true);
    expect(await count(pg, 'users')).toBe(1);
    expect(await count(pg, 'restaurants')).toBe(1);
    expect(await count(pg, 'categories')).toBe(0);
  });
  it('can never delete a super-admin through a restaurant', async () => {
    const pg = await makeDb();
    const admin = await add.superAdmin(pg);
    const r = await add.restaurant(pg, admin, slug('weird')); // a restaurant owned by a super-admin
    expect(await deleteOwnerAccount(pg, r)).toBe(false);
    expect(await count(pg, 'users')).toBe(1);
  });
});
