// Tests for the server. They run on an in-memory Postgres (PGlite), so nothing real is touched.
// Run with:  npm test
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import type { Db, Statement } from '../server/db.js';
import { handleRpc } from '../server/handler.js';
import { backupToSheet, importFromSheet, setSheetClient } from '../server/backup.js';
import { resetSchemaCache } from '../server/schema.js';

// ---------- helpers ----------

function pgliteDb(pg: PGlite): Db {
  return {
    query: async (text, params = []) => (await pg.query(text, params as any[])).rows as any[],
    batch: (statements: Statement[]) =>
      pg.transaction(async (tx) => {
        const out: any[][] = [];
        for (const [text, params = []] of statements) out.push((await tx.query(text, params as any[])).rows as any[]);
        return out;
      }),
  };
}

async function freshDb() {
  resetSchemaCache();
  return pgliteDb(new PGlite());
}

type Tables = Record<string, string[][]>;
/** A fake Google Sheet that just remembers what it is given. */
function fakeSheet(initial: Tables = {}) {
  const sheet = { tables: initial as Tables | null };
  setSheetClient({
    write: async (t) => { sheet.tables = JSON.parse(JSON.stringify(t)); },
    read: async () => JSON.parse(JSON.stringify(sheet.tables ?? {})),
  });
  return sheet;
}

const run = (db: Db, action: string, params: Record<string, unknown> = {}, token = '') =>
  handleRpc(db, { action, token, ...params }) as Promise<any>;
const ok = async (db: Db, action: string, params: Record<string, unknown> = {}, token = '') => {
  const r = await run(db, action, params, token);
  assert.equal(r.ok, true, `${action} failed: ${JSON.stringify(r)}`);
  return r.data;
};
const bad = async (db: Db, action: string, params: Record<string, unknown> = {}, token = '') => {
  const r = await run(db, action, params, token);
  assert.equal(r.ok, false, `${action} should have failed`);
  return r.error as string;
};

/** A database with the first admin ("Angon"), like the old setup() made. */
async function withAdmin() {
  const db = await freshDb();
  await (await import('../server/schema.js')).ensureSchema(db);
  await db.query(
    `INSERT INTO users (user_id, name, role, invite_code, invite_used, revoked, created_at) VALUES ('u_admin','Angon','admin','ADMINCODE',false,false,'2026-01-01T00:00:00.000Z')`
  );
  await db.query(`INSERT INTO settings (key, value) VALUES ('follow_up_days','10')`);
  const { token } = await ok(db, 'join', { code: 'ADMINCODE' });
  return { db, T: token as string };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name);
    throw e;
  }
}

// ---------- login ----------

await test('login: one link works on many devices, logins are stored hashed', async () => {
  const { db, T } = await withAdmin();
  const b = await ok(db, 'join', { code: 'ADMINCODE' });
  assert.notEqual(b.token, T);
  await ok(db, 'me', {}, T);
  await ok(db, 'me', {}, b.token);
  const stored = (await db.query('SELECT token_hash FROM sessions')).map((r) => r.token_hash);
  assert.ok(!stored.includes(T), 'the plain login must not be stored');
  assert.equal(await bad(db, 'getAll', {}, 'x'.repeat(10)), 'AUTH');
  assert.equal(await bad(db, 'me', {}, ''), 'AUTH');
  assert.match(await bad(db, 'join', { code: 'nope' }), /not valid/);
  assert.equal(await bad(db, 'constructor', {}, T), 'Unknown action.');
  assert.equal(await bad(db, 'toString', {}, T), 'Unknown action.');
});

await test('login: invite, revoke, new link, device limit', async () => {
  const { db, T } = await withAdmin();
  const inv = await ok(db, 'createInvite', { name: 'Ayon' }, T);
  const j = await ok(db, 'join', { code: inv.invite_code });
  const T2 = j.token;
  assert.match(await bad(db, 'listUsers', {}, T2), /Only the admin/);
  assert.match(await bad(db, 'createInvite', { name: 'X' }, T2), /Only the admin/);
  assert.match(await bad(db, 'createInvite', { name: ' ' }, T), /enter a name/);
  const T2b = (await ok(db, 'join', { code: inv.invite_code })).token;
  await ok(db, 'me', {}, T2);
  await ok(db, 'me', {}, T2b);

  const users = await ok(db, 'listUsers', {}, T);
  assert.equal(users.find((u: any) => u.name === 'Ayon').invite_code, inv.invite_code, 'link can be copied again');

  // a new link kills the old link and every device
  const re = await ok(db, 'regenerateInvite', { user_id: j.user.user_id }, T);
  assert.equal(await bad(db, 'me', {}, T2), 'AUTH');
  assert.equal(await bad(db, 'me', {}, T2b), 'AUTH');
  assert.match(await bad(db, 'join', { code: inv.invite_code }), /not valid/);
  const fresh = (await ok(db, 'join', { code: re.invite_code })).token;
  await ok(db, 'me', {}, fresh);

  // the 11th device logs out the oldest
  const toks = [fresh];
  for (let i = 0; i < 10; i++) toks.push((await ok(db, 'join', { code: re.invite_code })).token);
  assert.equal(await bad(db, 'me', {}, toks[0]), 'AUTH');
  await ok(db, 'me', {}, toks[1]);
  await ok(db, 'me', {}, toks[10]);

  // revoke
  await ok(db, 'revokeUser', { user_id: j.user.user_id }, T);
  assert.equal(await bad(db, 'me', {}, toks[10]), 'AUTH');
  assert.match(await bad(db, 'join', { code: re.invite_code }), /not valid/);
  assert.match(await bad(db, 'revokeUser', { user_id: 'u_admin' }, T), /cannot revoke yourself/);
});

// ---------- professors, progress, templates, settings ----------

async function twoPeople() {
  const { db, T } = await withAdmin();
  const inv = await ok(db, 'createInvite', { name: 'Ayon' }, T);
  const T2 = (await ok(db, 'join', { code: inv.invite_code })).token as string;
  return { db, T, T2, ayonId: inv.user_id as string };
}

await test('professors: validation, partial updates, soft delete, activity', async () => {
  const { db, T } = await twoPeople();
  const { id } = await ok(db, 'addProfessor', {
    name: 'Jane Doe', university: 'MIT', email: ' Jane@MIT.edu ', deadline: '2026-11-05', notes: '=1+1', lab_url: 'lab.mit.edu', has_funding: 'YES',
  }, T);
  assert.match(await bad(db, 'addProfessor', { name: '' }, T), /professor name/);
  assert.match(await bad(db, 'addProfessor', { name: 'X', deadline: 'tomorrow' }, T), /Dates must look like/);

  let all = await ok(db, 'getAll', {}, T);
  const p = all.professors[0];
  assert.equal(p.email, 'jane@mit.edu');
  assert.equal(p.lab_url, 'https://lab.mit.edu');
  assert.equal(p.has_funding, 'yes');
  assert.equal(p.notes, '=1+1');
  assert.equal(p.deleted, undefined);
  assert.equal(all.settings.follow_up_days, '10');
  assert.equal(all.users.length, 2);

  await ok(db, 'updateProfessor', { id, notes: 'Nice lab' }, T);
  assert.match(await bad(db, 'updateProfessor', { id, name: '' }, T), /cannot be empty/);
  all = await ok(db, 'getAll', {}, T);
  assert.equal(all.professors[0].name, 'Jane Doe');
  assert.equal(all.professors[0].notes, 'Nice lab');
  assert.equal(all.activity[0].details, 'edited notes on Prof. Jane Doe');

  await ok(db, 'deleteProfessor', { id }, T);
  all = await ok(db, 'getAll', {}, T);
  assert.equal(all.professors.length, 0);
  assert.equal((await db.query('SELECT 1 FROM professors')).length, 1, 'row is still in the database');
  assert.match(await bad(db, 'updateProfessor', { id, notes: 'x' }, T), /not found/);
});

await test('contacts: each person has their own, everyone can read', async () => {
  const { db, T, T2 } = await twoPeople();
  const { id } = await ok(db, 'addProfessor', { name: 'Jane Doe' }, T);
  assert.match(await bad(db, 'saveContact', { professor_id: id, status: 'Bogus' }, T), /Unknown status/);
  await ok(db, 'saveContact', { professor_id: id, status: 'Sent', date_sent: '2026-10-20' }, T);
  await ok(db, 'saveContact', { professor_id: id, status: 'Seen', date_sent: '2026-10-21' }, T2);
  await ok(db, 'saveContact', { professor_id: id, status: 'Replied (positive)', date_sent: '2026-10-20', response_text: 'Yes!' }, T);

  let all = await ok(db, 'getAll', {}, T2);
  assert.equal(all.contacts.length, 2, 'one row per person');
  const mine = all.contacts.find((c: any) => c.status === 'Seen');
  assert.equal(mine.date_sent, '2026-10-21', 'Ayon\'s date was not changed by Angon');
  assert.equal(all.activity[0].details, 'marked Prof. Jane Doe as Replied (positive)');

  await ok(db, 'saveContact', { professor_id: id, status: 'Replied (positive)', date_sent: '2026-10-20', response_text: 'Yes! Call me' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).activity[0].details, 'updated the reply notes on Prof. Jane Doe');
  await ok(db, 'saveContact', { professor_id: id, status: 'Replied (positive)', date_sent: '2026-10-22', response_text: 'Yes! Call me' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).activity[0].details, 'changed the date sent for Prof. Jane Doe');
  const n = (await db.query('SELECT 1 FROM activity')).length;
  await ok(db, 'saveContact', { professor_id: id, status: 'Replied (positive)', date_sent: '2026-10-22', response_text: 'Yes! Call me' }, T);
  assert.equal((await db.query('SELECT 1 FROM activity')).length, n, 'saving the same thing twice logs nothing');

  await ok(db, 'saveContact', { professor_id: id, status: 'Not sent', date_sent: '2026-10-25' }, T);
  all = await ok(db, 'getAll', {}, T);
  assert.equal(all.contacts.find((c: any) => c.status === 'Not sent').date_sent, '', '"Not sent" has no date');
  // sending a date without a date uses today
  await ok(db, 'saveContact', { professor_id: id, status: 'Sent' }, T2);
  assert.match((await ok(db, 'getAll', {}, T)).contacts.find((c: any) => c.status === 'Sent').date_sent, /^\d{4}-\d{2}-\d{2}$/);
  // the person always comes from the login: a made-up user_id is ignored
  await ok(db, 'saveContact', { professor_id: id, status: 'Seen', user_id: 'u_admin' }, T2);
  assert.equal((await db.query(`SELECT 1 FROM contacts WHERE user_id='u_admin' AND status='Seen'`)).length, 0);
});

await test('templates are private; settings are validated', async () => {
  const { db, T, T2 } = await twoPeople();
  const t = await ok(db, 'saveTemplate', { title: 'Intro', subject: 'Hi {professor_name}', body: 'Dear {professor_last_name}' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).templates.length, 1);
  assert.equal((await ok(db, 'getAll', {}, T2)).templates.length, 0);
  assert.match(await bad(db, 'deleteTemplate', { id: t.id }, T2), /not found/);
  assert.match(await bad(db, 'saveTemplate', { id: t.id, title: 'Hack' }, T2), /not found/);
  await ok(db, 'saveTemplate', { id: t.id, title: 'Intro 2', subject: 's', body: 'b' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).templates[0].title, 'Intro 2');
  await ok(db, 'deleteTemplate', { id: t.id }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).templates.length, 0);

  assert.match(await bad(db, 'saveSetting', { key: 'follow_up_days', value: 0 }, T), /between 1 and 365/);
  assert.match(await bad(db, 'saveSetting', { key: 'nope', value: 1 }, T), /Unknown setting/);
  await ok(db, 'saveSetting', { key: 'follow_up_days', value: '14' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).settings.follow_up_days, '14');
});

await test('universities: add, bulk add, progress per person, soft delete', async () => {
  const { db, T, T2 } = await twoPeople();
  const ur = await ok(db, 'addUniversity', { name: '  MIT ', country: 'USA', website: 'mit.edu', deadline: '2026-12-01', priority: 'high', tier: 'DREAM', funding: 'maybe', fee: '$75' }, T);
  const uid = ur.id as string;
  assert.match(await bad(db, 'addUniversity', { name: '' }, T), /university name/);
  assert.match(await bad(db, 'addUniversity', { name: 'X', deadline: 'soon' }, T), /Dates must look like/);
  let all = await ok(db, 'getAll', {}, T);
  const u = all.universities[0];
  assert.deepEqual([u.name, u.website, u.priority, u.tier, u.funding], ['MIT', 'https://mit.edu', 'High', 'Dream', 'unknown']);
  assert.equal(all.activity[0].details, 'added the university MIT');
  assert.equal(all.activity[0].professor_id, uid, 'activity links to the university');

  assert.deepEqual(await ok(db, 'addUniversities', { names: 'mit\n Stanford \n\nStanford\nOxford' }, T), { added: 2, skipped: 2 });
  assert.equal((await ok(db, 'getAll', {}, T)).universities.length, 3);
  assert.match(await bad(db, 'addUniversities', { names: Array.from({ length: 101 }, (_, i) => `Uni ${i}`) }, T), /at most 100/);

  await ok(db, 'updateUniversity', { id: uid, notes: 'Great' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).activity[0].details, 'edited notes on MIT');
  assert.match(await bad(db, 'updateUniversity', { id: uid, name: '' }, T), /cannot be empty/);

  assert.match(await bad(db, 'saveUniversityProgress', { university_id: uid, status: 'Nope' }, T), /Unknown status/);
  await ok(db, 'saveUniversityProgress', { university_id: uid, status: 'Submitted', checklist: ['sop', 'cv', 'bogus'] }, T);
  await ok(db, 'saveUniversityProgress', { university_id: uid, status: 'Preparing', checklist: [] }, T2);
  all = await ok(db, 'getAll', {}, T);
  assert.equal(all.universityProgress.length, 2);
  assert.equal(all.universityProgress.find((r: any) => r.status === 'Submitted').checklist, 'cv,sop');
  assert.equal(all.activity[0].details, 'marked the application to MIT as Preparing');
  await ok(db, 'saveUniversityProgress', { university_id: uid, status: 'Submitted', checklist: ['cv', 'sop', 'transcripts'] }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).activity[0].details, 'updated the documents checklist for MIT');
  await ok(db, 'saveUniversityProgress', { university_id: uid, status: 'Submitted', checklist: 'cv,sop,transcripts' }, T);
  assert.equal((await db.query('SELECT 1 FROM university_progress')).length, 2, 'no new row for the same person');
  assert.equal((await ok(db, 'getAll', {}, T2)).universityProgress.length, 2, 'the other person sees everyone');

  await ok(db, 'deleteUniversity', { id: uid }, T);
  all = await ok(db, 'getAll', {}, T);
  assert.equal(all.universities.length, 2);
  assert.equal(all.universityProgress.length, 0);
  assert.match(await bad(db, 'saveUniversityProgress', { university_id: uid, status: 'Submitted' }, T), /not found/);
});

await test('errors from the database are not shown to people', async () => {
  const { db, T } = await withAdmin();
  const broken: Db = { query: async () => { throw new Error('password authentication failed for user "secret"'); }, batch: async () => { throw new Error('boom'); } };
  resetSchemaCache();
  const quiet = console.error;
  console.error = () => {}; // the server logs the real problem; keep the test output clean
  const r = (await handleRpc(broken, { action: 'getAll', token: T })) as any;
  console.error = quiet;
  assert.equal(r.ok, false);
  assert.ok(!/secret|boom/.test(r.error), r.error);
  void db;
});

await test('preferences: each person has their own, validated', async () => {
  const { db, T, T2 } = await twoPeople();
  assert.deepEqual((await ok(db, 'getAll', {}, T)).preferences, {});
  await ok(db, 'savePreference', { key: 'columns_universities', value: ['+fee', '-program'] }, T);
  await ok(db, 'savePreference', { key: 'columns_professors', value: ['+email'] }, T2);
  assert.deepEqual((await ok(db, 'getAll', {}, T)).preferences, { columns_universities: ['+fee', '-program'] });
  assert.deepEqual((await ok(db, 'getAll', {}, T2)).preferences, { columns_professors: ['+email'] }, 'the other person is not affected');
  // saving again replaces, it does not add a second row
  await ok(db, 'savePreference', { key: 'columns_universities', value: ['+fee', '-person:u_abc'] }, T);
  assert.deepEqual((await ok(db, 'getAll', {}, T)).preferences.columns_universities, ['+fee', '-person:u_abc']);
  assert.equal((await db.query('SELECT 1 FROM preferences')).length, 2);
  // an empty list means "back to the default"
  await ok(db, 'savePreference', { key: 'columns_universities', value: [] }, T);
  assert.deepEqual((await ok(db, 'getAll', {}, T)).preferences, {});
  assert.equal((await db.query('SELECT 1 FROM preferences')).length, 1);
  // validation
  assert.match(await bad(db, 'savePreference', { key: 'nope', value: [] }, T), /Unknown preference/);
  assert.match(await bad(db, 'savePreference', { key: 'columns_universities', value: 'fee' }, T), /not valid/);
  assert.match(await bad(db, 'savePreference', { key: 'columns_universities', value: ['fee'] }, T), /not valid/);
  assert.match(await bad(db, 'savePreference', { key: 'columns_universities', value: ['+fee; DROP TABLE users'] }, T), /not valid/);
  assert.match(await bad(db, 'savePreference', { key: 'columns_universities', value: Array.from({ length: 61 }, () => '+fee') }, T), /not valid/);
  assert.match(await bad(db, 'savePreference', { key: 'columns_universities', value: [5] }, T), /not valid/);
  assert.equal(await bad(db, 'savePreference', { key: 'columns_universities', value: [] }, ''), 'AUTH');
});

// ---------- backup and restore ----------

async function filledApp() {
  const ctx = await twoPeople();
  const { db, T, T2 } = ctx;
  const { id } = await ok(db, 'addProfessor', { name: 'Jane Doe', university: 'MIT', field: 'AI', notes: 'line1\nline2 "quoted", comma' }, T);
  await ok(db, 'saveContact', { professor_id: id, status: 'Sent', date_sent: '2026-10-20', response_text: 'Hello' }, T);
  await ok(db, 'saveContact', { professor_id: id, status: 'Seen', date_sent: '2026-10-21' }, T2);
  await ok(db, 'saveTemplate', { title: 'Intro', subject: 'S', body: 'B' }, T);
  const uni = await ok(db, 'addUniversity', { name: 'MIT', country: 'USA', deadline: '2026-12-01', priority: 'High' }, T);
  await ok(db, 'saveUniversityProgress', { university_id: uni.id, status: 'Submitted', checklist: ['cv'] }, T);
  await ok(db, 'saveSetting', { key: 'follow_up_days', value: 14 }, T);
  return { ...ctx, profId: id as string, uniId: uni.id as string };
}

const snapshot = async (db: Db) => {
  const out: Record<string, any[]> = {};
  for (const t of ['professors', 'contacts', 'templates', 'activity', 'settings', 'universities', 'university_progress']) {
    out[t] = (await db.query(`SELECT * FROM ${t} ORDER BY 1, 2`)).map((r) => { const { seq, ...rest } = r as any; return rest; });
  }
  out.users = await db.query('SELECT * FROM users ORDER BY user_id');
  return out;
};

await test('backup: writes every tab, in the Sheet column order, and remembers when', async () => {
  const { db, T } = await filledApp();
  const sheet = fakeSheet();
  const r = await ok(db, 'backupToSheet', {}, T);
  assert.equal(r.counts.Professors, 1);
  assert.equal(r.counts.Users, 2);
  assert.equal(r.counts.Universities, 1);
  const t = sheet.tables!;
  assert.deepEqual(Object.keys(t).sort(), ['Activity', 'Contacts', 'Professors', 'Settings', 'Templates', 'UniversityProgress', 'Universities', 'Users'].sort());
  const users = t.Users;
  assert.equal(users[0].length, 8);
  assert.deepEqual(users.map((u) => u[4]), ['', ''], 'logins are never written to the Sheet');
  assert.deepEqual(users[0].slice(5, 7), ['TRUE', 'FALSE'], 'Angon has joined and is not revoked');
  assert.equal(t.Professors[0][9], 'line1\nline2 "quoted", comma');
  assert.equal(t.Professors[0][13], 'FALSE');
  assert.equal(t.Settings[0][1], '14');
  const status = await ok(db, 'backupStatus', {}, T);
  assert.ok(status.last_backup_at);
  assert.equal(status.last_backup_by, 'Angon');
});

await test('backup and restore are for the admin only; restore needs the word RESTORE', async () => {
  const { db, T, T2 } = await filledApp();
  fakeSheet();
  assert.match(await bad(db, 'backupToSheet', {}, T2), /Only the admin/);
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T2), /Only the admin/);
  assert.match(await bad(db, 'backupStatus', {}, T2), /Only the admin/);
  await ok(db, 'backupToSheet', {}, T);
  assert.match(await bad(db, 'restoreFromSheet', {}, T), /not confirmed/);
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'restore' }, T), /not confirmed/);
  assert.match(await bad(db, 'restoreFromSheet', { confirm: true }, T), /not confirmed/);
});

await test('restore: brings back the backup exactly, and keeps everyone logged in', async () => {
  const { db, T, T2, profId } = await filledApp();
  fakeSheet();
  await ok(db, 'backupToSheet', {}, T);
  const before = await snapshot(db);

  // Now change things after the backup
  await ok(db, 'addProfessor', { name: 'Extra Person' }, T);
  await ok(db, 'deleteProfessor', { id: profId }, T);
  await ok(db, 'saveSetting', { key: 'follow_up_days', value: 3 }, T);
  await ok(db, 'createInvite', { name: 'Newcomer' }, T);

  const r = await ok(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T);
  assert.equal(r.counts.Professors, 1);
  await ok(db, 'me', {}, T);
  await ok(db, 'me', {}, T2);
  const all = await ok(db, 'getAll', {}, T);
  assert.deepEqual(all.professors.map((p: any) => p.name), ['Jane Doe']);
  assert.equal(all.settings.follow_up_days, '14');
  assert.equal(all.users.length, 2, 'the newcomer who was not in the backup is gone');

  const after = await snapshot(db);
  assert.deepEqual(after.professors, before.professors);
  assert.deepEqual(after.contacts, before.contacts);
  assert.deepEqual(after.templates, before.templates);
  assert.deepEqual(after.universities, before.universities);
  assert.deepEqual(after.university_progress, before.university_progress);
  assert.deepEqual(after.settings, before.settings);
  assert.deepEqual(after.activity.map((a: any) => a.id).sort(), before.activity.map((a: any) => a.id).sort());
  assert.deepEqual(after.users, before.users);
  // activity keeps its order
  assert.equal(all.activity[0].details, (await ok(db, 'getAll', {}, T2)).activity[0].details);
  const st = await ok(db, 'backupStatus', {}, T);
  assert.ok(st.last_restore_at);
});

await test('restore: a revoked person loses their login, a removed person is gone', async () => {
  const { db, T, T2, ayonId } = await filledApp();
  const sheet = fakeSheet();
  await ok(db, 'backupToSheet', {}, T);
  // edit the Sheet by hand: mark Ayon revoked
  sheet.tables!.Users.find((u) => u[0] === ayonId)![6] = 'TRUE';
  await ok(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T);
  assert.equal(await bad(db, 'me', {}, T2), 'AUTH');
  await ok(db, 'me', {}, T);
});

await test('restore: refuses a Sheet that would lock the admin out, and changes nothing', async () => {
  const { db, T } = await filledApp();
  const sheet = fakeSheet();
  await ok(db, 'backupToSheet', {}, T);
  const before = await snapshot(db);

  const noAdmin = JSON.parse(JSON.stringify(sheet.tables));
  noAdmin.Users.forEach((u: string[]) => { u[2] = 'member'; });
  sheet.tables = noAdmin;
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T), /no active admin/);

  const missingTab = JSON.parse(JSON.stringify(sheet.tables));
  delete missingTab.Professors;
  sheet.tables = missingTab;
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T), /no "Professors" tab/);

  sheet.tables = {};
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T), /no "Users" tab|Run a backup first/);

  // another admin only: the caller is not in the Sheet
  const otherAdmin = JSON.parse(JSON.stringify((await (async () => { const s = fakeSheet(); await ok(db, 'backupToSheet', {}, T); return s.tables; })())));
  otherAdmin.Users = otherAdmin.Users.map((u: string[]) => (u[0] === 'u_admin' ? ['u_other', 'Other', 'admin', 'OTHERCODE', '', 'FALSE', 'FALSE', ''] : u));
  fakeSheet(otherAdmin);
  assert.match(await bad(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T), /does not contain your admin account/);

  assert.deepEqual(await snapshot(db), before, 'a refused restore changes nothing');
  await ok(db, 'me', {}, T);
});

await test('restore: tidies up a Sheet that was edited by hand', async () => {
  const { db, T, profId } = await filledApp();
  const sheet = fakeSheet();
  await ok(db, 'backupToSheet', {}, T);
  const t = sheet.tables!;
  // a made-up status, a bad date, an empty row, a repeated id
  const angonsRow = t.Contacts.find((r) => r[2] === 'u_admin')!;
  angonsRow[4] = 'Maybe?';
  angonsRow[3] = 'yesterday';
  t.Professors.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  t.Professors.push([...t.Professors[0].slice(0, 1), 'Jane Doe (edited)', ...t.Professors[0].slice(2)]);
  t.Professors[t.Professors.length - 1][0] = profId;
  await ok(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T);
  const all = await ok(db, 'getAll', {}, T);
  assert.equal(all.professors.length, 1);
  assert.equal(all.professors[0].name, 'Jane Doe (edited)', 'the last copy wins');
  const c = all.contacts.find((x: any) => x.user_id === 'u_admin');
  assert.equal(c.status, 'Not sent');
  assert.equal(c.date_sent, '');
});

// ---------- the one-time move from the old Sheet-based app ----------

await test('migration: moves the old Sheet data in, and old logins keep working', async () => {
  const OLD = 'a'.repeat(64);
  const OLD2 = 'b'.repeat(64);
  const db = await freshDb();
  fakeSheet({
    Users: [
      ['u_1', 'Angon', 'admin', 'CODE1', `${OLD},${OLD2}`, 'TRUE', 'FALSE', '2026-01-01T00:00:00.000Z'],
      ['u_2', 'Ayon', 'member', 'CODE2', '', 'FALSE', 'FALSE', '2026-01-02T00:00:00.000Z'],
    ],
    Professors: [['p_1', 'Jane Doe', 'MIT', 'AI', 'jane@mit.edu', '', '', 'yes', '2026-11-05', 'note', 'u_1', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 'FALSE']],
    Contacts: [['c_1', 'p_1', 'u_1', '2026-10-20', 'Sent', '', '2026-10-20T00:00:00.000Z']],
    Templates: [],
    Activity: [['a_1', '2026-10-20T00:00:00.000Z', 'u_1', 'added', 'p_1', 'added Prof. Jane Doe']],
    Settings: [['follow_up_days', '10']],
    Universities: [],
    UniversityProgress: [],
  });
  const r = await importFromSheet(db);
  assert.equal(r.counts.Professors, 1);

  // the old login works with no new login needed
  const all = await ok(db, 'getAll', {}, OLD);
  await ok(db, 'me', {}, OLD2);
  assert.equal(all.professors[0].name, 'Jane Doe');
  assert.equal(all.contacts[0].status, 'Sent');
  assert.equal(all.activity[0].details, 'added Prof. Jane Doe');
  assert.equal(all.users.length, 2);
  // old invite links still work
  const j = await ok(db, 'join', { code: 'CODE2' });
  await ok(db, 'me', {}, j.token);
  assert.match((await db.query('SELECT token_hash FROM sessions')).map((x) => x.token_hash).join(), /^(?!.*a{64})/);

  // it cannot be run twice
  await assert.rejects(() => importFromSheet(db), /already has users/);
});

await test('migration: refuses a Sheet with no admin', async () => {
  const db = await freshDb();
  fakeSheet({ Users: [['u_2', 'Ayon', 'member', 'C', '', 'FALSE', 'FALSE', '']], Professors: [], Contacts: [], Templates: [], Activity: [], Settings: [], Universities: [], UniversityProgress: [] });
  await (await import('../server/schema.js')).ensureSchema(db);
  await assert.rejects(() => importFromSheet(db), /no active admin/);
});

// A backup of an empty-ish app also works
await test('backup of a brand new app, then restore, works', async () => {
  const { db, T } = await withAdmin();
  fakeSheet();
  await backupToSheet(db, { name: 'Angon' } as any);
  await ok(db, 'restoreFromSheet', { confirm: 'RESTORE' }, T);
  assert.equal((await ok(db, 'getAll', {}, T)).professors.length, 0);
});

console.log(`\nALL ${passed} SERVER TESTS PASSED`);
