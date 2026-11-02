import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useData } from '../lib/data';
import { similarUniversity } from '../lib/utils';

/** A small box to add a university by name. More details can be filled in later. */
export default function QuickAddUniversity({ onClose }: { onClose: () => void }) {
  const { data, save, online } = useData();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const similar = similarUniversity(data.universities, name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await save('addUniversity', { name }, 'University added.');
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title="Add university" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="quick-uni-name">University name</label>
          <input
            id="quick-uni-name"
            className="input"
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Massachusetts Institute of Technology"
          />
        </div>
        {similar && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            ⚠️ “<Link to={`/universities/${similar.id}`} onClick={onClose}>{similar.name}</Link>” is already in the list.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !online}>
            {busy ? 'Adding…' : similar ? 'Add anyway' : 'Add'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <Link
            to={`/universities/new${name.trim() ? `?name=${encodeURIComponent(name.trim())}` : ''}`}
            onClick={onClose}
            className="ml-auto text-sm"
          >
            Add with more details
          </Link>
        </div>
        {!online && <p className="text-sm text-amber-700 dark:text-amber-300">You are offline, so you cannot save right now.</p>}
      </form>
    </Modal>
  );
}
