// Bringing weekly exports in from the computer: list a folder's files of one kind, read each
// file, run the reader for its kind, and write what it read through the PerformanceStore the way
// the old app's importers did (each file on its own; a file that cannot be read changes nothing).
//
// File names appear only in the plain-words problems handed back to the person ("row 12 of
// AssociateData.csv ..."). Nothing here logs; the caller logs counts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import {
  parseCdf,
  parseDcr,
  parseDcrTotals,
  parseDsb,
  parsePodFiles,
  parsePsb,
  parseSafety,
  parseScorecards,
  parseThresholds,
  type ImportFile,
  type PdfWords,
  type UnreadablePdf,
} from '@loadout/performance/importers';
import { readPdfWords } from '@loadout/performance/pdf-words';
import type { PerformanceStore } from '@loadout/storage';
import {
  PERF_KIND_WORDS,
  SINGLE_FILE_KINDS,
  kindOfFileName,
  type PerfImportSummary,
  type PerfKind,
} from '../../shared/performance';
import type { PerfHost } from './perfHost';

/** No weekly export comes near this; anything bigger is not one of them. */
export const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

/** The name each kind had in the old app's record of auto-imported files (kept, so it carries over). */
export const LEDGER_SOURCE: Record<PerfKind, string> = {
  thresholds: 'Thresholds',
  scorecards: 'Scorecard',
  pod: 'POD',
  cdf: 'CDF',
  dsb: 'DSB',
  psb: 'PSB',
  dcr: 'DCR',
  'dcr-totals': 'DCR Totals',
  safety: 'Safety',
};

/** One file on the computer, with what the record of imported files compares. */
export interface ExportFile {
  path: string;
  fileName: string;
  size: number;
  modifiedMs: number;
}

function ordinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Does this file name end the way this kind's files do? */
export function hasEnding(kind: PerfKind, fileName: string): boolean {
  return PERF_KIND_WORDS[kind].endings.includes(extname(fileName).toLowerCase());
}

/** A file's size and last-change time, or null when it is not a readable file. */
export function exportFile(path: string): ExportFile | null {
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat || !stat.isFile()) return null;
    return { path, fileName: basename(path), size: stat.size, modifiedMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

/** Is this a folder that is there now? */
export function isFolder(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
  } catch {
    return false;
  }
}

/** The files directly in a folder, by name (ordinal, as the old app ordered them). */
function filesIn(folder: string): ExportFile[] {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .sort(ordinal)
    .map((name) => exportFile(join(folder, name)))
    .filter((file): file is ExportFile => file !== null);
}

/**
 * The files of one kind in a folder. For a folder kind, every file with its ending (the folder
 * is that kind's own). For the thresholds, which often sit in Downloads with other files, only
 * files named the way that export is named, newest name last.
 */
export function kindFilesInFolder(kind: PerfKind, folder: string): ExportFile[] {
  const files = filesIn(folder).filter((file) => hasEnding(kind, file.fileName));
  return SINGLE_FILE_KINDS.includes(kind)
    ? files.filter((file) => PERF_KIND_WORDS[kind].namePattern.test(file.fileName))
    : files;
}

/** A dropped folder that may mix kinds: its files sorted by kind from their names. */
export function filesByKind(folder: string): Map<PerfKind, ExportFile[]> {
  const out = new Map<PerfKind, ExportFile[]>();
  for (const file of filesIn(folder)) {
    const kind = kindOfFileName(file.fileName);
    if (kind === null || !hasEnding(kind, file.fileName)) continue;
    const list = out.get(kind) ?? [];
    list.push(file);
    out.set(kind, list);
  }
  return out;
}

/** What importing some files did, with which files read cleanly (for the record of imports). */
export interface ImportOutcome {
  summary: PerfImportSummary;
  /** Files the reader took (row problems or not). A file it refused is not here, so it is tried again. */
  taken: ExportFile[];
}

function emptySummary(kind: PerfKind): PerfImportSummary {
  return { kind, filesRead: 0, rows: 0, driversAdded: 0, weeks: [], problems: [] };
}

function readText(file: ExportFile): ImportFile | string {
  if (file.size > MAX_EXPORT_BYTES) {
    return `${file.fileName} is too big to be one of the weekly exports, so it was skipped.`;
  }
  try {
    return { fileName: file.fileName, text: readFileSync(file.path, 'utf8') };
  } catch {
    return `${file.fileName} could not be opened. It may be open in another program.`;
  }
}

async function readPdf(file: ExportFile): Promise<PdfWords | UnreadablePdf | string> {
  if (file.size > MAX_EXPORT_BYTES) {
    return `${file.fileName} is too big to be one of the weekly exports, so it was skipped.`;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(file.path));
  } catch {
    return `${file.fileName} could not be opened. It may be open in another program.`;
  }
  try {
    return { fileName: file.fileName, pages: await readPdfWords(bytes) };
  } catch {
    return { fileName: file.fileName, unreadable: true };
  }
}

interface OneFile {
  filesRead: number;
  rows: number;
  driversAdded: number;
  weeks: string[];
  problems: string[];
}

/** Reads one file of one kind and writes it. */
async function importOne(
  store: PerformanceStore,
  kind: PerfKind,
  file: ExportFile,
): Promise<OneFile> {
  if (kind === 'pod') {
    const words = await readPdf(file);
    if (typeof words === 'string') {
      return { filesRead: 0, rows: 0, driversAdded: 0, weeks: [], problems: [words] };
    }
    const result = parsePodFiles([words]);
    store.applyPod(result, result.replaceWeeks);
    return {
      filesRead: result.filesProcessed,
      rows: result.rowsImported,
      driversAdded: 0,
      weeks: result.weeksImported,
      problems: result.errors,
    };
  }

  const text = readText(file);
  if (typeof text === 'string') {
    return { filesRead: 0, rows: 0, driversAdded: 0, weeks: [], problems: [text] };
  }
  switch (kind) {
    case 'thresholds': {
      const result = parseThresholds(text);
      const applied = store.applyThresholds(result);
      return {
        filesRead: applied.replaced ? 1 : 0,
        rows: result.rowsImported,
        driversAdded: 0,
        weeks: result.sourceWeek ? [result.sourceWeek] : [],
        problems: result.errors,
      };
    }
    case 'scorecards': {
      const result = parseScorecards(text, store.knownDriverIds());
      const applied = store.applyScorecards(result);
      return {
        filesRead: result.filesProcessed,
        rows: result.rowsImported,
        driversAdded: applied.driversAdded,
        weeks: result.weeks,
        problems: result.errors,
      };
    }
    case 'psb': {
      const result = parsePsb(text);
      store.applyPsb(result);
      return weekFile(result);
    }
    case 'cdf': {
      const result = parseCdf(text);
      store.applyCdf(result);
      return weekFile(result);
    }
    case 'dsb': {
      const result = parseDsb(text);
      store.applyDsb(result);
      return weekFile(result);
    }
    case 'dcr': {
      const result = parseDcr(text);
      store.applyDcr(result);
      return weekFile(result);
    }
    case 'dcr-totals': {
      const result = parseDcrTotals(text);
      store.applyDcrTotals(result);
      return weekFile(result);
    }
    case 'safety': {
      const result = parseSafety(text);
      store.applySafety(result);
      return weekFile(result);
    }
  }
}

function weekFile(result: {
  filesProcessed: number;
  rowsImported: number;
  weeks: string[];
  errors: string[];
}): OneFile {
  return {
    filesRead: result.filesProcessed,
    rows: result.rowsImported,
    driversAdded: 0,
    weeks: result.weeks,
    problems: result.errors,
  };
}

/**
 * Brings in files of one kind, one file at a time in the order given (a later file for the same
 * week replaces an earlier one, as in the old app), and notes each file taken in the record of
 * imported files, so Sync now does not read it again.
 */
export async function importExportFiles(
  host: PerfHost,
  kind: PerfKind,
  files: readonly ExportFile[],
): Promise<ImportOutcome> {
  const summary = emptySummary(kind);
  const taken: ExportFile[] = [];
  for (const file of files) {
    let one: OneFile;
    try {
      one = await importOne(host.store, kind, file);
    } catch {
      // Something the reader did not expect. Nothing from this file was saved (each write is
      // one transaction), and it is tried again next time.
      one = {
        filesRead: 0,
        rows: 0,
        driversAdded: 0,
        weeks: [],
        problems: [`${file.fileName} could not be read. Check that it is the right export.`],
      };
    } finally {
      host.invalidate();
    }
    if (one.driversAdded > 0) host.driversChanged();
    summary.filesRead += one.filesRead;
    summary.rows += one.rows;
    summary.driversAdded += one.driversAdded;
    for (const week of one.weeks) if (!summary.weeks.includes(week)) summary.weeks.push(week);
    summary.problems.push(...one.problems);
    if (one.filesRead > 0) {
      taken.push(file);
      host.store.ledgerRecord(LEDGER_SOURCE[kind], file.fileName, file.size, file.modifiedMs);
    }
  }
  summary.weeks.sort(ordinal);
  if (files.length === 0) {
    summary.problems.push(`There were no files for ${PERF_KIND_WORDS[kind].the} to bring in.`);
  }
  return { summary, taken };
}
