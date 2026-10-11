// The per-driver PDF report: one HTML document (the same HTML the page previews), printed to
// PDF by Chromium in a hidden window.
//
//   buildReportHtml(input)        every page of the old report, as standalone HTML
//   sampleReportHtml(colours)     page 1 of a made-up report, for the live colour preview
//   printHtmlToPdf(html, file)    one PDF; printHtmlBatch(items) many, in one window
//   reportFileName(...)           the old app's file name

export { buildReportHtml, PAGE_NAMES, type BuildOptions, type ReportInput } from './html';
export { sampleReportData, sampleReportHtml } from './sample';
export {
  PDF_OPTIONS,
  printHtmlBatch,
  printHtmlToPdf,
  ReportPrintError,
  type PrintFailure,
  type PrintItem,
  type PrintResult,
} from './print';
export { reportFileName } from './fileName';
