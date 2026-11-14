import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
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

  it('keeps the SQL and its record together: if recording fails, the SQL is undone too, and a retry works', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE created_by_sql (id INT);');
    const base = new PGlite();
    let breakRecording = true;
    const client = {
      exec: (sql: string) => base.exec(sql),
      query: (sql: string, params?: unknown[]) =>
        breakRecording && sql.includes('INSERT INTO schema_migrations')
          ? Promise.reject(new Error('recording failed'))
          : base.query(sql, params),
    };

    await expect(migrate(client, dir)).rejects.toThrow(/001_ok\.sql failed and was rolled back/);
    expect(await tables(base)).not.toContain('created_by_sql'); // the successful CREATE TABLE was undone
    expect((await base.query('SELECT 1 FROM schema_migrations')).rows).toHaveLength(0);

    breakRecording = false;
    expect(await migrate(client, dir)).toEqual(['001_ok.sql']); // retry succeeds
    expect(await tables(base)).toContain('created_by_sql');
  });

  it('takes the lock INSIDE each transaction, before it looks at the history', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INT);');
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INT);');
    const base = new PGlite();
    const seen: string[] = [];
    const label = (sql: string) =>
      sql.trim() === 'BEGIN' ? 'BEGIN'
      : sql.trim() === 'COMMIT' ? 'COMMIT'
      : sql.includes('pg_advisory_xact_lock') ? 'LOCK'
      : sql.includes('FROM schema_migrations WHERE filename') ? 'RECHECK'
      : sql.includes('INSERT INTO schema_migrations') ? 'RECORD'
      : null;
    const client = {
      exec: (sql: string) => { const l = label(sql); if (l) seen.push(l); return base.exec(sql); },
      query: (sql: string, params?: unknown[]) => { const l = label(sql); if (l) seen.push(l); return base.query(sql, params); },
    };
    await migrate(client, dir);
    expect(seen).toEqual(['BEGIN', 'LOCK', 'RECHECK', 'RECORD', 'COMMIT', 'BEGIN', 'LOCK', 'RECHECK', 'RECORD', 'COMMIT']);
  });

  it('if another runner applied the file while we waited for the lock, we skip it instead of failing', async () => {
    const dir = tempDir();
    const sql = 'CREATE TABLE only_once (id INT);';
    writeFileSync(join(dir, '001_once.sql'), sql);
    const base = new PGlite();
    const checksum = createHash('sha256').update(sql).digest('hex');
    const client = {
      exec: (s: string) => base.exec(s),
      query: async (s: string, params?: unknown[]) => {
        const result = await base.query(s, params);
        if (s.includes('pg_advisory_xact_lock')) {
          // simulate the OTHER runner finishing its work right now
          await base.exec(sql);
          await base.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', ['001_once.sql', checksum]);
        }
        return result;
      },
    };
    expect(await migrate(client, dir)).toEqual([]); // nothing applied by us, and no "already exists" error
    expect(await tables(base)).toContain('only_once');
  });

  it('stops if an already-applied migration was edited (dev and production would drift)', async () => {
    const dir = tempDir();
    copyFileSync('db/migrations/001_init.sql', join(dir, '001_init.sql'));
    const pg = new PGlite();
    await migrate(pg, dir);
    writeFileSync(join(dir, '001_init.sql'), '-- edited later\nCREATE TABLE sneaky (id INT);');
    await expect(migrate(pg, dir)).rejects.toThrow(/already applied but has been modified/);
  });

  it('stops, and applies nothing, if an already-applied file has disappeared from the folder', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INT);');
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INT);');
    const pg = new PGlite();
    await migrate(pg, dir);

    unlinkSync(join(dir, '001_a.sql')); // deleted by mistake (or we are on the wrong branch)
    writeFileSync(join(dir, '003_c.sql'), 'CREATE TABLE c (id INT);'); // a pending one is waiting

    await expect(migrate(pg, dir)).rejects.toThrow(/missing from the migrations folder: 001_a\.sql/);
    expect(await tables(pg)).not.toContain('c'); // nothing new was applied
  });

  it('lists every missing file', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, '001_a.sql'), 'CREATE TABLE a (id INT);');
    writeFileSync(join(dir, '002_b.sql'), 'CREATE TABLE b (id INT);');
    const pg = new PGlite();
    await migrate(pg, dir);
    unlinkSync(join(dir, '002_b.sql'));
    unlinkSync(join(dir, '001_a.sql'));
    await expect(migrate(pg, dir)).rejects.toThrow(/001_a\.sql, 002_b\.sql/);
  });

  it('applies a new migration on top of an existing database', async () => {
    const dir = tempDir();
    copyFileSync('db/migrations/001_init.sql', join(dir, '001_init.sql'));
    const pg = new PGlite();
    await migrate(pg, dir);
    writeFileSync(join(dir, '002_logo.sql'), 'ALTER TABLE restaurants ADD COLUMN logo_url TEXT;');
    expect(await migrate(pg, dir)).toEqual(['002_logo.sql']);
    const { rows } = await pg.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('o@example.com', 'h', 'owner') RETURNING id`,
    );
    await pg.query(
      `INSERT INTO restaurants (owner_id, name, public_slug, logo_url) VALUES ($1, 'A', 'shaar-k3x9qp7vtz', 'https://x')`,
      [rows[0].id],
    );
  });
});
