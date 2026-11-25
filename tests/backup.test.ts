import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as lib from '../scripts/backup-lib.mjs';
import { TEST_BLOB_HOST, add, count, makeDb, photoUrl } from './helpers';
import { createCategory, saveSettings } from '../src/lib/owner-menu';
import { getPublicMenu } from '../src/lib/public-menu';

const { BACKUP_TABLES, FORMAT, SKIPPED_TABLES } = lib as unknown as { BACKUP_TABLES: string[]; FORMAT: number; SKIPPED_TABLES: string[] };
// `npm run backup` / `npm run restore`: the real database can be saved to one file and put back into an empty one.
vi.setConfig({ testTimeout: 30_000 }); // two databases and a round trip: slow when the machine is busy
beforeEach(() => vi.stubEnv('BLOB_PUBLIC_HOST', TEST_BLOB_HOST));
afterEach(() => vi.unstubAllEnvs());

type Backup = { format: number; createdAt: string; database?: string | null; migrations: string[]; counts: Record<string, number>; tables: Record<string, Record<string, unknown>[]> };
type Client = { query: (text: string, params?: unknown[]) => Promise<unknown> };
const exportBackup = lib.exportBackup as unknown as (c: Client, o?: { now?: Date; database?: string }) => Promise<Backup>;
const restoreBackup = lib.restoreBackup as unknown as (c: Client, d: unknown) => Promise<Record<string, number>>;
const file = (b: Backup): Backup => JSON.parse(JSON.stringify(b)); // what a trip through a file on disk does

/** Two restaurants with categories, items with sizes, branches, and an invite: a little of everything. */
async function filled() {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  const admin = await add.superAdmin(pg);
  for (const [t, name] of [[a, 'Alpha'], [b, 'Beta']] as const) {
    const cat = await add.category(pg, t.restaurantId, `${name} crepes`);
    const item = await add.item(pg, t.restaurantId, cat, '3.50');
    await add.size(pg, t.restaurantId, item, 'S', '4.25', '380000');
    await pg.query(`UPDATE items SET image_url = $2, description = 'وصف بالعربي', price_lbp = 312500.50 WHERE id = $1`, [item, photoUrl(t.restaurantId)]);
    await saveSettings(pg, t.ownerId, {
      name, currencies: 'BOTH', phone: '03 123 456', instagram: '', facebook: '', tiktok: '', direction: 'ltr',
      locations: [{ name: `${name} الحمرا`, mapUrl: 'https://maps.app.goo.gl/one' }, { name: `${name} Jounieh`, mapUrl: 'https://maps.app.goo.gl/two' }],
    });
  }
  await pg.query(`INSERT INTO invites (token_hash, email, created_by, expires_at) VALUES ('h1', 'new@example.com', $1, now() + interval '1 day')`, [admin]);
  await pg.query(`INSERT INTO login_attempts (key) VALUES ('a-secret-key')`).catch(() => {});
  return { pg, a, b, admin };
}

const dump = async (pg: PGlite, table: string) =>
  (await pg.query(`SELECT to_jsonb(t) AS r FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows.map((r) => (r as { r: unknown }).r);

describe('what goes into the backup', () => {
  it('every table is either saved or skipped on purpose (a new table must be decided on)', async () => {
    const pg = await makeDb();
    const all = (await pg.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.tablename).sort();
    expect([...BACKUP_TABLES, ...SKIPPED_TABLES].sort()).toEqual(all);
  });

  it('has the format, the date, the migrations, a count per table, and every row', async () => {
    const { pg } = await filled();
    const when = new Date('2026-11-25T10:30:00Z');
    const data: Backup = await exportBackup(pg, { now: when, database: 'host/db' });
    expect(data).toMatchObject({ format: FORMAT, createdAt: '2026-11-25T10:30:00.000Z', database: 'host/db' });
    expect(data.migrations).toHaveLength(10);
    expect(data.migrations.at(-1)).toBe('010_locations.sql');
    expect(data.counts).toEqual({ users: 3, invites: 1, restaurants: 2, categories: 2, items: 2, item_sizes: 2, restaurant_locations: 4 });
    for (const t of BACKUP_TABLES) expect(data.tables[t]).toHaveLength(data.counts[t]);
  });

  it('leaves out the short-lived tables, and does not change the database at all', async () => {
    const { pg } = await filled();
    const before = await Promise.all([...BACKUP_TABLES, ...SKIPPED_TABLES].map((t) => dump(pg, t)));
    const data: Backup = await exportBackup(pg);
    expect(Object.keys(data.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(JSON.stringify(data)).not.toContain('a-secret-key');
    const after = await Promise.all([...BACKUP_TABLES, ...SKIPPED_TABLES].map((t) => dump(pg, t)));
    expect(after).toEqual(before);
  });

  it('is read-only: nothing can be written during the export', async () => {
    const { pg } = await filled();
    const queries: string[] = [];
    const spy = { query: (text: string, params?: unknown[]) => { queries.push(text); return pg.query(text, params as never); } };
    await exportBackup(spy);
    expect(queries[0]).toMatch(/^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
    expect(queries.at(-1)).toBe('COMMIT');
    expect(queries.slice(1, -1).every((q) => /^\s*SELECT /.test(q))).toBe(true);
  });
});

describe('restoring a backup into an empty database', () => {
  it('brings back every row exactly, and the public menu looks the same', async () => {
    const { pg, a } = await filled();
    const data = file(await exportBackup(pg));
    const fresh = await makeDb();
    expect(await restoreBackup(fresh, data)).toEqual(data.counts);
    for (const t of BACKUP_TABLES) expect(await dump(fresh, t), t).toEqual(await dump(pg, t));
    const original = await getPublicMenu(pg, 'alpha-k3x9qp7vtz');
    expect(await getPublicMenu(fresh, 'alpha-k3x9qp7vtz')).toEqual(original);
    expect(original).toMatchObject({ state: 'ok', menu: { direction: 'ltr', locations: [{ name: 'Alpha الحمرا' }, { name: 'Alpha Jounieh' }] } });
    expect(a.ownerId).toBeTruthy();
  });

  it('the restored database keeps working: the owner can sign in data and add things', async () => {
    const { pg, a } = await filled();
    const fresh = await makeDb();
    await restoreBackup(fresh, file(await exportBackup(pg)));
    expect(await createCategory(fresh, a.ownerId, 'After the restore')).toMatchObject({ ok: true });
    expect(await count(fresh, 'categories')).toBe(3);
  });

  it('an empty database can be saved and restored too', async () => {
    const data = file(await exportBackup(await makeDb()));
    const fresh = await makeDb();
    expect(await restoreBackup(fresh, data)).toEqual(Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0])));
  });

  it('refuses a database that already has data, and changes nothing in it', async () => {
    const { pg } = await filled();
    const data = file(await exportBackup(pg));
    const target = await makeDb();
    await add.tenant(target, 'already-here');
    const before = await Promise.all(BACKUP_TABLES.map((t) => dump(target, t)));
    await expect(restoreBackup(target, data)).rejects.toThrow(/not empty \("users" has 1 rows\)/);
    expect(await Promise.all(BACKUP_TABLES.map((t) => dump(target, t)))).toEqual(before);
    await expect(restoreBackup(pg, data)).rejects.toThrow(/not empty/); // not even into the database it came from
  });

  it('refuses a database at another version, and says which migrations differ', async () => {
    const { pg } = await filled();
    const data = file(await exportBackup(pg));
    const older = await makeDb();
    await older.query(`DELETE FROM schema_migrations WHERE filename = '010_locations.sql'`);
    await expect(restoreBackup(older, data)).rejects.toThrow(/not at the same version[\s\S]*010_locations\.sql[\s\S]*npm run migrate/);
    const empty = new PGlite();
    await empty.exec(`CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY)`);
    await expect(restoreBackup(empty, data)).rejects.toThrow(/not at the same version/);
    expect(await count(older, 'users')).toBe(0);
  });

  it('refuses a file that is not a backup, is incomplete, or was cut short', async () => {
    const { pg } = await filled();
    const good = file(await exportBackup(pg));
    const target = await makeDb();
    await expect(restoreBackup(target, null)).rejects.toThrow(/not a backup/);
    await expect(restoreBackup(target, { ...good, format: 99 })).rejects.toThrow(/format 99/);
    const noTable = file(good); delete noTable.tables.items;
    await expect(restoreBackup(target, noTable)).rejects.toThrow(/"items" is missing/);
    const cut = file(good); cut.tables.items.pop();
    await expect(restoreBackup(target, cut)).rejects.toThrow(/damaged: "items" should have 2 rows but has 1/);
    const noCounts = file(good); delete (noCounts as { counts?: unknown }).counts;
    await expect(restoreBackup(target, noCounts)).rejects.toThrow(/damaged/);
    expect(await count(target, 'users')).toBe(0);
  });

  it('is all-or-nothing: a bad row half way leaves the database as empty as it was', async () => {
    const { pg } = await filled();
    const data = file(await exportBackup(pg));
    // an item that points to a category which is not in the file: its table comes AFTER users, restaurants, categories
    (data.tables.items[0] as { category_id: string }).category_id = '00000000-0000-4000-8000-000000000000';
    const target = await makeDb();
    await expect(restoreBackup(target, data)).rejects.toThrow();
    for (const t of BACKUP_TABLES) expect(await count(target, t), t).toBe(0);
    // and the same database accepts the good file afterwards
    expect(await restoreBackup(target, file(await exportBackup(pg)))).toBeTruthy();
  });
});

describe('the commands', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  it('backup and restore exist for the dev and the real database, each with its own env file', () => {
    expect(pkg.backup).toBe('node --env-file=.env.local scripts/backup.mjs');
    expect(pkg['backup:prod']).toBe('node --env-file=.env.production.local scripts/backup.mjs');
    expect(pkg.restore).toBe('node --env-file=.env.local scripts/restore.mjs');
    expect(pkg['restore:prod']).toBe('node --env-file=.env.production.local scripts/restore.mjs');
  });
  it('the backups folder is ignored by git (the files hold emails and password hashes)', () => {
    expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('backups/');
  });
  it('the restore script asks for "yes" before it writes, and the backup script never writes to the database', () => {
    expect(readFileSync('scripts/restore.mjs', 'utf8')).toMatch(/Type "yes"[\s\S]*restoreBackup/);
    expect(readFileSync('scripts/backup.mjs', 'utf8')).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/);
  });
  it('the backup file is private to its owner', () => {
    expect(readFileSync('scripts/backup.mjs', 'utf8')).toContain('mode: 0o600');
  });
});
