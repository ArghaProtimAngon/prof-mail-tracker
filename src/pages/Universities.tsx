import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { UNIVERSITY_COLUMNS } from '../lib/columns';
import { useColumns } from '../lib/useColumns';
import { useExport } from '../lib/useExport';
import { UNI_STATUSES, PRIORITIES, TIERS, type UniStatus, type University } from '../lib/types';
import { checklistKeys, deadlineInfo, formatDate, safeUrl, uniKey } from '../lib/utils';
import { Badge, UniStatusChip } from '../components/StatusChip';
import AddManyModal from '../components/AddManyModal';
import ColumnPicker from '../components/ColumnPicker';

type Sort = 'added' | 'deadline' | 'name' | 'priority';
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2, '': 3 };
const FUNDING = { yes: 'Yes', no: 'No', unknown: 'Unknown' };
const dash = <span className="muted">—</span>;

/** What each optional column shows for one university. */
const CELL: Record<string, (u: University) => ReactNode> = {
  program: (u) => u.program || dash,
  deadline: (u) => {
    if (!u.deadline) return dash;
    const dl = deadlineInfo(u.deadline);
    return dl?.soon ? <Badge tone="red">{formatDate(u.deadline)}</Badge> : <span className={dl?.passed ? 'muted' : ''}>{formatDate(u.deadline)}</span>;
  },
  priority: (u) => [u.priority, u.tier].filter(Boolean).join(' · ') || dash,
  fee: (u) => u.fee || dash,
  funding: (u) => FUNDING[u.funding] ?? 'Unknown',
  website: (u) => (safeUrl(u.website) ? <a href={safeUrl(u.website)} target="_blank" rel="noreferrer">Open</a> : dash),
  admission: (u) => (safeUrl(u.admission_url) ? <a href={safeUrl(u.admission_url)} target="_blank" rel="noreferrer">Open</a> : dash),
  notes: (u) => (u.notes ? <span className="line-clamp-2 max-w-xs whitespace-pre-wrap">{u.notes}</span> : dash),
};

/** The same, for the phone cards. A card is already one big link, so no links inside it. */
const cardValue = (id: string, u: University): ReactNode =>
  id === 'website' ? u.website || dash : id === 'admission' ? u.admission_url || dash : CELL[id](u);

export default function Universities() {
  const { data, people, loading, online, uniStatusOf, uniProgressOf } = useData();
  const cols = useColumns('columns_universities', UNIVERSITY_COLUMNS);
  const shownCols = UNIVERSITY_COLUMNS.filter((c) => cols.isOn(c.id));
  const extraCols = UNIVERSITY_COLUMNS.filter((c) => !c.default && cols.isOn(c.id)); // extra info for the phone cards
  const shownPeople = people.filter((p) => cols.personOn(p.user_id));
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState<UniStatus | ''>('');
  const [who, setWho] = useState(''); // which person the status filter looks at ('' = anyone)
  const [priority, setPriority] = useState('');
  const [tier, setTier] = useState('');
  const [sort, setSort] = useState<Sort>('added');
  const [addMany, setAddMany] = useState(false);
  const { busy: exporting, run: runExport } = useExport();

  const countries = useMemo(() => [...new Set(data.universities.map((u) => u.country).filter(Boolean))].sort(), [data.universities]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const who_ = who ? people.filter((p) => p.user_id === who) : people;
    const rows = data.universities.filter((u) => {
      if (q && ![u.name, u.country, u.program].some((v) => v.toLowerCase().includes(q))) return false;
      if (country && u.country !== country) return false;
      if (priority && u.priority !== priority) return false;
      if (tier && u.tier !== tier) return false;
      if (status && !who_.some((p) => uniStatusOf(u.id, p.user_id) === status)) return false;
      return true;
    });
    const by: Record<Sort, (a: University, b: University) => number> = {
      added: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name),
      deadline: (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'),
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.name.localeCompare(b.name),
    };
    return rows.sort(by[sort]);
  }, [data.universities, people, search, country, priority, tier, status, who, sort, uniStatusOf]);

  const filtering = !!(search || country || priority || tier || status || who);
  function clearFilters() {
    setSearch(''); setCountry(''); setPriority(''); setTier(''); setStatus(''); setWho('');
  }

  /** How many professors on the list are at this university. */
  const professorCount = useMemo(() => {
    const counts = new Map<string, number>();
    data.professors.forEach((p) => counts.set(uniKey(p.university), (counts.get(uniKey(p.university)) || 0) + 1));
    return (u: University) => counts.get(uniKey(u.name)) || 0;
  }, [data.professors]);

  if (loading) return <p className="muted">Loading your data…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Universities <span className="text-base font-normal muted">({list.length})</span></h1>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setAddMany(true)}>Add many</button>
          <Link to="/universities/new" className="btn btn-primary">+ Add</Link>
        </div>
      </div>

      <div className="card space-y-3 p-3">
        <input className="input" type="search" placeholder="Search name, country or program" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as UniStatus | '')} aria-label="Application status">
            <option value="">Any status</option>
            {UNI_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="For which person">
            <option value="">For anyone</option>
            {people.map((p) => <option key={p.user_id} value={p.user_id}>For {p.name}</option>)}
          </select>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Dream, target or safe">
            <option value="">Dream / Target / Safe</option>
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button className="btn !py-1" onClick={() => runExport('universities')} disabled={exporting || !data.universities.length}>
              ⬇️ {exporting ? 'Making file…' : 'Export Excel'}
            </button>
            <ColumnPicker fixedLabel="University" defs={UNIVERSITY_COLUMNS} cols={cols} people={people} online={online} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="usort" className="muted">Sort by</label>
            <select id="usort" className="input !w-auto !py-1" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="added">Date added</option>
              <option value="deadline">Deadline</option>
              <option value="priority">Priority</option>
              <option value="name">Name</option>
            </select>
            {filtering && <button className="btn !py-1" onClick={clearFilters}>Clear</button>}
          </div>
        </div>
      </div>

      {list.length === 0 && (
        <div className="card p-6 text-center muted">
          {data.universities.length === 0
            ? 'No universities yet. Tap “+ Add”, or “Add many” to paste a whole list.'
            : 'No universities match these filters.'}
        </div>
      )}

      {/* Phone: cards */}
      <div className="space-y-3 md:hidden">
        {list.map((u) => {
          const dl = deadlineInfo(u.deadline);
          return (
            <Link key={u.id} to={`/universities/${u.id}`} className="card block p-4 !text-inherit">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{u.name}</div>
                {u.tier && <Badge tone="gray">{u.tier}</Badge>}
              </div>
              <div className="text-sm muted">{[u.country, u.program].filter(Boolean).join(' · ') || 'No details yet'}</div>
              {extraCols.length > 0 && (
                <div className="mt-2 space-y-0.5 text-sm">
                  {extraCols.map((c) => <div key={c.id}><span className="muted">{c.label}:</span> <span className="break-words">{cardValue(c.id, u)}</span></div>)}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dl?.soon && <Badge tone="red">Deadline {dl.days === 0 ? 'today' : `in ${dl.days}d`}</Badge>}
                {u.priority === 'High' && <Badge tone="orange">High priority</Badge>}
                {professorCount(u) > 0 && <Badge tone="gray">{professorCount(u)} professor{professorCount(u) === 1 ? '' : 's'}</Badge>}
              </div>
              <div className="mt-3 space-y-1.5">
                {shownPeople.map((p) => {
                  const done = checklistKeys(uniProgressOf(u.id, p.user_id)?.checklist || '').length;
                  return (
                    <div key={p.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-14 shrink-0 font-medium">{p.name}</span>
                      <UniStatusChip status={uniStatusOf(u.id, p.user_id)} />
                      {done > 0 && <span className="muted">{done}/5 documents</span>}
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Computer: table with every person side by side */}
      {list.length > 0 && (
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                <th className="p-3">University</th>
                {shownCols.map((c) => <th key={c.id} className="p-3">{c.label}</th>)}
                {shownPeople.map((p) => <th key={p.user_id} className="p-3">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-medium">
                      <Link to={`/universities/${u.id}`}>{u.name}</Link>
                      <div className="text-xs font-normal muted">
                        {[u.country, professorCount(u) > 0 ? `${professorCount(u)} professor${professorCount(u) === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    {shownCols.map((c) => (
                      <td key={c.id} className={`p-3 ${c.id === 'deadline' || c.id === 'priority' || c.id === 'fee' ? 'whitespace-nowrap' : ''}`}>{CELL[c.id](u)}</td>
                    ))}
                    {shownPeople.map((p) => {
                      const done = checklistKeys(uniProgressOf(u.id, p.user_id)?.checklist || '').length;
                      return (
                        <td key={p.user_id} className="p-3">
                          <UniStatusChip status={uniStatusOf(u.id, p.user_id)} />
                          {done > 0 && <div className="mt-0.5 text-xs muted">{done}/5 documents</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addMany && <AddManyModal onClose={() => setAddMany(false)} />}
    </div>
  );
}
