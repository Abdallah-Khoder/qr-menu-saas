import { describe, expect, it } from 'vitest';
import { add, count, makeDb, slug } from './helpers';
import { createInvite } from '../src/lib/invites';
import { deleteOwnerAccount, listRestaurants, setRestaurantStatus } from '../src/lib/restaurants-admin';
import { signUpOwner } from '../src/lib/signup';
import type { Mail } from '../src/lib/email';

const tokenFrom = (m: Mail) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

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
    expect(await deleteOwnerAccount(pg, nobody)).toBe(false);
  });
  it('deleting removes EVERYTHING of that owner (account, restaurant, categories, items, sizes, codes) and nothing of the others', async () => {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    for (const t of [a, b]) {
      const cat = await add.category(pg, t.restaurantId, 'Burgers');
      const item = await add.item(pg, t.restaurantId, cat);
      await add.size(pg, t.restaurantId, item, 'M');
      await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'reset_password', 'h', now() + interval '1 hour')`, [t.ownerId]);
    }
    expect(await deleteOwnerAccount(pg, a.restaurantId)).toBe(true);
    for (const table of ['users', 'restaurants', 'categories', 'items', 'item_sizes', 'email_codes']) expect(await count(pg, table)).toBe(1);
    // the one that is left is beta's
    expect((await pg.query(`SELECT email FROM users`)).rows).toEqual([{ email: 'beta@example.com' }]);
    expect((await pg.query(`SELECT id FROM restaurants`)).rows).toEqual([{ id: b.restaurantId }]);
  });
  it('after the delete the same email can be invited again and can sign up again (the old account is not in the way)', async () => {
    const pg = await makeDb();
    const admin = await add.superAdmin(pg);
    let token = '';
    const send = async (m: Mail) => { token = tokenFrom(m); };
    expect(await createInvite(pg, admin, 'same@example.com', send)).toEqual({ ok: true });
    expect((await signUpOwner(pg, { token, name: 'مطعم قديم', password: 'password-1' })).ok).toBe(true);
    // while the account exists the invite is refused...
    expect(await createInvite(pg, admin, 'same@example.com', send)).toEqual({ ok: false, reason: 'already_registered' });
    const old = (await pg.query<{ id: string }>(`SELECT id FROM restaurants`)).rows[0].id;
    // ...and once the admin deletes the restaurant + account, it is accepted
    expect(await deleteOwnerAccount(pg, old)).toBe(true);
    expect(await createInvite(pg, admin, 'same@example.com', send)).toEqual({ ok: true });
    expect((await signUpOwner(pg, { token, name: 'مطعم جديد', password: 'password-2' })).ok).toBe(true);
    const rows = (await pg.query<{ name: string; email: string }>(`SELECT r.name, u.email FROM restaurants r JOIN users u ON u.id = r.owner_id`)).rows;
    expect(rows).toEqual([{ name: 'مطعم جديد', email: 'same@example.com' }]);
  });
  it('can never delete a super-admin through a restaurant', async () => {
    const pg = await makeDb();
    const admin = await add.superAdmin(pg);
    const r = await add.restaurant(pg, admin, slug('weird')); // a restaurant owned by a super-admin
    expect(await deleteOwnerAccount(pg, r)).toBe(false);
    expect(await count(pg, 'users')).toBe(1);
  });
});
