// Reads the rows of the "DA POD Details" report, ported from the old app's
// PodImporter.cs (legacy/wpa/src/PodImporter.cs).
//
// This file is pure: it never opens a PDF itself. The words on each page come in already
// extracted (see pdfWords.node.ts for the Node helper that does that with pdfjs), so the
// row-finding logic can be tested with hand-built word lists.
//
// The old importer, step for step:
//   1. Take the week from the file name ("...Week14-2026..." -> "2026-W14"). No week = the
//      whole file is refused.
//   2. On each page, group the words into visual rows by their rounded y position
//      (round(y / 2), so words less than about 2 units apart share a row), top of the page
//      first, and order each row left to right.
//   3. In each row, find the first word shaped like a Transporter ID. The 13 words after it
//      must all be whole numbers: they are the counts. Every word before it is the name.
//   4. Rows without an ID, or with fewer than 13 whole numbers after it, are skipped.

import type { PodWeekEntry } from '../models';

/**
 * The words on the pages of one PDF.
 *
 * Coordinates follow PdfPig (the library the old app used): PDF user space, origin at the
 * bottom-left corner of the page, y growing upward, units of 1/72 inch.
 *
 * - `x` is the left edge of the word (PdfPig's `BoundingBox.Left`).
 * - `y` is the bottom of the word (PdfPig's `BoundingBox.Bottom`). The pdfjs helper uses
 *   the text baseline for this, which is what PdfPig reports for the report's rows.
 *
 * A "word" is a run of characters with no whitespace in it, like PdfPig's `GetWords()`.
 */
export interface PdfWords {
  fileName: string;
  pages: PdfWordsPage[];
}

export interface PdfWordsPage {
  /** 1-based page number. */
  page: number;
  words: PdfWord[];
}

export interface PdfWord {
  text: string;
  x: number;
  y: number;
}

// One row of the old `PodWeekEntries` table: the shared model type (re-exported under the same
// name so code that took it from here keeps working).
export type { PodWeekEntry };

/** What reading one file gives. */
export interface PodFileResult {
  fileName: string;
  /** `YYYY-Www`, or null when the file name has no week in it. */
  week: string | null;
  /**
   * The rows the old app would keep for this file. Empty when the file was refused (no
   * week, unreadable, or the same Transporter ID twice in one week).
   */
  rows: PodWeekEntry[];
  /**
   * The old app's row counter for this file. It counted each row as it was written, so a
   * file that failed part way still added the rows written before the failure.
   */
  rowsImported: number;
  /** True when the old app would count the file as processed. */
  ok: boolean;
  /** Plain words. They name the file, never a row's content. */
  errors: string[];
}

/** What reading many files gives, like the old `PodImportResult` plus the rows. */
export interface PodImportResult {
  filesProcessed: number;
  rowsImported: number;
  errors: string[];
  /** Weeks in the order they were first seen. */
  weeksImported: string[];
  /** Rows that end up in the table: a later file for the same week replaces an earlier one. */
  rows: PodWeekEntry[];
  /**
   * Weeks to empty before writing `rows`: the week of every file that read fine, even one that
   * listed nobody (the old app emptied such a week too). Oldest first.
   */
  replaceWeeks: string[];
}

/** A file whose PDF could not be opened, so it has no words. */
export interface UnreadablePdf {
  fileName: string;
  unreadable: true;
}

// Matches both 13- and 14-character Transporter IDs.
const TRANSPORTER_ID = /^A[0-9A-Z]{12,13}$/;

// Pulls "Week14" and "2026" from a name like "US-XXXX-XXX1-Week14-2026NA-DA-POD-Details.pdf".
const FILE_WEEK = /Week(\d{1,2})-(\d{4})/i;

const COUNT_COLUMNS = 13;

/** The week in a POD file name as `YYYY-Www`, or null. Same rule as the old app. */
function weekFromPodFileName(fileName: string): string | null {
  const m = FILE_WEEK.exec(fileName);
  if (!m) return null;
  const weekNum = Number.parseInt(m[1] ?? '', 10);
  const year = m[2] ?? '';
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/** C#'s Math.Round: halves go to the even neighbour (2.5 -> 2, 3.5 -> 4). */
function roundHalfToEven(v: number): number {
  const floor = Math.floor(v);
  const diff = v - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** C#'s int.TryParse with its default rules: optional sign, ASCII digits, fits in 32 bits. */
function tryParseInt(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?[0-9]+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  if (n > 2147483647 || n < -2147483648) return null;
  return n;
}

/** The table rows found on one page, top of the page first. */
export function parsePodPage(page: PdfWordsPage, week: string, sourceFile: string): PodWeekEntry[] {
  const out: PodWeekEntry[] = [];
  if (page.words.length === 0) return out;

  // Group by rounded y (in order of first appearance, like LINQ GroupBy), then order the
  // groups top to bottom and each group left to right. Both sorts are stable, as in LINQ.
  const groups = new Map<number, PdfWord[]>();
  for (const w of page.words) {
    const key = Math.trunc(roundHalfToEven(w.y / 2));
    const g = groups.get(key);
    if (g) g.push(w);
    else groups.set(key, [w]);
  }
  const rows = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, g]) => [...g].sort((a, b) => a.x - b.x));

  for (const row of rows) {
    const tokens = row.map((w) => w.text);

    const idIndex = tokens.findIndex((t) => TRANSPORTER_ID.test(t));
    if (idIndex < 0) continue;

    if (tokens.length < idIndex + 1 + COUNT_COLUMNS) continue;

    const nums = tokens.slice(idIndex + 1, idIndex + 1 + COUNT_COLUMNS).map(tryParseInt);
    if (nums.some((n) => n === null)) continue;
    const n = nums as number[];

    const name = tokens.slice(0, idIndex).join(' ').trim();

    out.push({
      transporterId: tokens[idIndex] ?? '',
      week,
      name,
      opportunities: n[0] ?? 0,
      success: n[1] ?? 0,
      bypass: n[2] ?? 0,
      rejects: n[3] ?? 0,
      blurryPhoto: n[4] ?? 0,
      humanInThePicture: n[5] ?? 0,
      noPackageDetected: n[6] ?? 0,
      packageInCar: n[7] ?? 0,
      packageInHand: n[8] ?? 0,
      packageNotClearlyVisible: n[9] ?? 0,
      packageTooClose: n[10] ?? 0,
      photoTooDark: n[11] ?? 0,
      other: n[12] ?? 0,
      sourceFile,
    });
  }
  return out;
}

function noWeekError(fileName: string): string {
  return `${fileName}: the file name has no week in it. It should have something like "Week20-2026" in it.`;
}

/** Reads one POD file's words into table rows. */
export function parsePodFile(input: PdfWords | UnreadablePdf): PodFileResult {
  const { fileName } = input;
  const week = weekFromPodFileName(fileName);
  if (week === null) {
    return {
      fileName,
      week,
      rows: [],
      rowsImported: 0,
      ok: false,
      errors: [noWeekError(fileName)],
    };
  }
  if ('unreadable' in input) {
    return {
      fileName,
      week,
      rows: [],
      rowsImported: 0,
      ok: false,
      errors: [`${fileName}: this PDF could not be opened. It may be damaged or not a PDF.`],
    };
  }

  const rows: PodWeekEntry[] = [];
  const seen = new Set<string>();
  for (const page of input.pages) {
    for (const entry of parsePodPage(page, week, fileName)) {
      // The old table allows one row per driver per week. A second row for the same
      // driver made the database refuse it, and the whole file was rolled back (the
      // rows written before it were still counted).
      if (seen.has(entry.transporterId)) {
        return {
          fileName,
          week,
          rows: [],
          rowsImported: rows.length,
          ok: false,
          errors: [
            `${fileName}: page ${page.page} lists the same driver twice for one week, so nothing from this file was saved.`,
          ],
        };
      }
      seen.add(entry.transporterId);
      rows.push(entry);
    }
  }
  return { fileName, week, rows, rowsImported: rows.length, ok: true, errors: [] };
}

/**
 * Reads many POD files, like the old `PodImporter.ImportFiles`. Files are handled in the
 * order given. Each file replaces the rows already read for its week.
 */
export function parsePodFiles(inputs: readonly (PdfWords | UnreadablePdf)[]): PodImportResult {
  const result: PodImportResult = {
    filesProcessed: 0,
    rowsImported: 0,
    errors: [],
    weeksImported: [],
    rows: [],
    replaceWeeks: [],
  };
  const byWeek = new Map<string, PodWeekEntry[]>();

  for (const input of inputs) {
    const file = parsePodFile(input);
    if (file.week !== null && !result.weeksImported.includes(file.week)) {
      result.weeksImported.push(file.week);
    }
    result.rowsImported += file.rowsImported;
    result.errors.push(...file.errors);
    if (file.ok && file.week !== null) {
      byWeek.set(file.week, file.rows);
      result.filesProcessed++;
    }
  }

  for (const rows of byWeek.values()) result.rows.push(...rows);
  result.replaceWeeks = [...byWeek.keys()].sort();
  return result;
}
