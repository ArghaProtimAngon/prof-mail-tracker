// The whole backup circle: the server (on an in-memory database) talks over HTTP to the REAL
// apps-script/Code.gs, which runs here against a fake Google Sheet. Google answers a POST with a
// redirect, so this test does the same. Run with:  npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import type { Db, Statement } from '../server/db.js';
import { handleRpc } from '../server/handler.js';
import { importFromSheet } from '../server/backup.js';
import { ensureSchema } from '../server/schema.js';

// ---------- the real Code.gs, on a fake Google Sheet ----------
const tabs: Record<string, any> = {};
function makeSheet() {
  const data: any[][] = [];
  return {
    data,
    getLastRow() { let n = data.length; while (n > 0 && (data[n - 1] || []).every((x) => x === '' || x === undefined)) n--; return n; },
    setFrozenRows() {},
    deleteRow(n: number) { data.splice(n - 1, 1); },
    getRange(r: number, c: number, nr = 1, nc = 1) {
      const rng: any = {
        setValues(v: any[][]) { v.forEach((row, i) => row.forEach((x, j) => { (data[r - 1 + i] ||= [])[c - 1 + j] = x; })); return rng; },
        getValues() { const out: any[][] = []; for (let i = 0; i < nr; i++) { const row: any[] = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (data[r - 1 + i]) data[r - 1 + i][c - 1 + j] = ''; return rng; },
        setNumberFormat() { return rng; }, setNumberFormats() { return rng; }, setFontWeight() { return rng; },
      };
      return rng;
    },
  };
}
const props: Record<string, string> = {};
const gs: any = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n: string) => tabs[n] || null, insertSheet: (n: string) => (tabs[n] = makeSheet()), getSpreadsheetTimeZone: () => 'UTC' }) },
  Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d: Date) => d.toISOString().slice(0, 10) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v; } }) },
  Logger: { log: () => {} },
  console,
};
vm.createContext(gs);
vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), gs);
gs.setup();
gs.createBackupKey();

// ---------- a tiny "Google": POST -> 302 -> GET the answer ----------
const answers = new Map<string, string>();
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = gs.doPost({ postData: { contents: body } }).t as string;
      const id = crypto.randomUUID();
      answers.set(id, out);
      res.writeHead(302, { Location: `/answer/${id}` });
      res.end();
    });
  } else {
    const out = answers.get((req.url || '').split('/').pop() || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out ?? '{"ok":false,"error":"gone"}');
  }
});
await new Promise<void>((r) => server.listen(0, r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`;

// ---------- the server side, on an in-memory database ----------
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
const db = pgliteDb(new PGlite());
const call = async (action: string, params: Record<string, unknown> = {}, token = '') => (await handleRpc(db, { action, token, ...params })) as any;

// The old app had some data in the Sheet already (written through the real old API).
const oldAdmin = gs.setup && JSON.parse(gs.doPost({ postData: { contents: JSON.stringify({ action: 'join', code: tabs.Users.data[1][3] }) } }).t);
assert.equal(oldAdmin.ok, true);
const OLD_TOKEN = oldAdmin.data.token as string;
const old = (action: string, params: Record<string, unknown> = {}) =>
  JSON.parse(gs.doPost({ postData: { contents: JSON.stringify({ action, token: OLD_TOKEN, ...params }) } }).t);
assert.equal(old('addProfessor', { name: 'Old Professor', university: 'Oxford' }).ok, true);
assert.equal(old('addUniversity', { name: 'Oxford' }).ok, true);

process.env.SHEET_API_URL = url;
process.env.BACKUP_KEY = props.BACKUP_KEY;

// 1. Move the old data in (the one-time migration), through the real script
await ensureSchema(db);
const imported = await importFromSheet(db);
assert.equal(imported.counts.Professors, 1);
const all = await call('getAll', {}, OLD_TOKEN);
assert.equal(all.ok, true, 'the old login still works');
assert.equal(all.data.professors[0].name, 'Old Professor');

// 2. Work in the new app, then back up to the Sheet
const add = await call('addProfessor', { name: 'New Professor', notes: 'a "quoted", note\nwith a new line' }, OLD_TOKEN);
assert.equal(add.ok, true);
const status0 = await call('backupStatus', {}, OLD_TOKEN);
assert.equal(status0.data.configured, true);
assert.equal(status0.data.last_backup_at, '');
const backup = await call('backupToSheet', {}, OLD_TOKEN);
assert.equal(backup.ok, true, JSON.stringify(backup));
assert.equal(backup.data.counts.Professors, 2);
assert.equal(tabs.Professors.data.length, 3, 'header + 2 rows are in the Sheet');
assert.equal((await call('backupStatus', {}, OLD_TOKEN)).data.last_backup_at.length > 0, true);

// 3. Break things, then restore from the Sheet
await call('addProfessor', { name: 'Mistake' }, OLD_TOKEN);
const profs = (await call('getAll', {}, OLD_TOKEN)).data.professors.map((p: any) => p.name).sort();
assert.deepEqual(profs, ['Mistake', 'New Professor', 'Old Professor']);
const restored = await call('restoreFromSheet', { confirm: 'RESTORE' }, OLD_TOKEN);
assert.equal(restored.ok, true, JSON.stringify(restored));
const after = (await call('getAll', {}, OLD_TOKEN)).data;
assert.deepEqual(after.professors.map((p: any) => p.name).sort(), ['New Professor', 'Old Professor']);
assert.equal(after.professors.find((p: any) => p.name === 'New Professor').notes, 'a "quoted", note\nwith a new line');
assert.equal((await call('me', {}, OLD_TOKEN)).ok, true, 'still logged in after the restore');

// 4. A wrong key is refused by the script, with a clear message
process.env.BACKUP_KEY = 'not-the-key';
const refused = await call('backupToSheet', {}, OLD_TOKEN);
assert.equal(refused.ok, false);
assert.match(refused.error, /Wrong backup key/);
process.env.BACKUP_KEY = props.BACKUP_KEY;

// 5. Not set up at all: a friendly message
delete process.env.SHEET_API_URL;
assert.match((await call('backupToSheet', {}, OLD_TOKEN)).error, /Backup is not set up yet/);
assert.equal((await call('backupStatus', {}, OLD_TOKEN)).data.configured, false);

server.close();
console.log('ALL END-TO-END BACKUP CHECKS PASSED');
