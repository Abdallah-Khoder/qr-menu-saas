import { neon } from '@neondatabase/serverless';

/** The only thing the app needs from a database. Neon (real) and PGlite (tests) both fit. */
/* eslint-disable @typescript-eslint/no-explicit-any -- rows are shaped by each SQL query */
export type Db = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

let override: Db | null = null;
let real: Db | null = null;

/** Tests call this to use an in-memory database instead of Neon. */
export function setDb(db: Db | null) {
  override = db;
}

export function getDb(): Db {
  if (override) return override;
  if (!real) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const sql = neon(url);
    real = { query: async (text, params = []) => ({ rows: (await sql.query(text, params)) as any[] }) };
  }
  return real;
}
