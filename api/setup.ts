// One-time move from the old Google Sheet app into the new database.
// Open  /api/setup?key=YOUR_SETUP_KEY  once in the browser. It only works while the database has no users.
import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { importFromSheet } from '../server/backup.js';
import { getDb } from '../server/db.js';
import { ensureSchema } from '../server/schema.js';
import { UserError } from '../server/util.js';

function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = process.env.SETUP_KEY;
  const given = String(req.query.key ?? '');
  if (!expected) {
    res.status(404).json({ ok: false, error: 'Setup is switched off (there is no SETUP_KEY).' });
    return;
  }
  if (!sameKey(given, expected)) {
    res.status(403).json({ ok: false, error: 'Wrong key.' });
    return;
  }
  try {
    const db = getDb();
    await ensureSchema(db);
    res.status(200).json({ ok: true, ...(await importFromSheet(db)), next: 'Done. Now delete SETUP_KEY in Vercel.' });
  } catch (e) {
    if (!(e instanceof UserError)) console.error('Setup failed:', e);
    res.status(200).json({ ok: false, error: e instanceof UserError || (e instanceof Error && e.message.startsWith('The database is not set up')) ? e.message : 'Setup failed. See the Vercel logs.' });
  }
}
