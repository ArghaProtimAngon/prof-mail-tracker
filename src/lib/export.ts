import type { AppData } from './types';
import { CHECKLIST_ITEMS } from './types';
import { checklistKeys, downloadFile, todayStr, toCsv } from './utils';

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

/** One CSV with the university info and, for every person, their application status and documents done. */
export function exportUniversitiesCsv(data: AppData) {
  const people = data.users.filter((u) => !u.revoked);
  const header = ['University', 'Country', 'Program', 'Website', 'Admission page', 'Deadline', 'Fee', 'Funding', 'Priority', 'Tier', 'Notes'];
  people.forEach((u) => header.push(`${u.name} - status`, `${u.name} - documents done`));

  const rows = data.universities.map((x) => {
    const row = [x.name, x.country, x.program, x.website, x.admission_url, x.deadline, x.fee, x.funding, x.priority, x.tier, x.notes];
    people.forEach((u) => {
      const p = data.universityProgress.find((r) => r.university_id === x.id && r.user_id === u.user_id);
      const done = checklistKeys(p?.checklist || '');
      row.push(p?.status || 'Not started', CHECKLIST_ITEMS.filter((i) => done.includes(i.key)).map((i) => i.label).join('; '));
    });
    return row;
  });

  downloadFile(`universities-${todayStr()}.csv`, toCsv([header, ...rows]), 'text/csv');
}
