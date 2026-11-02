import type { AppData } from './types.ts';
import { combinedSheet, professorSheet, universitySheet, type SheetRows } from './exportRows.ts';
import { todayStr } from './utils.ts';

/** Makes the .xlsx file. The Excel library is loaded only now, so the app opens faster. */
export async function buildXlsx(sheets: SheetRows[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');

  return writeExcelFile(
    sheets.map((s) => ({
      sheet: s.name,
      stickyRowsCount: 1, // keep the header row visible when scrolling
      columns: s.rows[0].map((_, c) => ({
        // wide enough for the longest text in the column, but not huge
        width: Math.min(50, Math.max(10, ...s.rows.slice(0, 200).map((r) => (r[c] || '').split('\n')[0].length + 2))),
      })),
      data: s.rows.map((row, i) =>
        row.map((value) => (i === 0 ? { value, fontWeight: 'bold' as const } : value === '' ? null : value))
      ),
    }))
  ).toBlob();
}

async function saveXlsx(filename: string, sheets: SheetRows[]) {
  const blob = await buildXlsx(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportProfessors = (data: AppData) =>
  saveXlsx(`professors-${todayStr()}.xlsx`, [professorSheet(data)]);

export const exportUniversities = (data: AppData) =>
  saveXlsx(`universities-${todayStr()}.xlsx`, [universitySheet(data)]);

/** One workbook with three sheets: Combined, Professors and Universities. */
export const exportEverything = (data: AppData) =>
  saveXlsx(`prof-mail-tracker-${todayStr()}.xlsx`, [combinedSheet(data), professorSheet(data), universitySheet(data)]);
