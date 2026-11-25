// The logic of `npm run backup` and `npm run restore` (kept apart from the scripts so tests can run it on a real
// PostgreSQL in memory).
//
// A backup is ONE json file with every row of the tables below. What is NOT in it: the photos (they live in the
// image store, the rows only keep their links) and the short-lived tables (reset codes, login attempts).
// The file holds emails and password hashes: keep it private and never commit it (the `backups/` folder is ignored).

export const FORMAT = 1;

// The order matters when restoring: a row must come after the row it points to (users, then what belongs to them).
export const BACKUP_TABLES = ['users', 'invites', 'restaurants', 'categories', 'items', 'item_sizes', 'restaurant_locations'];

// Every other table, on purpose: short-lived (a test in tests/backup.test.ts fails when a NEW table is in neither list,
// so a new table can never be forgotten by the backup without anyone deciding).
export const SKIPPED_TABLES = ['email_codes', 'login_attempts', 'schema_migrations'];

/**
 * Reads everything in ONE consistent view of the database (a read-only transaction), so a menu being edited at that
 * very moment can never end up half in the file. `client` is anything with  query(sql, params?) -> { rows }.
 */
export async function exportBackup(client, { now = new Date(), database = null } = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const migrations = (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map((r) => r.filename);
    const tables = {};
    for (const t of BACKUP_TABLES) {
      const res = await client.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM ${t} t`);
      tables[t] = res.rows[0].rows;
    }
    const counts = Object.fromEntries(BACKUP_TABLES.map((t) => [t, tables[t].length]));
    return { format: FORMAT, createdAt: now.toISOString(), database, migrations, counts, tables };
  } finally {
    await client.query('COMMIT'); // nothing was written; this only ends the read-only view
  }
}

/**
 * Puts a backup into an EMPTY database that already has the same migrations. It refuses anything else, and it is
 * all-or-nothing: a problem half way leaves the database exactly as empty as it was.
 */
export async function restoreBackup(client, data) {
  if (!data || data.format !== FORMAT) throw new Error(`This is not a backup this version understands (format ${data?.format ?? 'missing'}, expected ${FORMAT}).`);
  for (const t of BACKUP_TABLES) {
    if (!Array.isArray(data.tables?.[t])) throw new Error(`The backup file is incomplete: the table "${t}" is missing.`);
    if (data.counts?.[t] !== data.tables[t].length) throw new Error(`The backup file is damaged: "${t}" should have ${data.counts?.[t]} rows but has ${data.tables[t].length}.`);
  }

  const here = (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map((r) => r.filename);
  if (JSON.stringify(here) !== JSON.stringify(data.migrations)) {
    throw new Error(
      `The database and the backup are not at the same version.\n  backup:   ${data.migrations.join(', ')}\n  database: ${here.join(', ') || '(no migrations yet)'}\n` +
      'Run the migrations on this database first (npm run migrate) until both lists are the same.',
    );
  }

  for (const t of BACKUP_TABLES) {
    const n = (await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n;
    if (n > 0) throw new Error(`The database is not empty ("${t}" has ${n} rows). A restore never overwrites anything: use an empty database.`);
  }

  await client.query('BEGIN');
  try {
    for (const t of BACKUP_TABLES) {
      if (data.tables[t].length === 0) continue;
      await client.query(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)`, [JSON.stringify(data.tables[t])]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return data.counts;
}
