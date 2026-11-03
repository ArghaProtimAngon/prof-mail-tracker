// A tiny database interface, so the same code runs on Neon (live) and on an in-memory
// test database (tests). Every statement is plain SQL with $1, $2... placeholders.
import { neon } from '@neondatabase/serverless';

export type Row = Record<string, any>;
export type Statement = [text: string, params?: unknown[]];

export interface Db {
  query(text: string, params?: unknown[]): Promise<Row[]>;
  /** Several statements as ONE transaction: all of them happen, or none. */
  batch(statements: Statement[]): Promise<Row[][]>;
}

export function neonDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return {
    query: (text, params = []) => sql.query(text, params as any[]) as Promise<Row[]>,
    batch: (statements) =>
      statements.length
        ? (sql.transaction(statements.map(([text, params = []]) => sql.query(text, params as any[]))) as Promise<Row[][]>)
        : Promise.resolve([]),
  };
}

let shared: Db | null = null;

/** The live database, created once per server instance. */
export function getDb(): Db {
  if (!shared) {
    // The Neon connection in Vercel provides DATABASE_URL (and POSTGRES_URL with the same address).
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('The database is not set up yet: DATABASE_URL is missing.');
    shared = neonDb(url);
  }
  return shared;
}
