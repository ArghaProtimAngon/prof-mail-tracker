import type { AppData } from './types';
import { downloadFile, todayStr, toCsv } from './utils';

/** One CSV with the professor info and, for every person, their status, date sent and reply. */
export function exportCsv(data: AppData) {
  const people = data.users.filter((u) => !u.revoked);
  const header = ['Name', 'University', 'Field', 'Email', 'Lab website', 'Google Scholar', 'Funding', 'Deadline', 'Notes'];
  people.forEach((u) => header.push(`${u.name} - status`, `${u.name} - date sent`, `${u.name} - reply`));

  const rows = data.professors.map((p) => {
    const row = [p.name, p.university, p.field, p.email, p.lab_url, p.scholar_url, p.has_funding, p.deadline, p.notes];
    people.forEach((u) => {
      const c = data.contacts.find((x) => x.professor_id === p.id && x.user_id === u.user_id);
      row.push(c?.status || 'Not sent', c?.date_sent || '', c?.response_text || '');
    });
    return row;
  });

  downloadFile(`professors-${todayStr()}.csv`, toCsv([header, ...rows]), 'text/csv');
}
