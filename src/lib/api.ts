// Talks to our own server: POST /api/rpc  with  {action, token, ...params}.
// It lives at the same address as the website, so there is nothing to configure.

const API_URL = '/api/rpc';
const TOKEN_KEY = 'pmt_token';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.code = code;
  }
}

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export async function api<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!navigator.onLine) throw new ApiError('You are offline. Please connect to the internet and try again.', 'OFFLINE');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: getToken(), ...params }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet and try again.', 'NETWORK');
  }

  let body: { ok: boolean; data?: T; error?: string; message?: string };
  try {
    body = await res.json();
  } catch {
    // For example when the server part is missing, or the page is opened with "npm run dev" instead of "vercel dev".
    throw new ApiError('The server sent an unexpected answer. Please try again in a moment.');
  }

  if (!body.ok) {
    if (body.error === 'AUTH') throw new ApiError(body.message || 'Please use your invite link again.', 'AUTH');
    throw new ApiError(body.error || 'Something went wrong.');
  }
  return body.data as T;
}
