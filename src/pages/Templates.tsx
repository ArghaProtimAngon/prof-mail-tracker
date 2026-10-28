import { useState } from 'react';
import { useData } from '../lib/data';
import type { Template } from '../lib/types';
import Modal from '../components/Modal';

const PLACEHOLDERS = ['{professor_name}', '{professor_last_name}', '{university}', '{field}', '{my_name}'];

export default function Templates() {
  const { data, loading, save, online } = useData();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="muted">Loading…</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const ok = await save('saveTemplate', { ...editing }, 'Template saved.');
    setBusy(false);
    if (ok) setEditing(null);
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const ok = await save('deleteTemplate', { id: deleting.id }, 'Template deleted.');
    setBusy(false);
    if (ok) setDeleting(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Email templates</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ title: '', subject: '', body: '' })}>+ New</button>
      </div>
      <p className="text-sm muted">
        Only you can see your templates. Use these placeholders and they will be filled in for each professor:{' '}
        {PLACEHOLDERS.map((p) => <code key={p} className="mr-1 rounded bg-slate-200 px-1 dark:bg-slate-800">{p}</code>)}
      </p>

      {data.templates.length === 0 && <div className="card p-6 text-center muted">No templates yet.</div>}

      {data.templates.map((t) => (
        <div key={t.id} className="card space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{t.title}</div>
              <div className="truncate text-sm muted">Subject: {t.subject || '—'}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="btn" onClick={() => setEditing(t)}>Edit</button>
              <button className="btn btn-danger" onClick={() => setDeleting(t)} disabled={!online}>Delete</button>
            </div>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{t.body}</p>
        </div>
      ))}

      {editing && (
        <Modal title={editing.id ? 'Edit template' : 'New template'} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label" htmlFor="t-title">Title</label>
              <input id="t-title" className="input" required maxLength={100} value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. First email" />
            </div>
            <div>
              <label className="label" htmlFor="t-subject">Subject</label>
              <input id="t-subject" className="input" maxLength={300} value={editing.subject || ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="PhD inquiry – {field}" />
            </div>
            <div>
              <label className="label" htmlFor="t-body">Body</label>
              <textarea id="t-body" className="input" rows={9} maxLength={10000} value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={'Dear Prof. {professor_last_name},\n\n...\n\nBest regards,\n{my_name}'} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete this template?" onClose={() => setDeleting(null)}>
          <p className="mb-4 muted">“{deleting.title}” will be removed for good.</p>
          <div className="flex gap-2">
            <button className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
            <button className="btn" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
