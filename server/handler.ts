import type { Db, Row } from './db.js';
import { ACTIONS } from './actions.js';
import { ensureSchema } from './schema.js';
import { hashToken, UserError } from './util.js';

export type RpcResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; message?: string };

/** The person who owns this login, or null. */
export async function authenticate(db: Db, token: unknown): Promise<Row | null> {
  const t = String(token ?? '');
  if (t.length < 32) return null;
  const rows = await db.query(
    'SELECT u.* FROM sessions s JOIN users u ON u.user_id = s.user_id WHERE s.token_hash=$1 AND NOT u.revoked',
    [hashToken(t)]
  );
  return rows[0] ?? null;
}

/** Runs one request: {action, token, ...params}. Same answers as the old Apps Script: {ok, data} or {ok:false, error}. */
export async function handleRpc(db: Db, body: unknown): Promise<RpcResult> {
  let req: Record<string, any>;
  try {
    req = typeof body === 'string' ? JSON.parse(body) : (body as Record<string, any>);
    if (!req || typeof req !== 'object') throw new Error('bad');
  } catch {
    return { ok: false, error: 'Bad request.' };
  }

  const action = String(req.action ?? '');
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) return { ok: false, error: 'Unknown action.' };

  try {
    await ensureSchema(db);
    let user: Row | null = null;
    if (action !== 'join') {
      user = await authenticate(db, req.token);
      if (!user) return { ok: false, error: 'AUTH', message: 'Your session is not valid. Please use your invite link again.' };
    }
    return { ok: true, data: await ACTIONS[action]({ db, user }, req) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(`Action "${action}" failed:`, e);
    return { ok: false, error: 'Something went wrong on the server. Please try again.' };
  }
}
