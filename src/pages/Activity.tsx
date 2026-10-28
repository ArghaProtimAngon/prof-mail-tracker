import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { formatDateTime } from '../lib/utils';

export default function Activity() {
  const { data, loading, userName, professorById } = useData();
  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Activity</h1>
      {data.activity.length === 0 ? (
        <div className="card p-6 text-center muted">Nothing has happened yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {data.activity.map((a) => {
            const prof = a.professor_id ? professorById(a.professor_id) : undefined;
            return (
              <li key={a.id} className="p-4">
                <div>
                  <b>{userName(a.user_id)}</b> {a.details}
                </div>
                <div className="flex gap-3 text-xs muted">
                  <span>{formatDateTime(a.timestamp)}</span>
                  {prof && <Link to={`/professors/${prof.id}`}>Open professor</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-center text-xs muted">Showing the latest 200 actions.</p>
    </div>
  );
}
