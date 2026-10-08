// Writing a sheet to a file the person chose: `printing.write` and `export.write` from the old app.
// The format comes off the extension (.pdf, or .xlsx / .xlsm), and a problem is said in plain words.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { printing, sheetExport, type Roster } from '@loadout/core';
import { drawExportSheet, drawPrintSheet, planPrint } from '../../shared/print/sheet';
import { sheetToPdf } from './pdf';
import { exportWorkbook, printWorkbook, workbookBytes } from './xlsx';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;

export type SheetFormat = 'pdf' | 'xlsx';

/** The format a file name asks for, or null when it is neither. */
export function formatFor(file: string): SheetFormat | null {
  const suffix = path.extname(file).toLowerCase();
  if (suffix === '.pdf') return 'pdf';
  if (suffix === '.xlsx' || suffix === '.xlsm') return 'xlsx';
  return null;
}

function unknownFormat(file: string, Problem: new (message: string) => Error): Error {
  const suffix = path.extname(file).toLowerCase();
  return new Problem(
    `Don't know how to write a '${suffix || 'no extension'}' file.\n\nSave it as .pdf or .xlsx.`,
  );
}

/** Writes the bytes, turning the file system's errors into words for the person. */
async function save(
  file: string,
  bytes: Uint8Array,
  Problem: new (message: string) => Error,
): Promise<void> {
  try {
    await writeFile(file, bytes);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const name = path.basename(file);
    if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
      // Nearly always the last one still open in a viewer, or OneDrive holding it mid-sync.
      throw new Problem(
        `${name} is open in another program, or you don't have permission to write there.\n\n` +
          'Close it and try again, or save it somewhere else.',
      );
    }
    throw new Problem(`Couldn't write ${name}.\n\nTry saving it somewhere else.`);
  }
}

/** The bytes of a Print tab sheet. Throws `PrintError` when there is nothing to print. */
export async function printSheetBytes(
  format: SheetFormat,
  rows: readonly PrintRow[],
  spec: PrintSpec,
  dateLabel: string,
): Promise<{ bytes: Uint8Array; drivers: number; pages: number }> {
  if (spec.columns.length === 0) {
    throw new printing.PrintError(
      'There are no columns on this layout, so the page would come out blank.\n\n' +
        'Add at least one before printing.',
    );
  }
  const plan = planPrint(rows, spec, dateLabel);
  if (plan.printing.length === 0) {
    const reasons = ['by name', 'by shift type'];
    if (spec.vansOnly) reasons.push('for not holding a van');
    throw new printing.PrintError(
      'Nobody is left to print.\n\nEvery driver is being left off - ' +
        `${reasons.slice(0, -1).join(', ')} or ${reasons[reasons.length - 1]}. ` +
        "The 'Who prints' panel is where all of that is set.",
    );
  }
  const bytes =
    format === 'pdf'
      ? await sheetToPdf(drawPrintSheet(plan.printing, spec, plan.geo, plan.pages, plan.title))
      : await workbookBytes(printWorkbook(plan.printing, spec, plan.title));
  return { bytes, drivers: plan.printing.length, pages: plan.pages.length };
}

/**
 * `printing.write`: write a Print tab sheet to `file`. Returns (drivers printed, pages), pages being
 * what the PDF laid out (and what the workbook comes to if Excel is left to the same setup).
 */
export async function writePrintFile(
  file: string,
  rows: readonly PrintRow[],
  spec: PrintSpec,
  dateLabel: string,
): Promise<{ drivers: number; pages: number }> {
  const format = formatFor(file);
  if (format === null) throw unknownFormat(file, printing.PrintError);
  const { bytes, drivers, pages } = await printSheetBytes(format, rows, spec, dateLabel);
  await save(file, bytes, printing.PrintError);
  return { drivers, pages };
}

/** The bytes of one of the two fixed sheets. */
export async function exportSheetBytes(
  format: SheetFormat,
  roster: Pick<Roster, 'rows'>,
  withDwp: boolean,
): Promise<{ bytes: Uint8Array; drivers: number }> {
  return exportRowsBytes(format, sheetExport.rowsFor(roster, withDwp), withDwp);
}

/** The same, from the cells `rowsFor` gives. */
export async function exportRowsBytes(
  format: SheetFormat,
  rows: readonly string[][],
  withDwp: boolean,
): Promise<{ bytes: Uint8Array; drivers: number }> {
  const columns = sheetExport.layout(withDwp);
  const bytes =
    format === 'pdf'
      ? await sheetToPdf(drawExportSheet(rows, columns))
      : await workbookBytes(exportWorkbook(rows, columns));
  return { bytes, drivers: rows.length };
}

/** `export.write`: write the fixed sheet to `file`. Returns how many drivers went on it. */
export async function writeExportFile(
  file: string,
  roster: Pick<Roster, 'rows'>,
  withDwp: boolean,
): Promise<number> {
  const format = formatFor(file);
  if (format === null) throw unknownFormat(file, sheetExport.ExportError);
  const { bytes, drivers } = await exportSheetBytes(format, roster, withDwp);
  await save(file, bytes, sheetExport.ExportError);
  return drivers;
}
