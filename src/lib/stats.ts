import type { Contact } from './types';

export interface Stats {
  emailed: number;
  replied: number;
  positive: number;
  negative: number;
  noReply: number;
  waiting: number;
  rate: number; // percent of emailed professors that replied
}

/** Counts for the given contacts. "Emailed" = anything except "Not sent". */
export function computeStats(contacts: Contact[]): Stats {
  const count = (s: string) => contacts.filter((c) => c.status === s).length;
  const emailed = contacts.filter((c) => c.status !== 'Not sent').length;
  const positive = count('Replied (positive)');
  const negative = count('Replied (negative)');
  const replied = positive + negative;
  return {
    emailed,
    replied,
    positive,
    negative,
    noReply: count('No reply'),
    waiting: count('Sent') + count('Seen'),
    rate: emailed ? Math.round((replied / emailed) * 100) : 0,
  };
}
