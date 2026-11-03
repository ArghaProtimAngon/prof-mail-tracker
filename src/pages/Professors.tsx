import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { PROFESSOR_COLUMNS } from '../lib/columns';
import { useColumns } from '../lib/useColumns';
import { useExport } from '../lib/useExport';
import { deadlineInfo, followUpAge, formatDate, formatShortDate, safeUrl } from '../lib/utils';
import { STATUSES, type Professor, type Status } from '../lib/types';
import StatusChip, { Badge } from '../components/StatusChip';
import SentDate from '../components/SentDate';
import ColumnPicker from '../components/ColumnPicker';

type Sort = 'added' | 'deadline' | 'name';
const FUNDING = { yes: 'Yes', no: 'No', unknown: 'Unknown' };
const dash = <span className="muted">—</span>;

export default function Professors() {
  const { data, people, followUpDays, loading, online, contactOf, statusOf, userName } = useData();
  const cols = useColumns('columns_professors', PROFESSOR_COLUMNS);
  const shownCols = PROFESSOR_COLUMNS.filter((c) => cols.isOn(c.id));
  const extraCols = PROFESSOR_COLUMNS.filter((c) => !c.default && cols.isOn(c.id)); // extra info for the phone cards
  const shownPeople = people.filter((u) => cols.personOn(u.user_id));

  /** What each optional column shows for one professor. A card is one big link, so there it is plain text. */
  const cell = (id: string, p: Professor, inCard = false): ReactNode => {
    switch (id) {
      case 'university': return <>{p.university || dash}<div className="text-xs muted">{p.field}</div></>;
      case 'deadline': {
        if (!p.deadline) return dash;
        const dl = deadlineInfo(p.deadline);
        return dl?.soon ? <Badge tone="red">{formatDate(p.deadline)}</Badge> : <span className={dl?.passed ? 'muted' : ''}>{formatDate(p.deadline)}</span>;
      }
      case 'email': return !p.email ? dash : inCard ? p.email : <a href={`mailto:${p.email}`}>{p.email}</a>;
      case 'funding': return FUNDING[p.has_funding] ?? 'Unknown';
      case 'added': return formatDate(p.created_at) || dash;
      case 'added_by': return userName(p.added_by);
      case 'notes': return p.notes ? <span className="line-clamp-2 max-w-xs whitespace-pre-wrap">{p.notes}</span> : dash;
      default: return null;
    }
  };
  const [params, setParams] = useSearchParams();
  const { busy: exporting, run: runExport } = useExport();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [university, setUniversity] = useState('');
  const [field, setField] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [who, setWho] = useState(''); // which person the status / follow-up filter looks at ('' = anyone)
  const [sort, setSort] = useState<Sort>('added');
  const followupOnly = params.get('followup') === '1';

  const universities = useMemo(() => [...new Set(data.professors.map((p) => p.university).filter(Boolean))].sort(), [data.professors]);
  const fields = useMemo(() => [...new Set(data.professors.map((p) => p.field).filter(Boolean))].sort(), [data.professors]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const who_ = who ? people.filter((u) => u.user_id === who) : people;
    const rows = data.professors.filter((p) => {
      if (q && ![p.name, p.university, p.field, p.email].some((v) => v.toLowerCase().includes(q))) return false;
      if (university && p.university !== university) return false;
      if (field && p.field !== field) return false;
      if (status && !who_.some((u) => statusOf(p.id, u.user_id) === status)) return false;
      if (followupOnly && !who_.some((u) => followUpAge(contactOf(p.id, u.user_id), followUpDays) !== null)) return false;
      return true;
    });
    const by: Record<Sort, (a: Professor, b: Professor) => number> = {
      added: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name),
      // Professors without a deadline go to the end.
      deadline: (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'),
    };
    return rows.sort(by[sort]);
  }, [data.professors, people, search, university, field, status, who, sort, followupOnly, followUpDays, contactOf, statusOf]);

  const filtering = !!(search || university || field || status || who || followupOnly);
  function clearFilters() {
    setSearch(''); setUniversity(''); setField(''); setStatus(''); setWho('');
    setParams({});
  }

  function toggleFollowup(on: boolean) {
    setParams(on ? { followup: '1' } : {});
  }

  /** The "Angon: Sent (Oct 20)" line for one person. */
  function progress(p: Professor, uid: string) {
    const c = contactOf(p.id, uid);
    const age = followUpAge(c, followUpDays);
    return { c, age };
  }

  if (loading) return <p className="muted">Loading your data…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Professors <span className="text-base font-normal muted">({list.length})</span></h1>
        <div className="flex gap-2">
          <ColumnPicker fixedLabel="Professor" defs={PROFESSOR_COLUMNS} cols={cols} people={people} online={online} />
          <button className="btn" onClick={() => runExport('professors')} disabled={exporting || !data.professors.length}>
            ⬇️ {exporting ? 'Making file…' : 'Export Excel'}
          </button>
          <Link to="/professors/new" className="btn btn-primary">+ Add</Link>
        </div>
      </div>

      <div className="card space-y-3 p-3">
        <input className="input" type="search" placeholder="Search name, university, field or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select className="input" value={university} onChange={(e) => setUniversity(e.target.value)} aria-label="University">
            <option value="">All universities</option>
            {universities.map((u) => <option key={u}>{u}</option>)}
          </select>
          <select className="input" value={field} onChange={(e) => setField(e.target.value)} aria-label="Field">
            <option value="">All fields</option>
            {fields.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status | '')} aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="For which person">
            <option value="">For anyone</option>
            {people.map((u) => <option key={u.user_id} value={u.user_id}>For {u.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={followupOnly} onChange={(e) => toggleFollowup(e.target.checked)} />
            Needs follow-up
          </label>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="sort" className="muted">Sort by</label>
            <select id="sort" className="input !w-auto !py-1" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="added">Date added</option>
              <option value="deadline">Deadline</option>
              <option value="name">Name</option>
            </select>
            {filtering && <button className="btn !py-1" onClick={clearFilters}>Clear</button>}
          </div>
        </div>
      </div>

      {list.length === 0 && (
        <div className="card p-6 text-center muted">
          {data.professors.length === 0 ? 'No professors yet. Tap “+ Add” to add the first one.' : 'No professors match these filters.'}
        </div>
      )}

      {/* Phone: cards */}
      <div className="space-y-3 md:hidden">
        {list.map((p) => {
          const dl = deadlineInfo(p.deadline);
          return (
            <div key={p.id} className="card p-4">
              <Link to={`/professors/${p.id}`} className="block !text-inherit">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm muted">{[p.university, p.field].filter(Boolean).join(' · ') || 'No university yet'}</div>
                {dl?.soon && <div className="mt-1"><Badge tone="red">Deadline {dl.days === 0 ? 'today' : `in ${dl.days}d`}</Badge></div>}
              </Link>
              {extraCols.length > 0 && (
                <div className="mt-2 space-y-0.5 text-sm">
                  {extraCols.map((c) => <div key={c.id}><span className="muted">{c.label}:</span> <span className="break-words">{cell(c.id, p, true)}</span></div>)}
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {shownPeople.map((u) => {
                  const { c, age } = progress(p, u.user_id);
                  return (
                    <div key={u.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-14 shrink-0 font-medium">{u.name}</span>
                      <StatusChip status={c?.status || 'Not sent'} />
                      {u.user_id === user?.user_id
                        ? <SentDate professor={p} />
                        : c?.date_sent && <span className="muted">{formatShortDate(c.date_sent)}</span>}
                      {age !== null && <Badge tone="orange">Follow up</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Computer: table with every person side by side */}
      {list.length > 0 && (
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                <th className="p-3">Professor</th>
                {shownCols.map((c) => <th key={c.id} className="p-3">{c.label}</th>)}
                {shownPeople.map((u) => <th key={u.user_id} className="p-3">{u.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-medium">
                      <Link to={`/professors/${p.id}`}>{p.name}</Link>
                      <div className="text-xs font-normal">
                        {safeUrl(p.lab_url) && <a href={safeUrl(p.lab_url)} target="_blank" rel="noreferrer">Lab</a>}
                        {safeUrl(p.lab_url) && safeUrl(p.scholar_url) && <span className="muted"> · </span>}
                        {safeUrl(p.scholar_url) && <a href={safeUrl(p.scholar_url)} target="_blank" rel="noreferrer">Scholar</a>}
                      </div>
                    </td>
                    {shownCols.map((c) => (
                      <td key={c.id} className={`p-3 ${c.id === 'deadline' || c.id === 'added' ? 'whitespace-nowrap' : ''}`}>{cell(c.id, p)}</td>
                    ))}
                    {shownPeople.map((u) => {
                      const { c, age } = progress(p, u.user_id);
                      return (
                        <td key={u.user_id} className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusChip status={c?.status || 'Not sent'} />
                            {age !== null && <Badge tone="orange">Follow up</Badge>}
                          </div>
                          {u.user_id === user?.user_id
                            ? <div className="mt-1"><SentDate professor={p} /></div>
                            : c?.date_sent && <div className="mt-0.5 text-xs muted">{formatDate(c.date_sent)}</div>}
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
    </div>
  );
}
