// The tables, and the column order used when copying to and from the Google Sheet.
// Dates and times are kept as text ("2026-10-31" and ISO times) exactly like in the Sheet.
import type { Db } from './db.js';

export const DDL = `
CREATE TABLE IF NOT EXISTS users (
  user_id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  invite_used boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  created_at text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
  id bigserial PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS professors (
  id text PRIMARY KEY,
  name text NOT NULL,
  university text NOT NULL DEFAULT '',
  field text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  lab_url text NOT NULL DEFAULT '',
  scholar_url text NOT NULL DEFAULT '',
  has_funding text NOT NULL DEFAULT 'unknown',
  deadline text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  added_by text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '',
  deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS contacts (
  id text PRIMARY KEY,
  professor_id text NOT NULL,
  user_id text NOT NULL,
  date_sent text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Not sent',
  response_text text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '',
  UNIQUE (professor_id, user_id)
);
CREATE TABLE IF NOT EXISTS templates (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS activity (
  seq bigserial NOT NULL,
  id text PRIMARY KEY,
  timestamp text NOT NULL,
  user_id text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  professor_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS activity_seq ON activity(seq);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS universities (
  id text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  program text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  admission_url text NOT NULL DEFAULT '',
  deadline text NOT NULL DEFAULT '',
  fee text NOT NULL DEFAULT '',
  funding text NOT NULL DEFAULT 'unknown',
  priority text NOT NULL DEFAULT '',
  tier text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  added_by text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '',
  deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS university_progress (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'Not started',
  checklist text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '',
  UNIQUE (university_id, user_id)
);
CREATE TABLE IF NOT EXISTS preferences (
  user_id text NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS meta (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
`;

/**
 * One entry per tab of the backup Google Sheet: the tab name, the database table,
 * and the columns in the SAME order as the header row of that tab.
 * "bool" columns are written to the Sheet as TRUE / FALSE.
 */
export interface SheetTable {
  tab: string;
  table: string;
  columns: string[];
  bool: string[];
}

export const SHEET_TABLES: SheetTable[] = [
  { tab: 'Users', table: 'users', bool: ['invite_used', 'revoked'],
    // The Sheet also has a session_token column. We never back up logins, so it stays empty.
    columns: ['user_id', 'name', 'role', 'invite_code', 'session_token', 'invite_used', 'revoked', 'created_at'] },
  { tab: 'Professors', table: 'professors', bool: ['deleted'],
    columns: ['id', 'name', 'university', 'field', 'email', 'lab_url', 'scholar_url', 'has_funding', 'deadline', 'notes', 'added_by', 'created_at', 'updated_at', 'deleted'] },
  { tab: 'Contacts', table: 'contacts', bool: [],
    columns: ['id', 'professor_id', 'user_id', 'date_sent', 'status', 'response_text', 'updated_at'] },
  { tab: 'Templates', table: 'templates', bool: [],
    columns: ['id', 'user_id', 'title', 'subject', 'body', 'updated_at'] },
  { tab: 'Activity', table: 'activity', bool: [],
    columns: ['id', 'timestamp', 'user_id', 'action', 'professor_id', 'details'] },
  { tab: 'Settings', table: 'settings', bool: [],
    columns: ['key', 'value'] },
  { tab: 'Universities', table: 'universities', bool: ['deleted'],
    columns: ['id', 'name', 'country', 'program', 'website', 'admission_url', 'deadline', 'fee', 'funding', 'priority', 'tier', 'notes', 'added_by', 'created_at', 'updated_at', 'deleted'] },
  { tab: 'UniversityProgress', table: 'university_progress', bool: [],
    columns: ['id', 'university_id', 'user_id', 'status', 'checklist', 'updated_at'] },
];

let ready: Promise<void> | null = null;

/** Creates the tables if they are missing. Safe to call again; it runs once per server instance. */
export function ensureSchema(db: Db): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // One statement at a time (the live database does not accept several in one call).
      for (const statement of DDL.split(';').map((s) => s.trim()).filter(Boolean)) await db.query(statement);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Tests use a fresh database each time, so they reset this. */
export function resetSchemaCache() {
  ready = null;
}
