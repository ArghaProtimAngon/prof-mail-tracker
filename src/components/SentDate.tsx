import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useToast } from '../lib/toast';
import type { Professor, Status } from '../lib/types';
import { todayStr } from '../lib/utils';

/**
 * "The date I sent the email" for one professor, edited right in the list.
 * It only ever changes MY date. Everyone else sees it as plain text.
 */
export default function SentDate({ professor }: { professor: Professor }) {
  const { user } = useAuth();
  const { contactOf, save, online } = useData();
  const toast = useToast();

  const contact = user ? contactOf(professor.id, user.user_id) : undefined;
  const saved = contact?.date_sent || '';
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);

  // Follow the saved value when it changes (for example after the data reloads).
  useEffect(() => setValue(saved), [saved]);

  async function change(next: string) {
    const status: Status = contact?.status || 'Not sent';
    let newStatus: Status = status;
    if (next) {
      // Putting in a date means the email was sent.
      if (status === 'Not sent') newStatus = 'Sent';
    } else if (status === 'Sent' || status === 'Seen') {
      // Clearing the date of an email that is only "Sent" means it was not sent after all.
      newStatus = 'Not sent';
    } else {
      toast('To remove the date, first set your status to “Not sent” on the professor’s page.', 'error');
      return;
    }

    setValue(next);
    setBusy(true);
    const ok = await save('saveContact', {
      professor_id: professor.id,
      status: newStatus,
      date_sent: next,
      response_text: contact?.response_text || '',
    });
    setBusy(false);
    if (!ok) setValue(saved);
  }

  return (
    <input
      type="date"
      className="input !w-auto !py-1 text-sm"
      aria-label={`The date I sent the email to ${professor.name}`}
      title="The date I sent the email"
      value={value}
      max={todayStr()}
      disabled={busy || !online}
      onChange={(e) => change(e.target.value)}
    />
  );
}
