import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Any constant number works: all runners must simply use the SAME one.
const LOCK_KEY = 7_242_001;

/**
 * Applies the numbered .sql files of a folder, in order, each exactly once.
 *
 * `client` is anything with:  query(sql, params?) -> { rows }   and   exec(sql) -> void
 * (the real `pg` client is wrapped for this in migrate.mjs; PGlite already has both.)
 *
 * How it stays safe:
 *  - each migration runs inside one transaction: it fully applies or not at all
 *    (the SQL and the record in `schema_migrations` succeed or fail together)
 *  - applied files are recorded in `schema_migrations` with a checksum
 *  - if a file that was already applied has been edited, we STOP instead of silently
 *    letting dev and production drift apart
 *  - two runners at the same time (you and a script) cannot both apply the same file:
 *    each transaction first takes a lock, then checks AGAIN whether the file is applied.
 *    The lock is per transaction, so it also works through a connection pooler.
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
      if (applied.get(file) !== checksum) throw modified(file);
      continue;
    }

    let appliedByAnotherRunner = false;
    await client.exec('BEGIN');
    try {
      // Only one runner at a time gets past this line; the lock is released at COMMIT/ROLLBACK.
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);

      // Someone else may have applied this file while we were waiting for the lock.
      const already = await client.query('SELECT checksum FROM schema_migrations WHERE filename = $1', [file]);
      if (already.rows.length > 0) {
        if (already.rows[0].checksum !== checksum) throw modified(file);
        appliedByAnotherRunner = true;
      } else {
        await client.exec(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
      }
      await client.exec('COMMIT');
    } catch (error) {
      await client.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed and was rolled back: ${error.message}`);
    }

    if (appliedByAnotherRunner) continue;
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}

function modified(file) {
  return new Error(`Migration ${file} was already applied but has been modified. Add a new migration instead.`);
}
