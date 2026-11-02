import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { PRIORITIES, TIERS } from '../lib/types';
import { similarUniversity } from '../lib/utils';

const BLANK = {
  name: '', country: '', program: '', website: '', admission_url: '', deadline: '',
  fee: '', funding: 'unknown', priority: '', tier: '', notes: '',
};

export default function UniversityForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, save, universityById, online } = useData();
  const existing = id ? universityById(id) : undefined;

  const [form, setForm] = useState(() => (existing ? {
    name: existing.name, country: existing.country, program: existing.program, website: existing.website,
    admission_url: existing.admission_url, deadline: existing.deadline, fee: existing.fee, funding: existing.funding,
    priority: existing.priority as string, tier: existing.tier as string, notes: existing.notes,
  } : { ...BLANK, name: params.get('name') || '' }));
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="muted">Loading…</p>;
  if (id && !existing) {
    return <p>This university was not found. It may have been deleted. <Link to="/universities">Back to the list</Link></p>;
  }

  const set = (key: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // We only warn, we never block.
  const similar = similarUniversity(data.universities, form.name, id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const ok = await save(
      existing ? 'updateUniversity' : 'addUniversity',
      existing ? { id: existing.id, ...form } : form,
      existing ? 'Saved.' : 'University added.'
    );
    setSaving(false);
    if (ok) navigate(existing ? `/universities/${existing.id}` : '/universities', { replace: true });
  }

  const back = existing ? `/universities/${existing.id}` : '/universities';

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <Link to={back} className="text-sm">← Back</Link>
      <h1 className="text-2xl font-semibold">{existing ? 'Edit university' : 'Add university'}</h1>

      {similar && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          ⚠️ “<Link to={`/universities/${similar.id}`}>{similar.name}</Link>” is already in the list. You may be adding the same university twice.
        </div>
      )}

      <div>
        <label className="label" htmlFor="name">University name *</label>
        <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} placeholder="e.g. Massachusetts Institute of Technology" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="country">Country</label>
          <input id="country" className="input" maxLength={100} value={form.country} onChange={set('country')} />
        </div>
        <div>
          <label className="label" htmlFor="program">Department or program</label>
          <input id="program" className="input" maxLength={200} value={form.program} onChange={set('program')} placeholder="e.g. PhD in Computer Science" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="website">Website</label>
          <input id="website" className="input" inputMode="url" maxLength={500} value={form.website} onChange={set('website')} placeholder="https://" />
        </div>
        <div>
          <label className="label" htmlFor="admission_url">Admission page</label>
          <input id="admission_url" className="input" inputMode="url" maxLength={500} value={form.admission_url} onChange={set('admission_url')} placeholder="https://" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="deadline">Application deadline</label>
          <input id="deadline" className="input" type="date" value={form.deadline} onChange={set('deadline')} />
        </div>
        <div>
          <label className="label" htmlFor="fee">Application fee</label>
          <input id="fee" className="input" maxLength={50} value={form.fee} onChange={set('fee')} placeholder="e.g. $75 or Free" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="funding">Funding / scholarship?</label>
          <select id="funding" className="input" value={form.funding} onChange={set('funding')}>
            <option value="unknown">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="priority">Priority</label>
          <select id="priority" className="input" value={form.priority} onChange={set('priority')}>
            <option value="">Not set</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tier">Dream / Target / Safe</label>
          <select id="tier" className="input" value={form.tier} onChange={set('tier')}>
            <option value="">Not set</option>
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes (shared with everyone)</label>
        <textarea id="notes" className="input" rows={4} maxLength={5000} value={form.notes} onChange={set('notes')} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim() || !online}>
          {saving ? 'Saving…' : existing ? 'Save changes' : similar ? 'Add anyway' : 'Add university'}
        </button>
        <Link to={back} className="btn">Cancel</Link>
      </div>
      {!online && <p className="text-sm text-amber-700 dark:text-amber-300">You are offline, so you cannot save right now.</p>}
    </form>
  );
}
