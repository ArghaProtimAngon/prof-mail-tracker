import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

interface UserRow {
  user_id: string;
  name: string;
  role: string;
  invite_used: boolean;
  revoked: boolean;
  invite_code: string;
}

const linkFor = (code: string) => `${window.location.origin}/join?code=${code}`;

export default function Admin() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setUsers(await api<UserRow[]>('listUsers')); }
    catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  // Copies the link. If the browser does not allow it, the link is shown on screen to copy by hand.
  async function copy(code: string) {
    const link = linkFor(code);
    setLastLink(link);
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied! Send it to the person.');
    } catch {
      toast('Could not copy automatically. Copy the link shown below.', 'error');
    }
  }

  const create = () => run(async () => {
    const r = await api<{ invite_code: string }>('createInvite', { name });
    setName('');
    await copy(r.invite_code);
  });

  const regenerate = (id: string) => run(async () => {
    const r = await api<{ invite_code: string }>('regenerateInvite', { user_id: id });
    await copy(r.invite_code);
  });

  const revoke = (u: UserRow) => {
    if (!window.confirm(`Revoke ${u.name}? They will be logged out.`)) return;
    run(async () => {
      await api('revokeUser', { user_id: u.user_id });
      toast(`${u.name} was revoked.`);
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <div className="card space-y-2 p-4">
        <h2 className="font-medium">Create an invite link</h2>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Ayon" className="input flex-1" />
          <button disabled={busy || !name.trim()} onClick={create} className="btn btn-primary">Create</button>
        </div>
        {lastLink && (
          <div className="break-all rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
            <div className="mb-1 muted">Latest link:</div>
            {lastLink}
          </div>
        )}
      </div>

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {users.map((u) => (
          <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-medium">{u.name} <span className="text-xs muted">({u.role})</span></div>
              <div className="text-sm muted">{u.revoked ? 'Revoked' : u.invite_used ? 'Joined' : 'Waiting to join'}</div>
            </div>
            <div className="flex gap-2 text-sm">
              {u.invite_code && <button onClick={() => copy(u.invite_code)} className="btn">Copy link</button>}
              <button disabled={busy} onClick={() => regenerate(u.user_id)} className="btn">New link</button>
              {u.role !== 'admin' && !u.revoked && <button disabled={busy} onClick={() => revoke(u)} className="btn btn-danger">Revoke</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm muted">
        One link works on all of a person’s devices (up to 10). Press “New link” only if a link was shared with the wrong person: the old link stops working
        and the person is logged out everywhere. Their data stays.
      </p>
    </div>
  );
}
