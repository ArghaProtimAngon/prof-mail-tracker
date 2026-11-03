import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';
import { formatDateTime } from '../lib/utils';

interface Status {
  configured: boolean;
  last_backup_at: string;
  last_backup_by: string;
  last_restore_at: string;
  last_restore_by: string;
}

const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

/** Admin only: copy everything to the Google Sheet, or bring it back. Both ask "Are you sure?" first. */
export default function BackupCard() {
  const { refresh, online } = useData();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [dialog, setDialog] = useState<'backup' | 'restore' | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setStatus(await api<Status>('backupStatus')); }
    catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  function close() {
    if (busy) return;
    setDialog(null);
    setTyped('');
  }

  async function backup() {
    setBusy(true);
    try {
      const r = await api<{ counts: Record<string, number> }>('backupToSheet');
      toast(`Backup done: ${total(r.counts)} rows saved to your Google Sheet.`);
      setDialog(null);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const r = await api<{ counts: Record<string, number> }>('restoreFromSheet', { confirm: 'RESTORE' });
      toast(`Restore done: ${total(r.counts)} rows loaded from your Google Sheet.`);
      setDialog(null);
      setTyped('');
      await refresh(); // show the restored data
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const lastBackup = status?.last_backup_at
    ? `${formatDateTime(status.last_backup_at)}${status.last_backup_by ? ` (by ${status.last_backup_by})` : ''}`
    : 'never';

  return (
    <div className="card space-y-3 p-4">
      <div className="font-semibold">Backup (admin only)</div>
      <p className="text-sm muted">
        Your data lives in the app’s database. Your Google Sheet is the backup copy. Back up often, and restore only if something went wrong.
      </p>

      {status && !status.configured && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Backup is not set up yet. Follow the “Backup to Google Sheet” steps in the README (you need <code>SHEET_API_URL</code> and <code>BACKUP_KEY</code> in Vercel).
        </div>
      )}

      <div className="space-y-0.5 text-sm">
        <div><span className="muted">Last backup:</span> {status ? lastBackup : '…'}</div>
        {status?.last_restore_at && (
          <div><span className="muted">Last restore:</span> {formatDateTime(status.last_restore_at)}{status.last_restore_by ? ` (by ${status.last_restore_by})` : ''}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => setDialog('backup')} disabled={!online || !status?.configured}>
          ⬆️ Back up to Google Sheet
        </button>
        <button className="btn btn-danger" onClick={() => setDialog('restore')} disabled={!online || !status?.configured}>
          ⬇️ Restore from Google Sheet
        </button>
      </div>

      {dialog === 'backup' && (
        <Modal title="Back up to Google Sheet?" onClose={close}>
          <p className="mb-4 text-sm">
            This copies everything in the app (professors, universities, statuses, templates, activity and users) into your Google Sheet.
            It <b>replaces</b> what is in the Sheet’s backup tabs now. Your app data does not change. Are you sure?
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={backup} disabled={busy}>{busy ? 'Backing up…' : 'Yes, back up now'}</button>
            <button className="btn" onClick={close} disabled={busy}>Cancel</button>
          </div>
        </Modal>
      )}

      {dialog === 'restore' && (
        <Modal title="Restore from Google Sheet?" onClose={close}>
          <div className="space-y-3 text-sm">
            <p>
              This <b>replaces ALL the data in the app</b> with what is in your Google Sheet. Anything added or changed after the last backup
              (<b>{lastBackup}</b>) will be <b>lost for good</b>. This cannot be undone.
            </p>
            <p className="muted">People who are in the Sheet stay logged in. People who are not in the Sheet are removed.</p>
            <div>
              <label className="label" htmlFor="restore-confirm">To continue, type <b>RESTORE</b> below:</label>
              <input
                id="restore-confirm"
                className="input"
                autoComplete="off"
                autoCapitalize="characters"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="RESTORE"
              />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-danger" onClick={restore} disabled={busy || typed !== 'RESTORE'}>
                {busy ? 'Restoring…' : 'Yes, replace everything'}
              </button>
              <button className="btn" onClick={close} disabled={busy}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
