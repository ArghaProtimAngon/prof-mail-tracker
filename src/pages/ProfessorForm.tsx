import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { normalizeEmail, similarProfessor } from '../lib/utils';

const BLANK = { name: '', university: '', field: '', email: '', lab_url: '', scholar_url: '', has_funding: 'unknown', deadline: '', notes: '' };

export default function ProfessorForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, save, professorById, online } = useData();
  const existing = id ? professorById(id) : undefined;

  const [form, setForm] = useState(() => (existing ? {
    name: existing.name, university: existing.university, field: existing.field, email: existing.email,
    lab_url: existing.lab_url, scholar_url: existing.scholar_url, has_funding: existing.has_funding,
    deadline: existing.deadline, notes: existing.notes,
  } : BLANK));
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="muted">Loading…</p>;
  if (id && !existing) {
    return <p>This professor was not found. It may have been deleted. <Link to="/professors">Back to the list</Link></p>;
  }

  const set = (key: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Duplicate warnings (we never block, we only warn).
  const email = normalizeEmail(form.email);
  const sameEmail = email ? data.professors.find((p) => p.id !== id && normalizeEmail(p.email) === email) : undefined;
  const similar = !sameEmail ? similarProfessor(data.professors, form.name, form.university, id) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = await save(
      existing ? 'updateProfessor' : 'addProfessor',
      existing ? { id: existing.id, ...form } : form,
      existing ? 'Saved.' : 'Professor added.'
    );
    setSaving(false);
    if (ok) navigate(existing ? `/professors/${existing.id}` : '/professors', { replace: true });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <Link to={existing ? `/professors/${existing.id}` : '/professors'} className="text-sm">← Back</Link>
      <h1 className="text-2xl font-semibold">{existing ? 'Edit professor' : 'Add professor'}</h1>

      {sameEmail && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          ⚠️ This email is already in the list for <Link to={`/professors/${sameEmail.id}`}>{sameEmail.name}</Link>. You may be adding the same professor twice.
        </div>
      )}
      {similar && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          ⚠️ A very similar name at the same university is already in the list: <Link to={`/professors/${similar.id}`}>{similar.name}</Link>.
        </div>
      )}

      <div>
        <label className="label" htmlFor="name">Name *</label>
        <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} placeholder="Prof. Jane Smith" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="university">University</label>
          <input id="university" className="input" maxLength={200} value={form.university} onChange={set('university')} />
        </div>
        <div>
          <label className="label" htmlFor="field">Field</label>
          <input id="field" className="input" maxLength={200} value={form.field} onChange={set('field')} placeholder="e.g. Machine learning" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" maxLength={200} value={form.email} onChange={set('email')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lab_url">Lab website</label>
          <input id="lab_url" className="input" inputMode="url" maxLength={500} value={form.lab_url} onChange={set('lab_url')} placeholder="https://" />
        </div>
        <div>
          <label className="label" htmlFor="scholar_url">Google Scholar</label>
          <input id="scholar_url" className="input" inputMode="url" maxLength={500} value={form.scholar_url} onChange={set('scholar_url')} placeholder="https://" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="has_funding">Has funding?</label>
          <select id="has_funding" className="input" value={form.has_funding} onChange={set('has_funding')}>
            <option value="unknown">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="deadline">Application deadline</label>
          <input id="deadline" className="input" type="date" value={form.deadline} onChange={set('deadline')} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes (shared with everyone)</label>
        <textarea id="notes" className="input" rows={4} maxLength={5000} value={form.notes} onChange={set('notes')} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim() || !online}>
          {saving ? 'Saving…' : existing ? 'Save changes' : sameEmail || similar ? 'Add anyway' : 'Add professor'}
        </button>
        <Link to={existing ? `/professors/${existing.id}` : '/professors'} className="btn">Cancel</Link>
      </div>
      {!online && <p className="text-sm text-amber-700 dark:text-amber-300">You are offline, so you cannot save right now.</p>}
    </form>
  );
}
