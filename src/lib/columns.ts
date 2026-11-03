// Which columns each person sees in the Universities and Professors lists.
// The choices are saved on the server for each person, so they follow that person to every device.
//
// A saved choice is "+id" (I want this column) or "-id" (I do not). A column with no saved choice
// uses its default. This way a new person who joins later still gets a normal column.

export interface ColumnDef {
  id: string;
  label: string;
  /** Shown until the person chooses otherwise. */
  default: boolean;
}

export const UNIVERSITY_COLUMNS: ColumnDef[] = [
  { id: 'program', label: 'Program', default: true },
  { id: 'deadline', label: 'Deadline', default: true },
  { id: 'priority', label: 'Priority / tier', default: true },
  { id: 'fee', label: 'Application fee', default: false },
  { id: 'funding', label: 'Funding', default: false },
  { id: 'website', label: 'Website', default: false },
  { id: 'admission', label: 'Admission page', default: false },
  { id: 'notes', label: 'Notes', default: false },
];

export const PROFESSOR_COLUMNS: ColumnDef[] = [
  { id: 'university', label: 'University / field', default: true },
  { id: 'deadline', label: 'Deadline', default: true },
  { id: 'email', label: 'Email', default: false },
  { id: 'funding', label: 'Funding', default: false },
  { id: 'added', label: 'Date added', default: false },
  { id: 'added_by', label: 'Added by', default: false },
  { id: 'notes', label: 'Notes', default: false },
];

/** The id of the column that shows one person's status. Everyone's column is shown by default. */
export const personColumnId = (userId: string) => `person:${userId}`;

export function isColumnOn(choices: string[] | undefined, id: string, defaultOn: boolean): boolean {
  if (choices?.includes(`+${id}`)) return true;
  if (choices?.includes(`-${id}`)) return false;
  return defaultOn;
}

/** The new list of choices after switching one column on or off. It keeps only what differs from the default. */
export function setColumn(choices: string[] | undefined, id: string, defaultOn: boolean, on: boolean): string[] {
  const rest = (choices ?? []).filter((c) => c !== `+${id}` && c !== `-${id}`);
  return on === defaultOn ? rest : [...rest, `${on ? '+' : '-'}${id}`];
}
