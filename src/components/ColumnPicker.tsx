import { useState } from 'react';
import Modal from './Modal';
import type { ColumnDef } from '../lib/columns';
import type { AppUser } from '../lib/types';
import type { Columns } from '../lib/useColumns';

/** A button and a box where I choose which information I see in a list. Only my own view changes. */
export default function ColumnPicker({ fixedLabel, defs, cols, people, online }: {
  /** The column that is always shown (the name). */
  fixedLabel: string;
  defs: ColumnDef[];
  cols: Columns;
  people: AppUser[];
  online: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn !py-1" onClick={() => setOpen(true)}>⚙️ Columns{cols.customised ? ' •' : ''}</button>
      {open && (
        <Modal title="What do you want to see?" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm muted">
              This is only <b>your</b> view. Other people keep their own. It is saved for you, so it is the same on your phone and your computer.
            </p>

            <fieldset className="space-y-2">
              <legend className="label">Information</legend>
              <label className="flex items-center gap-2 text-sm muted">
                <input type="checkbox" checked disabled /> {fixedLabel} (always shown)
              </label>
              {defs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cols.isOn(d.id)} disabled={!online} onChange={(e) => cols.set(d.id, e.target.checked)} />
                  {d.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="label">People</legend>
              {people.map((p) => (
                <label key={p.user_id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cols.personOn(p.user_id)} disabled={!online} onChange={(e) => cols.setPerson(p.user_id, e.target.checked)} />
                  {p.name}’s status
                </label>
              ))}
            </fieldset>

            {!online && <p className="text-sm text-amber-700 dark:text-amber-300">You are offline, so you cannot change your view right now.</p>}

            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>
              <button className="btn" onClick={cols.reset} disabled={!cols.customised || !online}>Back to default</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
