import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { useExport } from '../lib/useExport';
import { computeStats } from '../lib/stats';
import { STATUSES, UNI_STATUSES, type Status } from '../lib/types';
import { deadlineInfo, followUpAge, formatDateTime } from '../lib/utils';
import { Badge } from '../components/StatusChip';

const BAR_COLORS: Record<Status, string> = {
  'Not sent': 'bg-slate-300 dark:bg-slate-600',
  Sent: 'bg-blue-500',
  Seen: 'bg-violet-500',
  'Replied (positive)': 'bg-green-500',
  'Replied (negative)': 'bg-red-500',
  'No reply': 'bg-amber-500',
};

export default function Dashboard() {
  const { data, people, followUpDays, loading, userName, contactOf, statusOf, uniStatusOf } = useData();
  const { busy: exporting, run: runExport } = useExport();

  if (loading) return <p className="muted">Loading your data…</p>;

  const activeIds = new Set(people.map((p) => p.user_id));
  const contacts = data.contacts.filter((c) => activeIds.has(c.user_id));
  const columns = [
    ...people.map((u) => ({ key: u.user_id, label: u.name, stats: computeStats(contacts.filter((c) => c.user_id === u.user_id)) })),
    { key: 'all', label: 'Combined', stats: computeStats(contacts) },
  ];
  const rows: { label: string; get: (s: ReturnType<typeof computeStats>) => string | number }[] = [
    { label: 'Emailed', get: (s) => s.emailed },
    { label: 'Replied', get: (s) => s.replied },
    { label: 'Positive', get: (s) => s.positive },
    { label: 'Negative', get: (s) => s.negative },
    { label: 'No reply', get: (s) => s.noReply },
    { label: 'Waiting', get: (s) => s.waiting },
    { label: 'Reply rate', get: (s) => `${s.rate}%` },
  ];

  // Everyone's emails that have waited too long.
  const followUps = data.professors.flatMap((p) =>
    people.flatMap((u) => {
      const age = followUpAge(contactOf(p.id, u.user_id), followUpDays);
      return age === null ? [] : [{ p, u, age }];
    })
  ).sort((a, b) => b.age - a.age);

  const deadlines = data.professors
    .map((p) => ({ p, info: deadlineInfo(p.deadline) }))
    .filter((x) => x.info?.soon)
    .sort((a, b) => a.info!.days - b.info!.days);

  const uniDeadlines = data.universities
    .map((u) => ({ u, info: deadlineInfo(u.deadline) }))
    .filter((x) => x.info?.soon)
    .sort((a, b) => a.info!.days - b.info!.days);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={() => runExport('all')}
            disabled={exporting || (!data.professors.length && !data.universities.length)}
            title="One Excel file with professors and universities together"
          >
            ⬇️ {exporting ? 'Making file…' : 'Export all (Excel)'}
          </button>
          <Link to="/professors/new" className="btn">+ Professor</Link>
          <Link to="/universities/new" className="btn btn-primary">+ University</Link>
        </div>
      </div>

      {data.professors.length === 0 && (
        <div className="card p-6 text-center">
          <p className="mb-3">No professors yet. Add the first one to get started.</p>
          <Link to="/professors/new" className="btn btn-primary">+ Add professor</Link>
        </div>
      )}

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left dark:border-slate-800">
              <th className="p-3"></th>
              {columns.map((c) => <th key={c.key} className="p-3 text-right font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <td className="p-3 muted">{r.label}</td>
                {columns.map((c) => <td key={c.key} className="p-3 text-right tabular-nums">{r.get(c.stats)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.professors.length > 0 && (
        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">Status of every professor</h2>
          {people.map((u) => {
            const counts = STATUSES.map((s) => ({ s, n: data.professors.filter((p) => statusOf(p.id, u.user_id) === s).length }));
            const total = data.professors.length;
            return (
              <div key={u.user_id}>
                <div className="mb-1 text-sm font-medium">{u.name}</div>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img"
                  aria-label={counts.map((c) => `${c.s}: ${c.n}`).join(', ')}>
                  {counts.filter((c) => c.n).map((c) => (
                    <div key={c.s} className={BAR_COLORS[c.s]} style={{ width: `${(c.n / total) * 100}%` }} title={`${c.s}: ${c.n}`} />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs muted">
            {STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5"><span className={`inline-block size-2.5 rounded-full ${BAR_COLORS[s]}`} />{s}</span>
            ))}
          </div>
        </section>
      )}

      <section className="card overflow-x-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Universities <span className="text-sm font-normal muted">({data.universities.length} in the list)</span></h2>
          <Link to="/universities" className="text-sm">See all →</Link>
        </div>
        {data.universities.length === 0 ? (
          <div className="py-2 text-center">
            <p className="mb-3 text-sm muted">Keep a list of universities you want to apply to, even without a professor.</p>
            <Link to="/universities/new" className="btn btn-primary">+ Add university</Link>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                  <th className="py-2 pr-3 font-medium muted">Application</th>
                  {people.map((u) => <th key={u.user_id} className="p-2 text-right font-semibold">{u.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {UNI_STATUSES.map((s) => (
                  <tr key={s} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2 pr-3 muted">{s}</td>
                    {people.map((u) => (
                      <td key={u.user_id} className="p-2 text-right tabular-nums">
                        {data.universities.filter((x) => uniStatusOf(x.id, u.user_id) === s).length}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {uniDeadlines.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 text-sm font-semibold">University deadlines in the next 14 days</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {uniDeadlines.map(({ u, info }) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                      <Link to={`/universities/${u.id}`} className="min-w-0 truncate">{u.name}</Link>
                      <Badge tone="red">{info!.days === 0 ? 'Today' : info!.days === 1 ? 'Tomorrow' : `In ${info!.days} days`}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Needs follow-up <span className="text-sm font-normal muted">(sent more than {followUpDays} days ago)</span></h2>
        {followUps.length === 0 ? (
          <p className="text-sm muted">Nothing to follow up right now. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {followUps.map(({ p, u, age }) => (
              <li key={p.id + u.user_id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/professors/${p.id}`} className="min-w-0 truncate">{p.name}</Link>
                <span className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="muted">{u.name}</span>
                  <Badge tone="orange">{age} days</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
        {followUps.length > 0 && <Link to="/professors?followup=1" className="mt-2 inline-block text-sm">See in the list →</Link>}
      </section>

      {deadlines.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Deadlines in the next 14 days</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {deadlines.map(({ p, info }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/professors/${p.id}`} className="min-w-0 truncate">{p.name}</Link>
                <Badge tone="red">{info!.days === 0 ? 'Today' : info!.days === 1 ? 'Tomorrow' : `In ${info!.days} days`}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Latest activity</h2>
          <Link to="/activity" className="text-sm">See all →</Link>
        </div>
        {data.activity.length === 0 ? (
          <p className="text-sm muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.activity.slice(0, 5).map((a) => (
              <li key={a.id}>
                <b>{userName(a.user_id)}</b> {a.details}
                <div className="text-xs muted">{formatDateTime(a.timestamp)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
