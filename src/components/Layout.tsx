import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useTheme, type ThemeChoice } from '../lib/theme';
import { exportCsv } from '../lib/export';

interface NavItem { to: string; label: string; icon: string; end?: boolean }

const MAIN: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/professors', label: 'Professors', icon: '🎓', end: false },
  { to: '/activity', label: 'Activity', icon: '🕘', end: false },
];
const MORE_LINKS: NavItem[] = [
  { to: '/templates', label: 'Templates', icon: '✉️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemeChoice, string> = { system: '🖥️ Theme: system', light: '☀️ Theme: light', dark: '🌙 Theme: dark' };

export function ThemeButton({ className = 'btn' }: { className?: string }) {
  const { choice, set } = useTheme();
  return <button className={className} onClick={() => set(NEXT_THEME[choice])}>{THEME_LABEL[choice]}</button>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { data, online, stale, refreshing, refresh } = useData();

  const side = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
  const sideActive = '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-950 dark:!text-indigo-300';

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="mb-6 px-3 text-lg font-semibold">✉️ ProfMail</div>
        <nav className="flex flex-1 flex-col gap-1">
          {[...MAIN, ...MORE_LINKS, ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', icon: '🔑' }] : [])].map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `${side} ${isActive ? sideActive : ''}`}>
              <span aria-hidden>{l.icon}</span> {l.label}
            </NavLink>
          ))}
          <button className={`${side} text-left`} onClick={() => exportCsv(data)}><span aria-hidden>⬇️</span> Export CSV</button>
        </nav>
        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="px-1 text-sm muted">Signed in as <b>{user?.name}</b></div>
          <ThemeButton className="btn w-full" />
          <button className="btn w-full" onClick={logout}>Log out</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        {!online && (
          <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
            You are offline. You can read your saved data, but saving is turned off.
          </div>
        )}
        {online && stale && (
          <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            Showing saved data. The server could not be reached.
            <button className="underline" onClick={refresh} disabled={refreshing}>{refreshing ? 'Trying…' : 'Try again'}</button>
          </div>
        )}
        <main className="mx-auto max-w-5xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 md:hidden">
        {[...MAIN, { to: '/more', label: 'More', icon: '⋯', end: false }].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold !text-indigo-600 dark:!text-indigo-400' : '!text-slate-500 dark:!text-slate-400'}`
            }
          >
            <span className="text-xl leading-none" aria-hidden>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
