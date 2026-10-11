// Reading the weekly performance CSV exports the way the old app's CSV library (CsvHelper) did:
// the first non-blank line is the header, blank lines are skipped, a byte-order mark is dropped,
// and a header is found by its exact text (some readers trim the header text first).
//
// Pure: the caller hands over the file's name and text. Nothing here touches the disk.

import Papa from 'papaparse';
import { parseNetNumber } from '../models';

export { parseNetNumber };

/** One export file: its name (no folder) and its text. */
export interface ImportFile {
  fileName: string;
  text: string;
}

/**
 * A problem that stops a whole file from being read. The message is in plain words and names
 * the file, a row number or a column header at most; never what a row holds.
 */
export class FileProblem extends Error {
  /** The same reason worded for an error that already names the row ("it is missing ..."). */
  readonly forRow: string;

  constructor(message: string, forRow: string = message) {
    super(message);
    this.name = 'FileProblem';
    this.forRow = forRow;
  }
}

/** One data row, with its row number as the old app counted it (the header is row 1). */
export interface CsvRow {
  rowNumber: number;
  cells: string[];
}

export interface CsvOptions {
  /** Trim spaces around header text before matching ("Delivery Associate " matches "Delivery Associate"). */
  trimHeaders: boolean;
}

function isBlankLine(row: string[]): boolean {
  return row.length === 1 && row[0] === '';
}

/** Drop a UTF-8 byte-order mark and turn Windows line ends into plain ones. */
export function cleanText(text: string): string {
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
}

/** A CSV file split into a header and rows, with header lookups that behave like CsvHelper's. */
export class CsvSheet {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
  private readonly trimHeaders: boolean;

  constructor(headers: string[], rows: CsvRow[], options: CsvOptions) {
    this.headers = headers;
    this.rows = rows;
    this.trimHeaders = options.trimHeaders;
  }

  private prepare(name: string): string {
    return this.trimHeaders ? name.trim() : name;
  }

  /** Position of the first header with this exact text (after trimming, if the reader trims), or -1. */
  indexOf(name: string): number {
    const wanted = this.prepare(name);
    return this.headers.findIndex((header) => this.prepare(header) === wanted);
  }

  has(name: string): boolean {
    return this.indexOf(name) >= 0;
  }

  /** The cell under this header, or null when there is no such header or the row ran short. */
  field(row: CsvRow, name: string): string | null {
    const index = this.indexOf(name);
    if (index < 0 || index >= row.cells.length) return null;
    return row.cells[index] as string;
  }

  /** The cell under this header. A missing header or a short row stops the file, as it did in the old app. */
  get(row: CsvRow, name: string): string {
    const index = this.indexOf(name);
    if (index < 0) throw new FileProblem(`there is no "${name.trim()}" column.`);
    if (index >= row.cells.length) {
      throw new FileProblem(
        `row ${row.rowNumber} is missing the "${name.trim()}" column.`,
        `it is missing the "${name.trim()}" column.`,
      );
    }
    return row.cells[index] as string;
  }

  /**
   * The first of these names that some header matches, ignoring case and spaces around it, or
   * null. Returns the name as written here (not as the file wrote it), like the old readers did.
   */
  findAlias(...aliases: string[]): string | null {
    for (const alias of aliases) {
      const wanted = alias.toLowerCase();
      if (this.headers.some((header) => header.trim().toLowerCase() === wanted)) return alias;
    }
    return null;
  }
}

/** Split a CSV file into its header and rows. A file with no header row is a FileProblem. */
export function readCsv(text: string, options: CsvOptions): CsvSheet {
  const parsed = Papa.parse<string[]>(cleanText(text), { delimiter: ',', skipEmptyLines: false });
  let headers: string[] | null = null;
  const rows: CsvRow[] = [];
  for (const row of parsed.data) {
    if (isBlankLine(row)) continue;
    if (headers === null) {
      headers = row;
      continue;
    }
    rows.push({ rowNumber: rows.length + 2, cells: row });
  }
  if (headers === null) throw new FileProblem('the file is empty (it has no header row).');
  return new CsvSheet(headers, rows, options);
}

// ---- numbers, read the way .NET read them --------------------------------------------------

/** A decimal number, blank -> null. `stripPercent` drops "%" signs first (the scorecard reader did). */
export function parseNullableDouble(
  raw: string | null | undefined,
  stripPercent = false,
): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  return parseNetNumber(stripPercent ? raw.replace(/%/g, '') : raw);
}

/** A whole number (32-bit, as .NET's int), blank or not a whole number -> null. */
export function parseNullableInt(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const value = parseNetNumber(raw);
  if (value === null || !Number.isInteger(value)) return null;
  if (value < -2147483648 || value > 2147483647) return null;
  return value === 0 ? 0 : value;
}

/**
 * A 0/1 event flag (or a count). Anything that is not a plain whole number above zero counts
 * as 0, so one odd cell cannot spoil a row.
 */
export function parseFlag(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const text = raw.trim();
  if (!/^[+-]?\d+$/.test(text)) return 0;
  const value = Number(text);
  return value > 0 && value <= 2147483647 ? value : 0;
}

/** Text from a cell, trimmed; null stays null. */
export function trimmed(value: string | null): string | null {
  return value === null ? null : value.trim();
}

/**
 * The error text for a file that could not be read. Only a FileProblem is a result; anything
 * else is a bug in this code and is thrown on.
 */
export function fileError(fileName: string, error: unknown): string {
  if (error instanceof FileProblem) return `${fileName}: ${error.message}`;
  throw error;
}

/** Turn one file or a list of files into a list. */
export function asList(files: ImportFile | readonly ImportFile[]): readonly ImportFile[] {
  return Array.isArray(files) ? files : [files as ImportFile];
}

/** Add a week to a list once, keeping the order weeks were first seen. */
export function addWeek(weeks: string[], week: string): void {
  if (!weeks.includes(week)) weeks.push(week);
}

/** Read the week from a file name, or stop the file with a plain-words reason. */
export function requireWeek(week: string | null, hyphenOptional: boolean): string {
  if (week !== null) return week;
  const example = hyphenOptional ? '"2026-W07" or "2026W07"' : '"2026-W07"';
  throw new FileProblem(`the file name has no week in it (like ${example}).`);
}
