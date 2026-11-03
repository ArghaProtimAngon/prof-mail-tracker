// Everything the app can ask the server to do. Same actions and answers as the old Google Apps Script.
import type { Db, Row, Statement } from './db.js';
import { backupToSheet, backupStatus, restoreFromSheet } from './backup.js';
import { fail, hashToken, newId, now, profLabel, randomToken, text, todayStr, truthy, uniKey, validDate } from './util.js';

export interface Ctx {
  db: Db;
  /** The logged-in person. Null only for "join". */
  user: Row | null;
}
type Req = Record<string, any>;
type Handler = (ctx: Ctx, req: Req) => Promise<unknown>;

const STATUSES = ['Not sent', 'Sent', 'Seen', 'Replied (positive)', 'Replied (negative)', 'No reply'];
const UNI_STATUSES = ['Not started', 'Preparing', 'Submitted', 'Interview', 'Accepted', 'Rejected'];
const CHECKLIST_KEYS = ['cv', 'sop', 'transcripts', 'recommendations', 'english_test'];
const FUNDING = ['yes', 'no', 'unknown'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const TIERS = ['Dream', 'Target', 'Safe'];
const SETTING_KEYS = ['follow_up_days'];
// Display choices each person can save for themselves (which columns they see in the lists).
const PREFERENCE_KEYS = ['columns_universities', 'columns_professors'];
// "+fee" = I want this column, "-program" = I do not. "+person:u_abc" and "-person:u_abc" do the same for a person's column.
const CHOICE = /^[+-][a-z_]+(:[A-Za-z0-9_]+)?$/;

/** How many devices one person can be logged in on. The oldest one is logged out when this is passed. */
export const MAX_DEVICES = 10;
const MAX_BULK_UNIVERSITIES = 100;

// Fields the app may set, with the maximum length of each.
const PROF_FIELDS: Record<string, number> = {
  name: 200, university: 200, field: 200, email: 200, lab_url: 500, scholar_url: 500, has_funding: 10, deadline: 10, notes: 5000,
};
const UNI_FIELDS: Record<string, number> = {
  name: 200, country: 100, program: 200, website: 500, admission_url: 500, deadline: 10,
  fee: 50, funding: 10, priority: 10, tier: 10, notes: 5000,
};

// ---------- Cleaning what people type ----------

function withHttps(key: string, v: string): string {
  return (key === 'lab_url' || key === 'scholar_url' || key === 'website' || key === 'admission_url') && v && !/^https?:\/\//i.test(v)
    ? `https://${v}`
    : v;
}

function cleanProfField(key: string, value: unknown): string {
  let v = text(value);
  if (key === 'has_funding') {
    v = v.toLowerCase();
    return FUNDING.includes(v) ? v : 'unknown';
  }
  if (key === 'deadline') return validDate(v);
  if (key === 'email') v = v.toLowerCase();
  return withHttps(key, v).slice(0, PROF_FIELDS[key]);
}

function cleanUniField(key: string, value: unknown): string {
  let v = text(value);
  if (key === 'funding') {
    v = v.toLowerCase();
    return FUNDING.includes(v) ? v : 'unknown';
  }
  if (key === 'priority' || key === 'tier') {
    const found = (key === 'priority' ? PRIORITIES : TIERS).find((o) => o.toLowerCase() === v.toLowerCase());
    return found || '';
  }
  if (key === 'deadline') return validDate(v);
  return withHttps(key, v).slice(0, UNI_FIELDS[key]);
}

// ---------- Small database helpers ----------

const activityStatement = (user: Row, action: string, professorId: string, details: string): Statement => [
  'INSERT INTO activity (id, timestamp, user_id, action, professor_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
  [newId('a'), now(), user.user_id, action, professorId, details],
];

async function one(db: Db, sql: string, params: unknown[]): Promise<Row | undefined> {
  return (await db.query(sql, params))[0];
}

async function getProfessor(db: Db, id: unknown): Promise<Row> {
  const p = await one(db, 'SELECT * FROM professors WHERE id=$1 AND NOT deleted', [String(id ?? '')]);
  return p ?? fail('Professor not found.');
}

async function getUniversity(db: Db, id: unknown): Promise<Row> {
  const u = await one(db, 'SELECT * FROM universities WHERE id=$1 AND NOT deleted', [String(id ?? '')]);
  return u ?? fail('University not found.');
}

/** "UPDATE table SET col=$1, ... WHERE id=$n". The column names come from our own lists, never from the request. */
function updateStatement(table: string, idColumn: string, id: string, changes: Record<string, unknown>): Statement {
  const cols = Object.keys(changes);
  const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(', ');
  return [`UPDATE ${table} SET ${sets} WHERE ${idColumn}=$${cols.length + 1}`, [...cols.map((c) => changes[c]), id]];
}

/** My display choices, for example which columns I see. Never shows another person's. */
function readPreferences(rows: Row[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    try {
      const v = JSON.parse(String(r.value));
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[r.key] = v;
    } catch { /* ignore a broken value */ }
  }
  return out;
}

export function requireAdmin(user: Row | null) {
  if (!user || user.role !== 'admin') fail('Only the admin can do this.');
}

const publicUser = (u: Row) => ({ user_id: u.user_id, name: u.name, role: u.role });

// ---------- The actions ----------

export const ACTIONS: Record<string, Handler> = {
  // --- Login ---
  async join({ db }, req) {
    const code = text(req.code);
    if (!code) fail('Missing invite code.');
    const user = await one(db, 'SELECT * FROM users WHERE invite_code=$1 AND NOT revoked', [code]);
    if (!user) fail('This invite link is not valid. Ask Angon for a new one.');

    // The link works on many devices. Every device gets its own login.
    const token = randomToken();
    await db.batch([
      ['INSERT INTO sessions (token_hash, user_id, created_at) VALUES ($1,$2,$3)', [hashToken(token), user.user_id, now()]],
      ['UPDATE users SET invite_used=true WHERE user_id=$1', [user.user_id]],
      [
        `DELETE FROM sessions WHERE user_id=$1 AND id NOT IN
           (SELECT id FROM sessions WHERE user_id=$1 ORDER BY id DESC LIMIT ${MAX_DEVICES})`,
        [user.user_id],
      ],
    ]);
    return { token, user: publicUser(user) };
  },

  async me({ user }) {
    return { user: publicUser(user!) };
  },

  // Everything the app needs on one call, so it opens fast.
  async getAll({ db, user }) {
    const [professors, contacts, users, templates, settings, activity, universities, progress, prefRows] = await db.batch([
      [`SELECT id, name, university, field, email, lab_url, scholar_url, has_funding, deadline, notes, added_by, created_at, updated_at
          FROM professors WHERE NOT deleted ORDER BY created_at, id`],
      [`SELECT c.id, c.professor_id, c.user_id, c.date_sent, c.status, c.response_text, c.updated_at
          FROM contacts c JOIN professors p ON p.id = c.professor_id AND NOT p.deleted ORDER BY c.updated_at, c.id`],
      ['SELECT user_id, name, role, revoked FROM users ORDER BY created_at, user_id'],
      ['SELECT id, user_id, title, subject, body, updated_at FROM templates WHERE user_id=$1 ORDER BY updated_at, id', [user!.user_id]],
      ['SELECT key, value FROM settings'],
      ['SELECT id, timestamp, user_id, action, professor_id, details FROM activity ORDER BY seq DESC LIMIT 200'],
      [`SELECT id, name, country, program, website, admission_url, deadline, fee, funding, priority, tier, notes, added_by, created_at, updated_at
          FROM universities WHERE NOT deleted ORDER BY created_at, id`],
      [`SELECT g.id, g.university_id, g.user_id, g.status, g.checklist, g.updated_at
          FROM university_progress g JOIN universities u ON u.id = g.university_id AND NOT u.deleted ORDER BY g.updated_at, g.id`],
      ['SELECT key, value FROM preferences WHERE user_id=$1', [user!.user_id]],
    ]);
    return {
      universities,
      universityProgress: progress,
      professors,
      contacts,
      users,
      templates,
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      activity,
      preferences: readPreferences(prefRows),
    };
  },

  // --- Professors ---
  async addProfessor({ db, user }, req) {
    const p: Row = { id: newId('p'), added_by: user!.user_id, created_at: now(), updated_at: now() };
    for (const k of Object.keys(PROF_FIELDS)) p[k] = cleanProfField(k, req[k]);
    if (!p.name) fail('Please enter the professor name.');
    await db.batch([
      [
        `INSERT INTO professors (id, name, university, field, email, lab_url, scholar_url, has_funding, deadline, notes, added_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [p.id, p.name, p.university, p.field, p.email, p.lab_url, p.scholar_url, p.has_funding, p.deadline, p.notes, p.added_by, p.created_at, p.updated_at],
      ],
      activityStatement(user!, 'added', p.id, `added ${profLabel(p.name)}`),
    ]);
    return { id: p.id };
  },

  // Only the fields you send are changed.
  async updateProfessor({ db, user }, req) {
    const prof = await getProfessor(db, req.id);
    const changes: Record<string, string> = {};
    for (const k of Object.keys(PROF_FIELDS)) {
      if (req[k] === undefined) continue;
      const v = cleanProfField(k, req[k]);
      if (String(prof[k]) !== v) changes[k] = v;
    }
    const keys = Object.keys(changes);
    if (!keys.length) return { id: prof.id };
    if (changes.name !== undefined && !changes.name) fail('The professor name cannot be empty.');
    const name = changes.name || prof.name;
    await db.batch([
      updateStatement('professors', 'id', prof.id, { ...changes, updated_at: now() }),
      activityStatement(user!, 'edited', prof.id, (keys.length === 1 && keys[0] === 'notes' ? 'edited notes on ' : 'edited ') + profLabel(name)),
    ]);
    return { id: prof.id };
  },

  // Soft delete: the row stays in the database, it is only hidden.
  async deleteProfessor({ db, user }, req) {
    const prof = await getProfessor(db, req.id);
    await db.batch([
      ['UPDATE professors SET deleted=true, updated_at=$1 WHERE id=$2', [now(), prof.id]],
      activityStatement(user!, 'deleted', prof.id, `deleted ${profLabel(prof.name)}`),
    ]);
    return { id: prof.id };
  },

  // --- My progress on one professor ---
  async saveContact({ db, user }, req) {
    const prof = await getProfessor(db, req.professor_id);
    const status = String(req.status ?? '');
    if (!STATUSES.includes(status)) fail('Unknown status.');
    const date = status === 'Not sent' ? '' : validDate(req.date_sent) || todayStr();
    const reply = String(req.response_text ?? '').trim().slice(0, 5000);

    // Only ever MY row: the person comes from the login, never from the request.
    const existing = await one(db, 'SELECT * FROM contacts WHERE professor_id=$1 AND user_id=$2', [prof.id, user!.user_id]);
    const oldStatus = existing ? String(existing.status) : 'Not sent';
    const oldReply = existing ? String(existing.response_text) : '';
    const oldDate = existing ? String(existing.date_sent) : '';
    if (existing && oldStatus === status && oldReply === reply && oldDate === date) return { id: existing.id };

    const label = profLabel(prof.name);
    const details =
      oldStatus !== status ? `marked ${label} as ${status}` : oldReply !== reply ? `updated the reply notes on ${label}` : `changed the date sent for ${label}`;
    const kind = oldStatus !== status || oldReply === reply ? 'status' : 'reply';

    await db.batch([
      [
        `INSERT INTO contacts (id, professor_id, user_id, date_sent, status, response_text, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (professor_id, user_id) DO UPDATE
           SET date_sent=EXCLUDED.date_sent, status=EXCLUDED.status, response_text=EXCLUDED.response_text, updated_at=EXCLUDED.updated_at`,
        [newId('c'), prof.id, user!.user_id, date, status, reply, now()],
      ],
      activityStatement(user!, kind, prof.id, details),
    ]);
    return { professor_id: prof.id };
  },

  // --- Universities (no professor needed) ---
  async addUniversity({ db, user }, req) {
    const u: Row = { id: newId('i'), added_by: user!.user_id, created_at: now(), updated_at: now() };
    for (const k of Object.keys(UNI_FIELDS)) u[k] = cleanUniField(k, req[k]);
    if (!u.name) fail('Please enter the university name.');
    await db.batch([
      [
        `INSERT INTO universities (id, name, country, program, website, admission_url, deadline, fee, funding, priority, tier, notes, added_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [u.id, u.name, u.country, u.program, u.website, u.admission_url, u.deadline, u.fee, u.funding, u.priority, u.tier, u.notes, u.added_by, u.created_at, u.updated_at],
      ],
      activityStatement(user!, 'uni_added', u.id, `added the university ${u.name}`),
    ]);
    return { id: u.id };
  },

  // Paste many names at once (a list, or text with one name per line). Names already in the list are skipped.
  async addUniversities({ db, user }, req) {
    const names: unknown[] = Array.isArray(req.names) ? req.names : String(req.names ?? '').split(/\r?\n/);
    const seen = new Set((await db.query('SELECT name FROM universities WHERE NOT deleted')).map((r) => uniKey(r.name)));
    const toAdd: string[] = [];
    let skipped = 0;
    for (const n of names) {
      const name = text(n).slice(0, UNI_FIELDS.name);
      if (!name) continue;
      if (seen.has(uniKey(name))) { skipped++; continue; }
      seen.add(uniKey(name));
      toAdd.push(name);
    }
    if (toAdd.length > MAX_BULK_UNIVERSITIES) fail(`Please add at most ${MAX_BULK_UNIVERSITIES} universities at a time.`);
    if (toAdd.length) {
      await db.batch([
        ...toAdd.map((name): Statement => [
          'INSERT INTO universities (id, name, funding, added_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [newId('i'), name, 'unknown', user!.user_id, now(), now()],
        ]),
        activityStatement(user!, 'uni_added', '', `added ${toAdd.length} universit${toAdd.length === 1 ? 'y' : 'ies'} to the list`),
      ]);
    }
    return { added: toAdd.length, skipped };
  },

  // Only the fields you send are changed.
  async updateUniversity({ db, user }, req) {
    const uni = await getUniversity(db, req.id);
    const changes: Record<string, string> = {};
    for (const k of Object.keys(UNI_FIELDS)) {
      if (req[k] === undefined) continue;
      const v = cleanUniField(k, req[k]);
      if (String(uni[k]) !== v) changes[k] = v;
    }
    const keys = Object.keys(changes);
    if (!keys.length) return { id: uni.id };
    if (changes.name !== undefined && !changes.name) fail('The university name cannot be empty.');
    await db.batch([
      updateStatement('universities', 'id', uni.id, { ...changes, updated_at: now() }),
      activityStatement(user!, 'uni_edited', uni.id, (keys.length === 1 && keys[0] === 'notes' ? 'edited notes on ' : 'edited ') + (changes.name || uni.name)),
    ]);
    return { id: uni.id };
  },

  async deleteUniversity({ db, user }, req) {
    const uni = await getUniversity(db, req.id);
    await db.batch([
      ['UPDATE universities SET deleted=true, updated_at=$1 WHERE id=$2', [now(), uni.id]],
      activityStatement(user!, 'uni_deleted', uni.id, `deleted the university ${uni.name}`),
    ]);
    return { id: uni.id };
  },

  // My application status and documents checklist for one university.
  async saveUniversityProgress({ db, user }, req) {
    const uni = await getUniversity(db, req.university_id);
    const status = String(req.status ?? '');
    if (!UNI_STATUSES.includes(status)) fail('Unknown status.');
    const wanted: unknown[] = Array.isArray(req.checklist) ? req.checklist : String(req.checklist ?? '').split(',');
    const checklist = CHECKLIST_KEYS.filter((k) => wanted.includes(k)).join(',');

    const existing = await one(db, 'SELECT * FROM university_progress WHERE university_id=$1 AND user_id=$2', [uni.id, user!.user_id]);
    const oldStatus = existing ? String(existing.status) : 'Not started';
    const oldChecklist = existing ? String(existing.checklist) : '';
    if (oldStatus === status && oldChecklist === checklist) return { id: existing ? existing.id : '' };

    await db.batch([
      [
        `INSERT INTO university_progress (id, university_id, user_id, status, checklist, updated_at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (university_id, user_id) DO UPDATE SET status=EXCLUDED.status, checklist=EXCLUDED.checklist, updated_at=EXCLUDED.updated_at`,
        [newId('g'), uni.id, user!.user_id, status, checklist, now()],
      ],
      activityStatement(
        user!, 'uni_status', uni.id,
        oldStatus !== status ? `marked the application to ${uni.name} as ${status}` : `updated the documents checklist for ${uni.name}`
      ),
    ]);
    return { university_id: uni.id };
  },

  // --- Templates (each person has their own) ---
  async saveTemplate({ db, user }, req) {
    const title = text(req.title).slice(0, 100);
    if (!title) fail('Please give the template a title.');
    const subject = text(req.subject).slice(0, 300);
    const body = String(req.body ?? '').slice(0, 10000);
    if (req.id) {
      const t = await one(db, 'SELECT * FROM templates WHERE id=$1', [String(req.id)]);
      if (!t || t.user_id !== user!.user_id) fail('Template not found.');
      await db.query('UPDATE templates SET title=$1, subject=$2, body=$3, updated_at=$4 WHERE id=$5', [title, subject, body, now(), t.id]);
      return { id: t.id };
    }
    const id = newId('t');
    await db.query('INSERT INTO templates (id, user_id, title, subject, body, updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [id, user!.user_id, title, subject, body, now()]);
    return { id };
  },

  async deleteTemplate({ db, user }, req) {
    const t = await one(db, 'SELECT * FROM templates WHERE id=$1', [String(req.id ?? '')]);
    if (!t || t.user_id !== user!.user_id) fail('Template not found.');
    await db.query('DELETE FROM templates WHERE id=$1', [t.id]);
    return { id: t.id };
  },

  // --- Settings ---
  async saveSetting({ db }, req) {
    const key = String(req.key ?? '');
    if (!SETTING_KEYS.includes(key)) fail('Unknown setting.');
    let value: number | string = req.value;
    if (key === 'follow_up_days') {
      value = Math.round(Number(value));
      if (!(value >= 1 && value <= 365)) fail('Follow-up days must be a number between 1 and 365.');
    }
    await db.query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, String(value)]);
    return { key, value };
  },

  // --- My own display choices (separate for every person) ---
  async savePreference({ db, user }, req) {
    const key = String(req.key ?? '');
    if (!PREFERENCE_KEYS.includes(key)) fail('Unknown preference.');
    const value: unknown = req.value;
    if (!Array.isArray(value) || value.length > 60 || !value.every((v) => typeof v === 'string' && v.length <= 60 && CHOICE.test(v))) {
      fail('Those choices are not valid.');
    }
    // Always MY row: the person comes from the login, never from the request.
    if (value.length === 0) {
      await db.query('DELETE FROM preferences WHERE user_id=$1 AND key=$2', [user!.user_id, key]);
    } else {
      await db.query(
        'INSERT INTO preferences (user_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (user_id, key) DO UPDATE SET value=EXCLUDED.value',
        [user!.user_id, key, JSON.stringify(value)]
      );
    }
    return { key };
  },

  // --- Admin only ---
  async createInvite({ db, user }, req) {
    requireAdmin(user);
    const name = text(req.name);
    if (!name) fail('Please enter a name.');
    const id = newId('u');
    const code = randomToken();
    await db.query(
      `INSERT INTO users (user_id, name, role, invite_code, invite_used, revoked, created_at) VALUES ($1,$2,'member',$3,false,false,$4)`,
      [id, name, code, now()]
    );
    return { user_id: id, invite_code: code };
  },

  // Make a fresh link for a person. The old link stops working and every device is logged out. Their data stays theirs.
  async regenerateInvite({ db, user }, req) {
    requireAdmin(user);
    const target = await one(db, 'SELECT * FROM users WHERE user_id=$1', [String(req.user_id ?? '')]);
    if (!target) fail('User not found.');
    const code = randomToken();
    await db.batch([
      ['UPDATE users SET invite_code=$1, invite_used=false, revoked=false WHERE user_id=$2', [code, target.user_id]],
      ['DELETE FROM sessions WHERE user_id=$1', [target.user_id]],
    ]);
    return { user_id: target.user_id, invite_code: code };
  },

  async listUsers({ db, user }) {
    requireAdmin(user);
    const rows = await db.query('SELECT * FROM users ORDER BY created_at, user_id');
    return rows.map((u) => ({
      user_id: u.user_id,
      name: u.name,
      role: u.role,
      invite_used: truthy(u.invite_used),
      revoked: truthy(u.revoked),
      created_at: u.created_at,
      // The link works on many devices, so the admin can copy it again any time (unless revoked).
      invite_code: truthy(u.revoked) ? '' : u.invite_code,
    }));
  },

  async revokeUser({ db, user }, req) {
    requireAdmin(user);
    const target = await one(db, 'SELECT * FROM users WHERE user_id=$1', [String(req.user_id ?? '')]);
    if (!target) fail('User not found.');
    if (target.user_id === user!.user_id) fail('You cannot revoke yourself.');
    await db.batch([
      ['UPDATE users SET revoked=true WHERE user_id=$1', [target.user_id]],
      ['DELETE FROM sessions WHERE user_id=$1', [target.user_id]],
    ]);
    return { user_id: target.user_id };
  },

  // --- Backup to / restore from the Google Sheet (admin only) ---
  async backupStatus({ db, user }) {
    requireAdmin(user);
    return backupStatus(db);
  },
  async backupToSheet({ db, user }) {
    requireAdmin(user);
    return backupToSheet(db, user!);
  },
  async restoreFromSheet({ db, user }, req) {
    requireAdmin(user);
    // The app asks the person to type RESTORE. The server checks it too, so nothing else can trigger a restore by accident.
    if (req.confirm !== 'RESTORE') fail('Restore was not confirmed.');
    return restoreFromSheet(db, user!);
  },
};
