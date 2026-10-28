import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';
import type { Professor } from '../lib/types';
import { fillTemplate, gmailUrl, mailtoUrl, todayStr } from '../lib/utils';

const BLANK = '__blank__';

export default function EmailModal({ professor, onClose }: { professor: Professor; onClose: () => void }) {
  const { user } = useAuth();
  const { data, save, contactOf } = useData();
  const toast = useToast();
  const [choice, setChoice] = useState(data.templates[0]?.id || BLANK);
  const [asked, setAsked] = useState(false); // after opening the mail app we ask "Did you send it?"
  const [busy, setBusy] = useState(false);

  const template = data.templates.find((t) => t.id === choice);
  const myName = user?.name || '';
  const subject = template ? fillTemplate(template.subject, professor, myName) : '';
  const body = template ? fillTemplate(template.body, professor, myName) : '';

  function openGmail() {
    window.open(gmailUrl(professor.email, subject, body), '_blank', 'noopener');
    setAsked(true);
  }
  function openMailto() {
    window.location.href = mailtoUrl(professor.email, subject, body);
    setAsked(true);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${professor.email}\nSubject: ${subject}\n\n${body}`);
      toast('Email copied.');
    } catch {
      toast('Could not copy. Please select the text and copy it by hand.', 'error');
    }
  }
  async function markSent() {
    if (!user) return;
    setBusy(true);
    const mine = contactOf(professor.id, user.user_id);
    const ok = await save(
      'saveContact',
      { professor_id: professor.id, status: 'Sent', date_sent: todayStr(), response_text: mine?.response_text || '' },
      'Marked as Sent.'
    );
    setBusy(false);
    if (ok) onClose();
  }

  if (!professor.email) {
    return (
      <Modal title="Email with template" onClose={onClose}>
        <p>This professor has no email address yet. Edit the professor and add one first.</p>
        <Link to={`/professors/${professor.id}/edit`} className="btn btn-primary mt-4">Edit professor</Link>
      </Modal>
    );
  }

  if (asked) {
    return (
      <Modal title="Did you send it?" onClose={onClose}>
        <p className="mb-4 muted">If you sent the email to {professor.name}, I will set your status to “Sent” with today’s date.</p>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={markSent} disabled={busy}>{busy ? 'Saving…' : 'Yes, I sent it'}</button>
          <button className="btn" onClick={onClose} disabled={busy}>Not yet</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Email ${professor.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="tpl">Template</label>
          <select id="tpl" className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {data.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            <option value={BLANK}>Blank email (no template)</option>
          </select>
          {data.templates.length === 0 && (
            <p className="mt-1 text-sm muted">You have no templates yet. <Link to="/templates">Create one</Link> to save time.</p>
          )}
        </div>

        {template && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div><span className="muted">To:</span> {professor.email}</div>
            <div><span className="muted">Subject:</span> {subject || '(empty)'}</div>
            <div className="whitespace-pre-wrap border-t border-slate-200 pt-2 dark:border-slate-700">{body || '(empty)'}</div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={openGmail}>Open Gmail</button>
          <button className="btn" onClick={openMailto}>Other mail app</button>
          <button className="btn" onClick={copy}>Copy email</button>
        </div>
      </div>
    </Modal>
  );
}
