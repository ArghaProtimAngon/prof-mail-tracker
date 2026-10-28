import type { Contact, Professor, Status } from './types';

// ---------- Dates ----------
// Dates are kept as plain text "yyyy-mm-dd" (no time zone problems).

const pad = (n: number) => String(n).padStart(2, '0');

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Whole days from today to the date. Negative = in the past. */
export function daysFromToday(s: string): number | null {
  const d = parseDate(s);
  if (!d) return null;
  const t = parseDate(todayStr())!;
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export function formatDate(s: string): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

export function formatShortDate(s: string): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------- Follow-up and deadlines ----------

export function isWaiting(status: Status): boolean {
  return status === 'Sent' || status === 'Seen';
}

/** Days since the email was sent, if it is "Sent"/"Seen" for longer than followUpDays. Otherwise null. */
export function followUpAge(c: Pick<Contact, 'status' | 'date_sent'> | undefined, followUpDays: number): number | null {
  if (!c || !isWaiting(c.status)) return null;
  const d = daysFromToday(c.date_sent);
  if (d === null) return null;
  const age = -d;
  return age > followUpDays ? age : null;
}

export type DeadlineInfo = { days: number; soon: boolean; passed: boolean } | null;

export function deadlineInfo(deadline: string): DeadlineInfo {
  const days = daysFromToday(deadline);
  if (days === null) return null;
  return { days, soon: days >= 0 && days <= 14, passed: days < 0 };
}

// ---------- Professors ----------

export const normalizeEmail = (e: string) => (e || '').trim().toLowerCase();

function normalizeName(n: string): string {
  return (n || '')
    .toLowerCase()
    .replace(/\b(prof|professor|dr)\b\.?/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Same person, almost the same spelling, same university. */
export function similarProfessor(list: Professor[], name: string, university: string, ignoreId?: string): Professor | undefined {
  const n = normalizeName(name);
  const u = (university || '').trim().toLowerCase();
  if (!n || !u) return undefined;
  return list.find(
    (p) => p.id !== ignoreId && p.university.trim().toLowerCase() === u && similarity(normalizeName(p.name), n) >= 0.85
  );
}

export function lastName(name: string): string {
  const parts = name
    .replace(/\b(prof|professor|dr)\b\.?/gi, '')
    .replace(/,.*$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[parts.length - 1] || name;
}

export function safeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : '';
}

// ---------- Email templates ----------

export function fillTemplate(text: string, p: Professor, myName: string): string {
  const values: Record<string, string> = {
    professor_name: p.name,
    professor_last_name: lastName(p.name),
    university: p.university,
    field: p.field,
    my_name: myName,
  };
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key] : whole));
}

export function gmailUrl(to: string, subject: string, body: string): string {
  return (
    'https://mail.google.com/mail/?view=cm&fs=1' +
    `&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- CSV ----------

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    let s = String(v ?? '');
    // Stop spreadsheet programs from running text that starts like a formula.
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime: string) {
  // The BOM at the start makes Excel read accents correctly.
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
