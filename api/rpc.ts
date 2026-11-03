// The one address the app talks to: POST /api/rpc  with  {action, token, ...params}
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../server/db.js';
import { handleRpc } from '../server/handler.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Please use POST.' });
    return;
  }
  try {
    res.status(200).json(await handleRpc(getDb(), req.body));
  } catch (e) {
    // Only reachable when the database is not connected yet.
    res.status(200).json({ ok: false, error: e instanceof Error ? e.message : 'The server is not set up yet.' });
  }
}
