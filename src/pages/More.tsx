import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useExport } from '../lib/useExport';
import { ThemeButton } from '../components/Layout';
import QuickAddUniversity from '../components/QuickAddUniversity';

export default function More() {
  const { user, logout } = useAuth();
  const [addUniOpen, setAddUniOpen] = useState(false);
  const { busy: exporting, run: runExport } = useExport();
  const item = 'card flex items-center gap-3 p-4 font-medium !text-inherit';

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">More</h1>
      <p className="muted">Signed in as <b>{user?.name}</b></p>
      <button className={`${item} w-full text-left`} onClick={() => setAddUniOpen(true)}>➕ Add university</button>
      <Link to="/templates" className={item}>✉️ Email templates</Link>
      <Link to="/settings" className={item}>⚙️ Settings</Link>
      {user?.role === 'admin' && <Link to="/admin" className={item}>🔑 Admin (invite links)</Link>}
      <button className={`${item} w-full text-left`} onClick={() => runExport('all')} disabled={exporting}>⬇️ {exporting ? 'Making file…' : 'Export all (Excel)'}</button>
      <ThemeButton className="btn w-full !py-3" />
      <button className="btn w-full !py-3" onClick={logout}>Log out</button>
      {addUniOpen && <QuickAddUniversity onClose={() => setAddUniOpen(false)} />}
    </div>
  );
}
