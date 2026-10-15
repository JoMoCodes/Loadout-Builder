// The weekly performance file readers. Each is pure: it takes the file name and text (the app's
// main process reads the file) and returns the rows the old app would have written, the counts
// it reported, and plain-words errors that name a file and a row number, never a row's contents.
//
// The POD PDF reader works on words already taken out of the PDF (./pod.ts). Taking them out
// needs pdfjs and Node, so that step is in ./pdfWords.node.ts, which only Node code imports.

export {
  cleanText,
  CsvSheet,
  FileProblem,
  parseFlag,
  parseNetNumber,
  parseNullableDouble,
  parseNullableInt,
  readCsv,
} from './csv';
export type { CsvOptions, CsvRow, ImportFile } from './csv';
export type { WeekFileResult } from './weekFiles';
export { parseThresholds } from './thresholds';
export type { ThresholdImportResult, ThresholdRow } from './thresholds';
export { parseScorecards } from './scorecards';
export type {
  ScorecardDriver,
  ScorecardImportResult,
  ScorecardMetric,
  ScorecardRow,
} from './scorecards';
export { parseCdf } from './cdf';
export type { CdfImportResult } from './cdf';
export { DSB_IMPACTS_COLUMNS, parseDsb } from './dsb';
export type { DsbImportResult } from './dsb';
export { parsePsb } from './psb';
export type { PsbImportResult } from './psb';
export { DCR_COLUMN_ALIASES, parseDcr } from './dcr';
export type { DcrEventRow, DcrImportResult } from './dcr';
export { parseDcrTotals } from './dcrTotals';
export type { DcrTotalsImportResult } from './dcrTotals';
export { parseSafety } from './safety';
export type { SafetyEventRow, SafetyImportResult } from './safety';
export { parsePodFile, parsePodFiles, parsePodPage } from './pod';
export type {
  PdfWord,
  PdfWords,
  PdfWordsPage,
  PodFileResult,
  PodImportResult,
  PodWeekEntry,
  UnreadablePdf,
} from './pod';
