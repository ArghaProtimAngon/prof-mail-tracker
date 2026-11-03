export const STATUSES = [
  'Not sent',
  'Sent',
  'Seen',
  'Replied (positive)',
  'Replied (negative)',
  'No reply',
] as const;
export type Status = (typeof STATUSES)[number];

export interface Professor {
  id: string;
  name: string;
  university: string;
  field: string;
  email: string;
  lab_url: string;
  scholar_url: string;
  has_funding: 'yes' | 'no' | 'unknown';
  deadline: string; // yyyy-mm-dd or ''
  notes: string;
  added_by: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  professor_id: string;
  user_id: string;
  date_sent: string; // yyyy-mm-dd or ''
  status: Status;
  response_text: string;
  updated_at: string;
}

export interface AppUser {
  user_id: string;
  name: string;
  role: 'admin' | 'member';
  revoked: boolean;
}

export interface Template {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  body: string;
  updated_at: string;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  professor_id: string;
  details: string;
}

export const UNI_STATUSES = ['Not started', 'Preparing', 'Submitted', 'Interview', 'Accepted', 'Rejected'] as const;
export type UniStatus = (typeof UNI_STATUSES)[number];

export const CHECKLIST_ITEMS = [
  { key: 'cv', label: 'CV' },
  { key: 'sop', label: 'Statement of purpose' },
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'recommendations', label: 'Recommendation letters' },
  { key: 'english_test', label: 'English test' },
] as const;

export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const TIERS = ['Dream', 'Target', 'Safe'] as const;

export interface University {
  id: string;
  name: string;
  country: string;
  program: string;
  website: string;
  admission_url: string;
  deadline: string; // yyyy-mm-dd or ''
  fee: string;
  funding: 'yes' | 'no' | 'unknown';
  priority: '' | (typeof PRIORITIES)[number];
  tier: '' | (typeof TIERS)[number];
  notes: string;
  added_by: string;
  created_at: string;
  updated_at: string;
}

/** One person's application to one university. A missing row means "Not started". */
export interface UniversityProgress {
  id: string;
  university_id: string;
  user_id: string;
  status: UniStatus;
  checklist: string; // comma-separated CHECKLIST_ITEMS keys that are done
  updated_at: string;
}

export interface AppData {
  universities: University[];
  universityProgress: UniversityProgress[];
  professors: Professor[];
  contacts: Contact[];
  users: AppUser[];
  templates: Template[];
  settings: Record<string, string | number>;
  activity: ActivityItem[];
  /** My own display choices, for example which columns I see. */
  preferences: Record<string, string[]>;
}
