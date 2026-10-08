// Reading files off disk for the importers: workbooks (.xlsx) as plain grids, and text.
// Pure Node - no Electron, no browser.

import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, normalize } from 'node:path';
import ExcelJS from 'exceljs';

/** A time of day with no date, the way a time-only spreadsheet cell reads. */
export class TimeOfDay {
  constructor(
    readonly hour: number,
    readonly minute: number,
    readonly second: number = 0,
  ) {}
}

/**
 * What a cell can hold once read. A `Date` is a date-and-time (its UTC fields are
 * the spreadsheet's own, with no time zone applied); a `TimeOfDay` is a time with no date.
 */
export type CellValue = string | number | boolean | Date | TimeOfDay | null;

export type Grid = CellValue[][];

export interface Sheet {
  name: string;
  grid: Grid;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** Python's repr() of a float that is not a whole number. */
function floatText(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (!Number.isFinite(value)) return value < 0 ? '-inf' : 'inf';
  const [mantissa = '', exponentText = '0'] = value.toExponential().split('e');
  const exponent = Number(exponentText);
  if (exponent >= -4 && exponent < 16) return String(value);
  const sign = exponent < 0 ? '-' : '+';
  return `${mantissa}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
}

/** Python's `str(value)` for what a cell can hold. */
export function pyStr(value: CellValue): string {
  if (value === null) return 'None';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? BigInt(value).toString() : floatText(value);
  }
  if (value instanceof TimeOfDay) {
    return `${two(value.hour)}:${two(value.minute)}:${two(value.second)}`;
  }
  const ms = value.getUTCMilliseconds();
  const date = `${String(value.getUTCFullYear()).padStart(4, '0')}-${two(value.getUTCMonth() + 1)}-${two(value.getUTCDate())}`;
  const time = `${two(value.getUTCHours())}:${two(value.getUTCMinutes())}:${two(value.getUTCSeconds())}`;
  return `${date} ${time}${ms ? `.${String(ms * 1000).padStart(6, '0')}` : ''}`;
}

/** The path as Python's `str(Path(text))` writes it: tidied, never made absolute. */
export function pathText(path: string): string {
  const tidy = normalize(path);
  return tidy.length > 1 ? tidy.replace(/[\\/]+$/, '') : tidy;
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function fileName(path: string): string {
  return basename(path);
}

const LOCKED_CODES = new Set(['EACCES', 'EPERM', 'EBUSY']);

/**
 * Read a file, tolerating one that Excel or OneDrive has locked by reading a
 * temporary copy instead.
 */
export async function readFileTolerant(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !LOCKED_CODES.has(code)) throw error;
  }
  const folder = await mkdtemp(join(tmpdir(), 'loadout-'));
  try {
    const copy = join(folder, basename(path));
    await copyFile(path, copy);
    return await readFile(copy);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const EXCEL_EPOCH_DAY = [1899, 11, 30] as const;

function fromExcelDate(value: Date): Date | TimeOfDay {
  // A time-only cell is a fraction of a day counted from 1899-12-30.
  if (
    value.getUTCFullYear() === EXCEL_EPOCH_DAY[0] &&
    value.getUTCMonth() === EXCEL_EPOCH_DAY[1] &&
    value.getUTCDate() === EXCEL_EPOCH_DAY[2]
  ) {
    return new TimeOfDay(value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds());
  }
  return value;
}

function cellValue(value: ExcelJS.CellValue | undefined): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return fromExcelDate(value);
  if (typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  // Formulas: the saved answer, like the old reader's data_only mode.
  if ('formula' in value || 'sharedFormula' in value) {
    return cellValue((value as { result?: ExcelJS.CellValue }).result);
  }
  if ('error' in value) return value.error;
  if ('hyperlink' in value) return cellValue(value.text as ExcelJS.CellValue);
  return null;
}

function sheetGrid(sheet: ExcelJS.Worksheet): Grid {
  const grid: Grid = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: CellValue[] = new Array<CellValue>(row.cellCount).fill(null);
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      // The covered cells of a merged block read as empty, like the old reader.
      cells[column - 1] = cell.type === ExcelJS.ValueType.Merge ? null : cellValue(cell.value);
    });
    grid.push(cells);
  }
  return grid;
}

/** Every worksheet of an .xlsx file, in workbook order, as rows of plain values. */
export async function readSheets(path: string): Promise<Sheet[]> {
  const buffer = await readFileTolerant(path);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets.map((sheet) => ({ name: sheet.name, grid: sheetGrid(sheet) }));
}
