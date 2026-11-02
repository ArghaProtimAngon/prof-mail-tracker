import { useState } from 'react';
import { useData } from './data';
import { exportEverything, exportProfessors, exportUniversities } from './export';
import { useToast } from './toast';

const KINDS = { professors: exportProfessors, universities: exportUniversities, all: exportEverything };

/** Gives a button what it needs to export to Excel: a "busy" flag and a function to call on click. */
export function useExport() {
  const { data } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(kind: keyof typeof KINDS) {
    setBusy(true);
    try {
      await KINDS[kind](data);
      toast('Excel file downloaded.');
    } catch {
      toast('Could not make the Excel file. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
