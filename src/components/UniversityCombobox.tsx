import { useId, useState } from 'react';
import { uniKey } from '../lib/utils';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[]; // names from the Universities list
}

/**
 * A text box with a dropdown of your universities.
 * You can pick one, or just type any name you like.
 */
export default function UniversityCombobox({ id, value, onChange, options }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Show everything when the box is empty or already holds one of the names; otherwise filter by what was typed.
  const typed = uniKey(value);
  const exact = options.some((o) => uniKey(o) === typed);
  const shown = !typed || exact ? options : options.filter((o) => uniKey(o).includes(typed));

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-10"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={200}
        value={value}
        placeholder={options.length ? 'Type, or pick from your list' : 'Type the university name'}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {options.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show my universities"
          className="absolute inset-y-0 right-0 px-3 muted"
          // mousedown (not click) so the input does not lose focus first
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        >
          ▾
        </button>
      )}
      {open && shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {shown.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              onMouseDown={(e) => { e.preventDefault(); pick(name); }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
