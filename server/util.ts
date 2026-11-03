import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** A problem we want to show to the person ("Please enter a name."). Other errors stay hidden. */
export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

export const now = () => new Date().toISOString();

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/** 64 random hex characters. */
export const randomToken = () => randomBytes(32).toString('hex');

/** Logins are stored as a hash, so a copy of the database does not contain usable logins. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function validDate(value: unknown): string {
  const v = String(value ?? '').trim().slice(0, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('Dates must look like 2026-10-31.');
  return v;
}

export const text = (value: unknown) => String(value ?? '').trim();

/** Lower-case name without extra spaces, to spot the same university written twice. */
export const uniKey = (name: unknown) => String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export const profLabel = (name: string) => (/^(prof|professor|dr)\.?\s/i.test(name) ? name : `Prof. ${name}`);

export const truthy = (v: unknown) => v === true || String(v).toLowerCase() === 'true';
