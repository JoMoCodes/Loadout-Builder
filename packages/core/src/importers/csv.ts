// Reading the two .csv exports (associates, tenure) the way Python's csv.DictReader does.

import Papa from 'papaparse';
import { readFileTolerant } from './files';

/** One data row: header text -> cell text (null where the row ran short). */
export type CsvRecord = Map<string, string | null>;

/** Python's `read_text(encoding="utf-8-sig")`, falling back to latin-1, with universal newlines. */
export async function readCsvText(path: string): Promise<string> {
  const bytes = await readFileTolerant(path);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = bytes.toString('latin1');
  }
  return text.replace(/\r\n?/g, '\n');
}

/** Does the text look like an .xlsx (a zip file) or some other binary, not a CSV? */
export function looksBinary(text: string): boolean {
  return text.startsWith('PK\x03\x04') || text.slice(0, 4096).includes('\x00');
}

export interface CsvTable {
  /** The header row, or null where the file has none (empty). */
  fieldnames: string[] | null;
  records: CsvRecord[];
}

// Python's csv gives an empty list for a blank line, which DictReader skips.
function isBlankLine(row: string[]): boolean {
  return row.length === 1 && row[0] === '';
}

export function parseCsv(text: string): CsvTable {
  const parsed = Papa.parse<string[]>(text, { delimiter: ',', skipEmptyLines: false });
  const rows = parsed.data;
  const first = rows[0];
  if (first === undefined || isBlankLine(first)) return { fieldnames: null, records: [] };
  const records: CsvRecord[] = [];
  for (const row of rows.slice(1)) {
    if (isBlankLine(row)) continue;
    const record: CsvRecord = new Map();
    first.forEach((name, index) => {
      record.set(name, index < row.length ? (row[index] as string) : null);
    });
    records.push(record);
  }
  return { fieldnames: first, records };
}

/**
 * The file's headers as an error message can carry them. Sanitised, because what
 * looked like headers may be anything at all - the first line of the wrong kind of file.
 */
export function shownHeaders(fieldnames: string[]): string {
  let shown = fieldnames.filter((name) => name).join(', ') || '(no header row)';
  shown = Array.from(shown)
    .map((char) => (char !== ' ' && /[\p{C}\p{Z}]/u.test(char) ? ' ' : char))
    .join('');
  const characters = Array.from(shown);
  return characters.length > 200 ? `${characters.slice(0, 200).join('')}...` : shown;
}
