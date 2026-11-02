import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { CHECKLIST_ITEMS, UNI_STATUSES, type University, type UniStatus, type UniversityProgress } from '../lib/types';
import { checklistKeys, deadlineInfo, formatDate, safeUrl, uniKey } from '../lib/utils';
import { Badge, UniStatusChip } from '../components/StatusChip';
import Modal from '../components/Modal';

const FUNDING_LABEL = { yes: 'Yes', no: 'No', unknown: 'Unknown' };

export default function UniversityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, universityById, people, uniProgressOf, save, online, userName } = useData();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const u = id ? universityById(id) : undefined;
  if (loading) return <p className="muted">Loading…</p>;
  if (!u) return <p>This university was not found. It may have been deleted. <Link to="/universities">Back to the list</Link></p>;

  const dl = deadlineInfo(u.deadline);
  const professors = data.professors.filter((p) => uniKey(p.university) === uniKey(u.name));

  async function remove() {
    setBusy(true);
    const ok = await save('deleteUniversity', { id: u!.id }, 'University deleted.');
    setBusy(false);
    if (ok) navigate('/universities', { replace: true });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/universities" className="text-sm">← All universities</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{u.name}</h1>
          <p className="muted">{[u.program, u.country].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {u.priority && <Badge tone={u.priority === 'High' ? 'orange' : 'gray'}>{u.priority} priority</Badge>}
            {u.tier && <Badge tone="gray">{u.tier}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/universities/${u.id}/edit`} className="btn">Edit</Link>
          <button className="btn btn-danger" onClick={() => setDeleteOpen(true)} disabled={!online}>Delete</button>
        </div>
      </div>

      <section className="card space-y-2 p-4 text-sm">
        <Row label="Website">{safeUrl(u.website) ? <a href={safeUrl(u.website)} target="_blank" rel="noreferrer">{u.website}</a> : <span className="muted">—</span>}</Row>
        <Row label="Admission page">{safeUrl(u.admission_url) ? <a href={safeUrl(u.admission_url)} target="_blank" rel="noreferrer">{u.admission_url}</a> : <span className="muted">—</span>}</Row>
        <Row label="Deadline">
          {u.deadline ? (
            <>
              {formatDate(u.deadline)}{' '}
              {dl?.soon && <Badge tone="red">{dl.days === 0 ? 'Today!' : `In ${dl.days} days`}</Badge>}
              {dl?.passed && <Badge tone="gray">Passed</Badge>}
            </>
          ) : <span className="muted">—</span>}
        </Row>
        <Row label="Application fee">{u.fee || <span className="muted">—</span>}</Row>
        <Row label="Funding">{FUNDING_LABEL[u.funding] || 'Unknown'}</Row>
        <Row label="Added by">{userName(u.added_by)}</Row>
      </section>

      <h2 className="pt-2 text-lg font-semibold">Applications</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {people.map((p) =>
          p.user_id === user?.user_id ? (
            <MyApplication
              key={`${p.user_id}-${uniProgressOf(u.id, p.user_id)?.updated_at}`}
              university={u}
              progress={uniProgressOf(u.id, p.user_id)}
            />
          ) : (
            <TheirApplication key={p.user_id} name={p.name} progress={uniProgressOf(u.id, p.user_id)} />
          )
        )}
      </div>

      <section className="card space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Professors here ({professors.length})</h2>
          <Link to={`/professors/new?university=${encodeURIComponent(u.name)}`} className="btn !py-1">+ Add professor</Link>
        </div>
        {professors.length === 0 ? (
          <p className="text-sm muted">No professors from this university yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {professors.map((p) => (
              <li key={p.id} className="py-2">
                <Link to={`/professors/${p.id}`}>{p.name}</Link>
                {p.field && <span className="text-sm muted"> · {p.field}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotesCard key={u.updated_at} university={u} />

      {deleteOpen && (
        <Modal title="Delete this university?" onClose={() => setDeleteOpen(false)}>
          <p className="mb-4 muted">“{u.name}” will be hidden from the list for everyone. (The row stays in your Google Sheet, so it can be restored by hand.) Professors from this university stay as they are.</p>
          <div className="flex gap-2">
            <button className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
            <button className="btn" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-28 shrink-0 muted">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Another person's application. Everyone can see it, only its owner can change it. */
function TheirApplication({ name, progress }: { name: string; progress?: UniversityProgress }) {
  const done = checklistKeys(progress?.checklist || '');
  return (
    <div className="card space-y-2 p-4">
      <div className="font-semibold">{name}</div>
      <UniStatusChip status={progress?.status || 'Not started'} />
      <ul className="space-y-0.5 text-sm">
        {CHECKLIST_ITEMS.map((i) => (
          <li key={i.key} className={done.includes(i.key) ? '' : 'muted'}>
            {done.includes(i.key) ? '✅' : '⬜'} {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyApplication({ university, progress }: { university: University; progress?: UniversityProgress }) {
  const { save, online } = useData();
  // The parent gives this form a new "key" whenever the saved data changes, so it starts fresh.
  const [status, setStatus] = useState<UniStatus>(progress?.status || 'Not started');
  const [done, setDone] = useState<string[]>(checklistKeys(progress?.checklist || ''));
  const [busy, setBusy] = useState(false);

  const savedDone = checklistKeys(progress?.checklist || '');
  const changed = status !== (progress?.status || 'Not started') || done.slice().sort().join() !== savedDone.slice().sort().join();

  const toggle = (key: string) => setDone((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await save('saveUniversityProgress', { university_id: university.id, status, checklist: done }, 'Application saved.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-3 border-indigo-300 p-4 dark:border-indigo-700">
      <div className="font-semibold">Me</div>
      <div>
        <label className="label" htmlFor="my-uni-status">My application status</label>
        <select id="my-uni-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as UniStatus)}>
          {UNI_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <fieldset>
        <legend className="label">Documents ready</legend>
        <div className="space-y-1.5">
          {CHECKLIST_ITEMS.map((i) => (
            <label key={i.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={done.includes(i.key)} onChange={() => toggle(i.key)} />
              {i.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !changed || !online}>{busy ? 'Saving…' : 'Save my application'}</button>
    </form>
  );
}

function NotesCard({ university }: { university: University }) {
  const { save, online } = useData();
  const [notes, setNotes] = useState(university.notes);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await save('updateUniversity', { id: university.id, notes }, 'Notes saved.');
    setBusy(false);
  }

  return (
    <section className="card space-y-2 p-4">
      <label className="font-semibold" htmlFor="uni-notes">Notes <span className="text-sm font-normal muted">(shared with everyone)</span></label>
      <textarea id="uni-notes" className="input" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn-primary" onClick={submit} disabled={busy || notes === university.notes || !online}>{busy ? 'Saving…' : 'Save notes'}</button>
    </section>
  );
}
