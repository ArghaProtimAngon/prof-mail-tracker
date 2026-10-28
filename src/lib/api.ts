// Talks to the Google Apps Script Web App.
// We send "text/plain" so the browser does not do a CORS "preflight" check
// (Apps Script cannot answer that check).

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
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
  if (!API_URL) throw new ApiError('The app is not set up yet: VITE_API_URL is missing in your .env file.');
  if (!navigator.onLine) throw new ApiError('You are offline. Please connect to the internet and try again.', 'OFFLINE');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), ...params }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet and try again.', 'NETWORK');
  }

  let body: { ok: boolean; data?: T; error?: string; message?: string };
  try {
    body = await res.json();
  } catch {
    throw new ApiError('The server sent an unexpected answer. Check that the Web App URL is correct.');
  }

  if (!body.ok) {
    if (body.error === 'AUTH') throw new ApiError(body.message || 'Please use your invite link again.', 'AUTH');
    throw new ApiError(body.error || 'Something went wrong.');
  }
  return body.data as T;
}
