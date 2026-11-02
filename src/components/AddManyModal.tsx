import { useState } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';

/** Paste a list of university names, one per line. Names already in the list are skipped. */
export default function AddManyModal({ onClose }: { onClose: () => void }) {
  const { refresh, online } = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped: number }>('addUniversities', { names: text });
      toast(
        `${r.added} universit${r.added === 1 ? 'y' : 'ies'} added.` +
          (r.skipped ? ` ${r.skipped} skipped because they were already in the list.` : '')
      );
      await refresh();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add many universities" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm muted">Write or paste one university name on each line. You can fill in the details of each one later.</p>
        <textarea
          className="input"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Massachusetts Institute of Technology\nStanford University\nUniversity of Oxford'}
          aria-label="University names, one per line"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !count || count > 100 || !online}>
            {busy ? 'Adding…' : `Add ${count || ''} ${count === 1 ? 'university' : 'universities'}`}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
        {count > 100 && <p className="text-sm text-red-600 dark:text-red-400">Please add at most 100 at a time.</p>}
      </form>
    </Modal>
  );
}
