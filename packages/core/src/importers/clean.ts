// Cell cleaning the importers share. Each of the old readers had its own small `_clean`;
// the ones that behave alike are one function here, the odd ones stay in their importer.

import { squeeze } from '../models/text';
import { pyStr, type CellValue } from './files';

/** Empty for nothing; otherwise the cell as text with runs of spaces squeezed to one. */
export function cleanSqueeze(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  return squeeze(pyStr(value));
}

/** Python's `text.isdigit()` for the plain digits these exports use. */
export function isDigits(text: string): boolean {
  return /^\d+$/.test(text);
}

/** Wrap an unexpected failure in the message the old app showed: the library's own words follow. */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
