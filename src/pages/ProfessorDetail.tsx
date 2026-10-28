import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';
import { STATUSES, type Contact, type Professor, type Status } from '../lib/types';
import { deadlineInfo, followUpAge, formatDate, safeUrl, todayStr } from '../lib/utils';
import StatusChip, { Badge } from '../components/StatusChip';
import Modal from '../components/Modal';
import EmailModal from '../components/EmailModal';

const FUNDING_LABEL = { yes: 'Yes', no: 'No', unknown: 'Unknown' };

export default function ProfessorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loading, professorById, people, contactOf, followUpDays, save, online, userName } = useData();
  const toast = useToast();
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const p = id ? professorById(id) : undefined;
  if (loading) return <p className="muted">Loading…</p>;
  if (!p) return <p>This professor was not found. It may have been deleted. <Link to="/professors">Back to the list</Link></p>;

  const dl = deadlineInfo(p.deadline);

  async function remove() {
    setBusy(true);
    const ok = await save('deleteProfessor', { id: p!.id }, 'Professor deleted.');
    setBusy(false);
    if (ok) navigate('/professors', { replace: true });
  }

  async function copyEmail() {
    try { await navigator.clipboard.writeText(p!.email); toast('Email address copied.'); }
    catch { toast('Could not copy.', 'error'); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/professors" className="text-sm">← All professors</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="muted">{[p.university, p.field].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/professors/${p.id}/edit`} className="btn">Edit</Link>
          <button className="btn btn-danger" onClick={() => setDeleteOpen(true)} disabled={!online}>Delete</button>
        </div>
      </div>

      <section className="card space-y-2 p-4 text-sm">
        <Row label="Email">
          {p.email ? (<><a href={`mailto:${p.email}`}>{p.email}</a> <button className="ml-2 text-xs underline muted" onClick={copyEmail}>copy</button></>) : <span className="muted">—</span>}
        </Row>
        <Row label="Lab website">{safeUrl(p.lab_url) ? <a href={safeUrl(p.lab_url)} target="_blank" rel="noreferrer">{p.lab_url}</a> : <span className="muted">—</span>}</Row>
        <Row label="Google Scholar">{safeUrl(p.scholar_url) ? <a href={safeUrl(p.scholar_url)} target="_blank" rel="noreferrer">{p.scholar_url}</a> : <span className="muted">—</span>}</Row>
        <Row label="Funding">{FUNDING_LABEL[p.has_funding] || 'Unknown'}</Row>
        <Row label="Deadline">
          {p.deadline ? (
            <>
              {formatDate(p.deadline)}{' '}
              {dl?.soon && <Badge tone="red">{dl.days === 0 ? 'Today!' : `In ${dl.days} days`}</Badge>}
              {dl?.passed && <Badge tone="gray">Passed</Badge>}
            </>
          ) : <span className="muted">—</span>}
        </Row>
        <Row label="Added by">{userName(p.added_by)}</Row>
      </section>

      <button className="btn btn-primary w-full !py-3" onClick={() => setEmailOpen(true)}>✉️ Email with template</button>

      <h2 className="pt-2 text-lg font-semibold">Progress</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {people.map((u) =>
          u.user_id === user?.user_id ? (
            <MyProgress key={`${u.user_id}-${contactOf(p.id, u.user_id)?.updated_at}`} professor={p} contact={contactOf(p.id, u.user_id)} />
          ) : (
            <TheirProgress key={u.user_id} name={u.name} contact={contactOf(p.id, u.user_id)} followUpDays={followUpDays} />
          )
        )}
      </div>

      <NotesCard key={p.updated_at} professor={p} />

      {emailOpen && <EmailModal professor={p} onClose={() => setEmailOpen(false)} />}
      {deleteOpen && (
        <Modal title="Delete this professor?" onClose={() => setDeleteOpen(false)}>
          <p className="mb-4 muted">“{p.name}” will be hidden from the list for everyone. (The row stays in your Google Sheet, so it can be restored by hand.)</p>
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

function TheirProgress({ name, contact, followUpDays }: { name: string; contact?: Contact; followUpDays: number }) {
  const age = followUpAge(contact, followUpDays);
  return (
    <div className="card space-y-2 p-4">
      <div className="font-semibold">{name}</div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={contact?.status || 'Not sent'} />
        {age !== null && <Badge tone="orange">Follow up</Badge>}
      </div>
      {contact?.date_sent && <div className="text-sm muted">Sent {formatDate(contact.date_sent)}</div>}
      {contact?.response_text && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60">{contact.response_text}</p>}
    </div>
  );
}

function MyProgress({ professor, contact }: { professor: Professor; contact?: Contact }) {
  const { save, online, followUpDays } = useData();
  // The parent gives this form a new "key" whenever the saved data changes, so it starts fresh.
  const [status, setStatus] = useState<Status>(contact?.status || 'Not sent');
  const [date, setDate] = useState(contact?.date_sent || '');
  const [reply, setReply] = useState(contact?.response_text || '');
  const [busy, setBusy] = useState(false);

  const age = followUpAge({ status, date_sent: date }, followUpDays);
  const changed = status !== (contact?.status || 'Not sent') || date !== (contact?.date_sent || '') || reply !== (contact?.response_text || '');

  function pickStatus(next: Status) {
    setStatus(next);
    // Choosing any "sent" status fills in today's date, if no date is set yet.
    if (next !== 'Not sent' && !date) setDate(todayStr());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await save('saveContact', { professor_id: professor.id, status, date_sent: status === 'Not sent' ? '' : date, response_text: reply }, 'Progress saved.');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-3 border-indigo-300 p-4 dark:border-indigo-700">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Me</div>
        {age !== null && <Badge tone="orange">Follow up</Badge>}
      </div>
      <div>
        <label className="label" htmlFor="my-status">My status</label>
        <select id="my-status" className="input" value={status} onChange={(e) => pickStatus(e.target.value as Status)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {status !== 'Not sent' && (
        <div>
          <label className="label" htmlFor="my-date">Date sent</label>
          <input id="my-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="my-reply">Reply / my notes</label>
        <textarea id="my-reply" className="input" rows={3} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Paste or summarise their reply here" />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={busy || !changed || !online}>{busy ? 'Saving…' : 'Save my progress'}</button>
    </form>
  );
}

function NotesCard({ professor }: { professor: Professor }) {
  const { save, online } = useData();
  const [notes, setNotes] = useState(professor.notes);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await save('updateProfessor', { id: professor.id, notes }, 'Notes saved.');
    setBusy(false);
  }

  return (
    <section className="card space-y-2 p-4">
      <label className="font-semibold" htmlFor="notes">Notes <span className="text-sm font-normal muted">(shared with everyone)</span></label>
      <textarea id="notes" className="input" rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn-primary" onClick={submit} disabled={busy || notes === professor.notes || !online}>{busy ? 'Saving…' : 'Save notes'}</button>
    </section>
  );
}
