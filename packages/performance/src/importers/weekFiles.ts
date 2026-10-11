// The shared shape of the readers whose week comes from the file name (CDF, DSB, PSB, DCR, DCR
// totals, Safety): read each file on its own, and if it reads cleanly, its rows replace whatever
// was stored for that week. A file that fails is not written at all.

import { weekFromFileName } from '../models';
import {
  addWeek,
  asList,
  fileError,
  readCsv,
  requireWeek,
  type CsvSheet,
  type ImportFile,
} from './csv';

/** What every week-file reader returns, besides its own counts. */
export interface WeekFileResult<Row> {
  /** Files read without a problem. */
  filesProcessed: number;
  /** Rows written, counting every file that read cleanly. */
  rowsImported: number;
  /**
   * The weeks the old importer listed in its summary, sorted. (Some old readers listed a file's
   * week even when that file then failed; this keeps that, so the numbers match.)
   */
  weeks: string[];
  /**
   * The weeks to replace, sorted: storage deletes every stored row for each of these weeks, then
   * writes `rows`. Only weeks whose file read cleanly are here, so a week with an empty file is
   * emptied.
   */
  replaceWeeks: string[];
  errors: string[];
  /** The rows to write, in file order. If two files had the same week, only the later one's rows are here. */
  rows: Row[];
}

export interface WeekFileOptions {
  /** Accept "2026W07" as well as "2026-W07" in the file name. */
  hyphenOptional: boolean;
  /** List the week as soon as the name is read (true), or only once the file read cleanly (false). */
  listWeekBeforeReading: boolean;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Run `readFile` over each file with the week from its name. `readFile` may throw a FileProblem
 * to stop that file. `onWritten` is called with each clean file's rows, for the reader's counts.
 */
export function readWeekFiles<Row extends { week: string }>(
  files: ImportFile | readonly ImportFile[],
  options: WeekFileOptions,
  readFile: (sheet: CsvSheet, fileName: string, week: string) => Row[],
  onWritten: (rows: readonly Row[], week: string, fileName: string) => void = () => {},
): WeekFileResult<Row> {
  const weeks: string[] = [];
  const replaceWeeks: string[] = [];
  const errors: string[] = [];
  let rows: Row[] = [];
  let filesProcessed = 0;
  let rowsImported = 0;

  for (const file of asList(files)) {
    let week: string;
    let fileRows: Row[];
    try {
      week = requireWeek(
        weekFromFileName(file.fileName, options.hyphenOptional),
        options.hyphenOptional,
      );
      if (options.listWeekBeforeReading) addWeek(weeks, week);
      const sheet = readCsv(file.text, { trimHeaders: true });
      fileRows = readFile(sheet, file.fileName, week);
    } catch (error) {
      errors.push(fileError(file.fileName, error));
      continue;
    }

    rows = rows.filter((row) => row.week !== week).concat(fileRows);
    addWeek(replaceWeeks, week);
    if (!options.listWeekBeforeReading) addWeek(weeks, week);
    rowsImported += fileRows.length;
    onWritten(fileRows, week, file.fileName);
    filesProcessed++;
  }

  return {
    filesProcessed,
    rowsImported,
    weeks: weeks.sort(byText),
    replaceWeeks: replaceWeeks.sort(byText),
    errors,
    rows,
  };
}
