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

export interface AppData {
  professors: Professor[];
  contacts: Contact[];
  users: AppUser[];
  templates: Template[];
  settings: Record<string, string | number>;
  activity: ActivityItem[];
}
