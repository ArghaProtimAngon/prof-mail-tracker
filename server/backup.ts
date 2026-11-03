// Backup to the Google Sheet, restore from it, and the one-time import from the old Sheet-based app.
// The Sheet is reached through a small Google Apps Script (apps-script/Code.gs) protected by a secret key.
import type { Db, Row, Statement } from './db.js';
import { ensureSchema, SHEET_TABLES, type SheetTable } from './schema.js';
import { fail, hashToken, now, randomToken, truthy } from './util.js';

type Tables = Record<string, string[][]>;

export interface SheetClient {
  /** Replace the data rows (below the header row) of each tab. */
  write(tables: Tables): Promise<void>;
  /** The data rows of each tab. */
  read(): Promise<Tables>;
}

// ---------- Talking to Google Apps Script ----------

async function callScript(payload: Record<string, unknown>): Promise<any> {
  const url = process.env.SHEET_API_URL;
  const key = process.env.BACKUP_KEY;
  if (!url || !key) fail('Backup is not set up yet. Add SHEET_API_URL and BACKUP_KEY in Vercel (the README explains how).');

  let res: Response;
  try {
    // "text/plain" keeps Google from asking for permission first. Google answers with a redirect that fetch follows.
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, key }), redirect: 'follow' });
  } catch {
    fail('Could not reach the Google Sheet. Please try again.');
  }
  let body: any;
  try {
    body = await res.json();
  } catch {
    fail('The Google Sheet script gave an unexpected answer. Check that SHEET_API_URL is the Web App URL and that "Who has access" is "Anyone".');
  }
  if (!body.ok) fail(`The Google Sheet said: ${body.error || 'something went wrong'}`);
  return body.data;
}

let client: SheetClient = {
  write: (tables) => callScript({ action: 'backup_write', tables }),
  read: async () => (await callScript({ action: 'backup_read' })).tables,
};

/** Tests plug in a fake Sheet here. */
export function setSheetClient(c: SheetClient) {
  client = c;
}

// ---------- Database -> Sheet ----------

const ORDER: Record<string, string> = {
  activity: 'seq',
  professors: 'created_at, id',
  universities: 'created_at, id',
  users: 'created_at, user_id',
};

const dbColumns = (t: SheetTable) => t.columns.filter((c) => c !== 'session_token');

/** All the data as rows of text, in the column order of each Sheet tab. */
export async function exportTables(db: Db): Promise<Tables> {
  const results = await db.batch(
    SHEET_TABLES.map((t): Statement => [`SELECT ${dbColumns(t).join(', ')} FROM ${t.table} ORDER BY ${ORDER[t.table] ?? t.columns[0]}`])
  );
  const out: Tables = {};
  SHEET_TABLES.forEach((t, i) => {
    out[t.tab] = results[i].map((row) =>
      t.columns.map((c) => (c === 'session_token' ? '' : t.bool.includes(c) ? (truthy(row[c]) ? 'TRUE' : 'FALSE') : String(row[c] ?? '')))
    );
  });
  return out;
}

const counts = (tables: Tables) => Object.fromEntries(Object.entries(tables).map(([tab, rows]) => [tab, rows.length]));

async function setMeta(db: Db, values: Record<string, string>) {
  await db.batch(
    Object.entries(values).map(([k, v]): Statement => [
      'INSERT INTO meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
      [k, v],
    ])
  );
}

export async function backupStatus(db: Db) {
  const meta = Object.fromEntries((await db.query('SELECT key, value FROM meta')).map((r) => [r.key, r.value]));
  return {
    configured: Boolean(process.env.SHEET_API_URL && process.env.BACKUP_KEY),
    last_backup_at: meta.last_backup_at || '',
    last_backup_by: meta.last_backup_by || '',
    last_restore_at: meta.last_restore_at || '',
    last_restore_by: meta.last_restore_by || '',
  };
}

export async function backupToSheet(db: Db, user: Row) {
  const tables = await exportTables(db);
  await client.write(tables);
  const at = now();
  await setMeta(db, { last_backup_at: at, last_backup_by: String(user.name) });
  return { at, counts: counts(tables) };
}

// ---------- Sheet -> Database ----------

const STATUSES = ['Not sent', 'Sent', 'Seen', 'Replied (positive)', 'Replied (negative)', 'No reply'];
const UNI_STATUSES = ['Not started', 'Preparing', 'Submitted', 'Interview', 'Accepted', 'Rejected'];
const FUNDING = ['yes', 'no', 'unknown'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const TIERS = ['Dream', 'Target', 'Safe'];

const oneOf = (v: string, allowed: string[], fallback: string) => allowed.find((a) => a.toLowerCase() === v.toLowerCase()) ?? fallback;
const dateOrEmpty = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

/** Columns that must hold one of a few values. Anything else typed by hand in the Sheet is corrected. */
const FIX: Record<string, (row: Record<string, any>) => void> = {
  users: (r) => { r.role = oneOf(r.role, ['admin', 'member'], 'member'); },
  professors: (r) => { r.has_funding = oneOf(r.has_funding, FUNDING, 'unknown'); r.deadline = dateOrEmpty(r.deadline); },
  contacts: (r) => { r.status = oneOf(r.status, STATUSES, 'Not sent'); r.date_sent = dateOrEmpty(r.date_sent); },
  universities: (r) => {
    r.funding = oneOf(r.funding, FUNDING, 'unknown');
    r.priority = oneOf(r.priority, PRIORITIES, '');
    r.tier = oneOf(r.tier, TIERS, '');
    r.deadline = dateOrEmpty(r.deadline);
  },
  university_progress: (r) => { r.status = oneOf(r.status, UNI_STATUSES, 'Not started'); },
};

/** The columns that identify a row. Rows with an empty one are dropped, and repeated ones keep the last copy. */
const KEYS: Record<string, string[][]> = {
  users: [['user_id'], ['invite_code']],
  professors: [['id']],
  contacts: [['id'], ['professor_id', 'user_id']],
  templates: [['id']],
  activity: [['id']],
  settings: [['key']],
  universities: [['id']],
  university_progress: [['id'], ['university_id', 'user_id']],
};

interface Prepared {
  table: SheetTable;
  rows: Record<string, any>[];
}

/** Turns what the Sheet returned into clean rows, ready for the database. */
function prepare(tables: Tables): Prepared[] {
  return SHEET_TABLES.map((t) => {
    const raw = tables[t.tab];
    if (!Array.isArray(raw)) fail(`The Google Sheet has no "${t.tab}" tab. Run a backup first, so the Sheet is filled in.`);

    let rows = raw
      .map((cells) => {
        const row: Record<string, any> = {};
        t.columns.forEach((c, i) => { row[c] = String(cells[i] ?? '').trim(); });
        return row;
      })
      .filter((row) => t.columns.some((c) => row[c] !== ''));

    // The primary key must not be empty (users with no invite code get a fresh one).
    const pk = KEYS[t.table][0][0];
    rows = rows.filter((row) => row[pk] !== '');
    if (t.table === 'users') rows.forEach((r) => { if (!r.invite_code) r.invite_code = randomToken(); });

    t.bool.forEach((c) => rows.forEach((r) => { r[c] = truthy(r[c]); }));
    rows.forEach((r) => FIX[t.table]?.(r));

    // Repeated keys: keep the LAST row of each.
    for (const key of KEYS[t.table]) {
      const last = new Map<string, number>();
      rows.forEach((r, i) => last.set(key.map((c) => r[c]).join('\u0000'), i));
      rows = rows.filter((r, i) => last.get(key.map((c) => r[c]).join('\u0000')) === i);
    }
    // Keep the activity feed in time order (the newest rows are read last).
    if (t.table === 'activity') rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    return { table: t, rows };
  });
}

function insertStatements(p: Prepared): Statement[] {
  const cols = dbColumns(p.table);
  const perChunk = Math.max(1, Math.floor(20000 / cols.length));
  const out: Statement[] = [];
  for (let i = 0; i < p.rows.length; i += perChunk) {
    const chunk = p.rows.slice(i, i + perChunk);
    const params: unknown[] = [];
    const values = chunk.map((row) => `(${cols.map((c) => { params.push(row[c]); return `$${params.length}`; }).join(',')})`);
    out.push([`INSERT INTO ${p.table.table} (${cols.join(',')}) VALUES ${values.join(',')}`, params]);
  }
  return out;
}

interface ApplyOptions {
  /** Only these people may be logged in afterwards. Logins of people who stay are kept. */
  caller?: Row;
  /** Import the logins that the Sheet holds (the one-time move from the old app). */
  importLogins?: boolean;
}

/** Replaces everything in the database with the Sheet's data, as ONE transaction. */
async function applySheetData(db: Db, tables: Tables, opts: ApplyOptions) {
  const prepared = prepare(tables);
  const users = prepared.find((p) => p.table.table === 'users')!.rows;

  if (!users.some((u) => u.role === 'admin' && !u.revoked)) {
    fail('The Sheet has no active admin in its Users tab, so nothing was changed. Run a backup first.');
  }
  if (opts.caller && !users.some((u) => u.user_id === opts.caller!.user_id && u.role === 'admin' && !u.revoked)) {
    fail('The Sheet does not contain your admin account, so nothing was changed.');
  }

  const statements: Statement[] = [];
  // 1. Everything except the users is replaced.
  for (const p of prepared) if (p.table.table !== 'users') statements.push([`DELETE FROM ${p.table.table}`]);
  // 2. Users: people who are no longer in the Sheet go (their logins with them). The others are updated in place,
  //    so the people who stay logged in.
  statements.push(['DELETE FROM users WHERE user_id <> ALL($1::text[])', [users.map((u) => u.user_id)]]);
  statements.push([`UPDATE users SET invite_code = 'old_' || user_id`]); // makes room if two people swapped codes
  const userCols = dbColumns(SHEET_TABLES[0]);
  const perUser = userCols.map((c) => `${c}=EXCLUDED.${c}`).join(',');
  for (const u of users) {
    statements.push([
      `INSERT INTO users (${userCols.join(',')}) VALUES (${userCols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (user_id) DO UPDATE SET ${perUser}`,
      userCols.map((c) => u[c]),
    ]);
  }
  statements.push(['DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM users WHERE revoked)']);
  // 3. The rest of the tables.
  for (const p of prepared) if (p.table.table !== 'users') statements.push(...insertStatements(p));
  // 4. Logins from the old app.
  if (opts.importLogins) {
    for (const u of users.filter((x) => !x.revoked)) {
      const tokens = (tables.Users.find((r) => r[0] === u.user_id)?.[4] ?? '').split(',').map((t) => t.trim()).filter((t) => t.length >= 32);
      for (const token of tokens.slice(-10)) {
        statements.push(['INSERT INTO sessions (token_hash, user_id, created_at) VALUES ($1,$2,$3) ON CONFLICT (token_hash) DO NOTHING', [hashToken(token), u.user_id, now()]]);
      }
    }
  }
  await db.batch(statements);
  return Object.fromEntries(prepared.map((p) => [p.table.tab, p.rows.length]));
}

export async function restoreFromSheet(db: Db, user: Row) {
  const tables = await client.read();
  const done = await applySheetData(db, tables, { caller: user });
  await setMeta(db, { last_restore_at: now(), last_restore_by: String(user.name) });
  return { counts: done };
}

/** One time only: moves everything from the old Sheet-based app into an EMPTY database. */
export async function importFromSheet(db: Db) {
  await ensureSchema(db);
  const existing = await db.query('SELECT 1 FROM users LIMIT 1');
  if (existing.length) fail('The database already has users, so nothing was imported.');
  const tables = await client.read();
  return { counts: await applySheetData(db, tables, { importLogins: true }) };
}

