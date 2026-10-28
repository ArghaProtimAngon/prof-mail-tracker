import type { Status } from '../lib/types';

const COLORS: Record<Status, string> = {
  'Not sent': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  Seen: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  'Replied (positive)': 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  'Replied (negative)': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  'No reply': 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
};

export default function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {status}
    </span>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone: 'orange' | 'red' | 'gray' }) {
  const tones = {
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
