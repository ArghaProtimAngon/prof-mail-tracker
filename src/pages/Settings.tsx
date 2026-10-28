import { useState } from 'react';
import { useData } from '../lib/data';
import { ThemeButton } from '../components/Layout';

export default function Settings() {
  const { followUpDays, save, online } = useData();
  const [days, setDays] = useState(String(followUpDays));
  const [busy, setBusy] = useState(false);

  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await save('saveSetting', { key: 'follow_up_days', value: n }, 'Settings saved.');
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <form onSubmit={submit} className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="days">Follow-up reminder (days)</label>
          <input id="days" className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          <p className="mt-1 text-sm muted">
            If an email is “Sent” or “Seen” for more than this many days, it gets a “Follow up” badge. This setting is shared by everyone.
          </p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !valid || n === followUpDays || !online}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      <div className="card space-y-2 p-4">
        <div className="font-semibold">Appearance</div>
        <p className="text-sm muted">“System” follows your phone or computer. This choice is only for this device.</p>
        <ThemeButton />
      </div>
    </div>
  );
}
