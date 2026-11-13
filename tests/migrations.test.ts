import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../scripts/migrate-lib.mjs';

const tempDir = () => mkdtempSync(join(tmpdir(), 'migrations-'));
const tables = async (pg: PGlite) =>
  (await pg.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows
    .map((r) => r.tablename)
    .sort();

describe('migration runner', () => {
  it('applies the real migrations and creates all 7 tables', async () => {
    const pg = new PGlite();
    const ran = await migrate(pg, 'db/migrations');
    expect(ran).toEqual(['001_init.sql']);
    expect(await tables(pg)).toEqual(
      ['categories', 'email_codes', 'invites', 'item_sizes', 'items', 'restaurants', 'schema_migrations', 'users'],
    );
  });

  it('applies each migration only once (running twice does nothing)', async () => {
    const pg = new PGlite();
    await migrate(pg, 'db/migrations');
    expect(await migrate(pg, 'db/migrations')).toEqual([]);
  });

  it('applies files in numeric order, and ignores files that are not numbered .sql', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '010_c.sql'), 'CREATE TABLE c (id INT);');
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INT);');
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INT);');
    writeFileSync(join(dir, 'notes.txt'), 'not a migration');
    writeFileSync(join(dir, 'draft.sql'), 'DROP EVERYTHING;');
    const pg = new PGlite();
    expect(await migrate(pg, dir)).toEqual(['001_a.sql', '002_b.sql', '010_c.sql']);
  });

  it('rolls back a failing migration completely and does not record it', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE ok (id INT);');
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE half_done (id INT); INSERT INTO does_not_exist VALUES (1);');
    const pg = new PGlite();
    await expect(migrate(pg, dir)).rejects.toThrow(/002_bad\.sql failed and was rolled back/);
    expect(await tables(pg)).not.toContain('half_done'); // the first statement of 002 was undone
    expect(await tables(pg)).toContain('ok'); // 001 stays
    const recorded = (await pg.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows;
    expect(recorded.map((r) => r.filename)).toEqual(['001_ok.sql']);
  });

  it('stops if an already-applied migration was edited (dev and production would drift)', async () => {
    const dir = tempDir();
    copyFileSync('db/migrations/001_init.sql', join(dir, '001_init.sql'));
    const pg = new PGlite();
    await migrate(pg, dir);
    writeFileSync(join(dir, '001_init.sql'), '-- edited later\nCREATE TABLE sneaky (id INT);');
    await expect(migrate(pg, dir)).rejects.toThrow(/already applied but has been modified/);
  });

  it('applies a new migration on top of an existing database', async () => {
    const dir = tempDir();
    copyFileSync('db/migrations/001_init.sql', join(dir, '001_init.sql'));
    const pg = new PGlite();
    await migrate(pg, dir);
    writeFileSync(join(dir, '002_logo.sql'), 'ALTER TABLE restaurants ADD COLUMN logo_url TEXT;');
    expect(await migrate(pg, dir)).toEqual(['002_logo.sql']);
    await pg.query(`INSERT INTO restaurants (name, public_slug, logo_url) VALUES ('A', 'abcdefghijkl', 'https://x')`);
  });
});
