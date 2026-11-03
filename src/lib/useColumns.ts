import { isColumnOn, personColumnId, setColumn, type ColumnDef } from './columns';
import { useData } from './data';

/**
 * The columns I chose for a list. `key` is "columns_universities" or "columns_professors".
 * Changes show at once and are saved for me on the server.
 */
export function useColumns(key: string, defs: ColumnDef[]) {
  const { data, setPreference } = useData();
  const choices = data.preferences[key];

  const defaultOn = (id: string) => (id.startsWith('person:') ? true : defs.find((d) => d.id === id)?.default ?? false);

  return {
    /** Is this column shown for me? (Use `person(userId)` for a person's column.) */
    isOn: (id: string) => isColumnOn(choices, id, defaultOn(id)),
    personOn: (userId: string) => isColumnOn(choices, personColumnId(userId), true),
    set: (id: string, on: boolean) => setPreference(key, setColumn(choices, id, defaultOn(id), on)),
    setPerson: (userId: string, on: boolean) => setPreference(key, setColumn(choices, personColumnId(userId), true, on)),
    reset: () => setPreference(key, []),
    /** True when I changed something from the default view. */
    customised: (choices?.length ?? 0) > 0,
  };
}

export type Columns = ReturnType<typeof useColumns>;
