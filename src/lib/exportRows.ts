// Builds the rows for the Excel exports. No browser code in here, so it is easy to test.
import type { AppData } from './types.ts';
import { CHECKLIST_ITEMS } from './types.ts';
import { checklistKeys, uniKey } from './utils.ts';

export type Row = string[];
export interface SheetRows { name: string; rows: Row[] } // rows[0] is the header

const people = (data: AppData) => data.users.filter((u) => !u.revoked);

export function professorSheet(data: AppData): SheetRows {
  const header = ['Name', 'University', 'Field', 'Email', 'Lab website', 'Google Scholar', 'Funding', 'Deadline', 'Notes'];
  people(data).forEach((u) => header.push(`${u.name} - status`, `${u.name} - date sent`, `${u.name} - reply`));

  const rows = data.professors.map((p) => {
    const row = [p.name, p.university, p.field, p.email, p.lab_url, p.scholar_url, p.has_funding, p.deadline, p.notes];
    people(data).forEach((u) => {
      const c = data.contacts.find((x) => x.professor_id === p.id && x.user_id === u.user_id);
      row.push(c?.status || 'Not sent', c?.date_sent || '', c?.response_text || '');
    });
    return row;
  });
  return { name: 'Professors', rows: [header, ...rows] };
}

export function universitySheet(data: AppData): SheetRows {
  const header = ['University', 'Country', 'Program', 'Website', 'Admission page', 'Deadline', 'Fee', 'Funding', 'Priority', 'Tier', 'Notes'];
  people(data).forEach((u) => header.push(`${u.name} - status`, `${u.name} - documents done`));

  const rows = data.universities.map((x) => {
    const row = [x.name, x.country, x.program, x.website, x.admission_url, x.deadline, x.fee, x.funding, x.priority, x.tier, x.notes];
    people(data).forEach((u) => {
      const p = data.universityProgress.find((r) => r.university_id === x.id && r.user_id === u.user_id);
      const done = checklistKeys(p?.checklist || '');
      row.push(p?.status || 'Not started', CHECKLIST_ITEMS.filter((i) => done.includes(i.key)).map((i) => i.label).join('; '));
    });
    return row;
  });
  return { name: 'Universities', rows: [header, ...rows] };
}

/**
 * Universities and professors joined: one row per professor, with the details and
 * everyone's application status of their university. Universities without any professor
 * get one row of their own, and professors whose university is not in the list get a row too.
 */
export function combinedSheet(data: AppData): SheetRows {
  const header = ['University', 'Country', 'Program', 'University deadline'];
  people(data).forEach((u) => header.push(`${u.name} - application`));
  header.push('Professor', 'Field', 'Email', 'Funding', 'Professor deadline');
  people(data).forEach((u) => header.push(`${u.name} - email status`));

  const blankUni = Array<string>(4 + people(data).length).fill(''); // the university columns, left empty
  const uniPart = (x: AppData['universities'][number]) => [
    x.name, x.country, x.program, x.deadline,
    ...people(data).map((u) => data.universityProgress.find((r) => r.university_id === x.id && r.user_id === u.user_id)?.status || 'Not started'),
  ];
  const profPart = (p: AppData['professors'][number]) => [
    p.name, p.field, p.email, p.has_funding, p.deadline,
    ...people(data).map((u) => data.contacts.find((c) => c.professor_id === p.id && c.user_id === u.user_id)?.status || 'Not sent'),
  ];
  const blankProf = ['', '', '', '', '', ...people(data).map(() => '')];

  const used = new Set<string>();
  const rows: Row[] = [];
  [...data.universities].sort((a, b) => a.name.localeCompare(b.name)).forEach((x) => {
    const profs = data.professors.filter((p) => uniKey(p.university) === uniKey(x.name));
    profs.forEach((p) => { used.add(p.id); rows.push([...uniPart(x), ...profPart(p)]); });
    if (!profs.length) rows.push([...uniPart(x), ...blankProf]);
  });
  // Professors at a university that is not in the Universities list: keep the name they typed.
  data.professors.filter((p) => !used.has(p.id)).sort((a, b) => a.university.localeCompare(b.university) || a.name.localeCompare(b.name))
    .forEach((p) => rows.push([p.university, ...blankUni.slice(1), ...profPart(p)]));

  return { name: 'Combined', rows: [header, ...rows] };
}
