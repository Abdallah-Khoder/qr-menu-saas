import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Applies the numbered .sql files of a folder, in order, each exactly once.
 *
 * `client` is anything with:  query(sql, params?) -> { rows }   and   exec(sql) -> void
 * (the real `pg` client is wrapped for this in migrate.mjs; PGlite already has both.)
 *
 * How it stays safe:
 *  - each migration runs inside one transaction: it fully applies or not at all
 *  - applied files are recorded in `schema_migrations` with a checksum
 *  - if a file that was already applied has been edited, we STOP instead of silently
 *    letting dev and production drift apart
 */
export async function migrate(client, dir, log = () => {}) {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT        NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = new Map(
    (await client.query('SELECT filename, checksum FROM schema_migrations')).rows.map((r) => [
      r.filename,
      r.checksum,
    ]),
  );

  const files = readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const ran = [];
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`Migration ${file} was already applied but has been modified. Add a new migration instead.`);
      }
      continue;
    }

    await client.exec('BEGIN');
    try {
      await client.exec(sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
      await client.exec('COMMIT');
    } catch (error) {
      await client.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed and was rolled back: ${error.message}`);
    }
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}
