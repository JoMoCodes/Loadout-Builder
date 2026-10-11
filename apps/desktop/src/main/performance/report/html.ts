// Puts the report's pages together into one standalone HTML document: inline styles and SVG
// only, no scripts, no outside files. Printed to PDF it gives the old report's pages, each
// starting on a new sheet with the driver's name, Transporter ID and weeks at the top.

import type { DriverReportData, ThresholdView } from '@loadout/performance';
import type { ReportColours } from '../../../shared/performanceSettings';
import { palette, type Palette } from './colours';
import { esc } from './format';
import { buildModel, type ReportModel } from './model';
import { dcrGuidePage, dcrPage } from './pages/dcr';
import { cdfPage, dsbPage, podPage, psbPage } from './pages/quality';
import { safetyPage, summaryPage } from './pages/summary';
import { REPORT_CSS } from './styles';

export interface ReportInput {
  data: DriverReportData;
  thresholds: ThresholdView[];
  colours: ReportColours;
  /** Weeks a PSB file was brought in, so "no file" and "no failures" can be told apart. */
  psbImportedWeeks: string[];
}

export interface BuildOptions {
  /** Only page 1 (the colour preview). */
  firstPageOnly?: boolean;
}

function pageHead(model: ReportModel, p: Palette): string {
  const first = model.weeks[0];
  const last = model.weeks[model.weeks.length - 1];
  const weeks =
    first !== undefined && last !== undefined
      ? `<div class="sub">Weeks: ${esc(first)}  to  ${esc(last)}</div>`
      : '';
  return (
    '<header class="page-head">' +
    `<h1>${esc(model.name)}</h1>` +
    `<div class="sub">Transporter ID: ${esc(model.transporterId)}</div>` +
    weeks +
    `<div class="rule" style="border-color:${esc(p.border)}"></div>` +
    '</header>'
  );
}

/** The report's pages in order; each is the body of one `<section class="page">`. */
export const PAGE_NAMES = [
  'summary',
  'safety',
  'cdf',
  'dsb',
  'pod',
  'psb',
  'dcr-guide',
  'dcr',
] as const;

export function buildReportHtml(input: ReportInput, options: BuildOptions = {}): string {
  const model = buildModel(input.data, input.thresholds, input.psbImportedWeeks);
  const p = palette(input.colours);
  const bodies: Record<(typeof PAGE_NAMES)[number], () => string> = {
    summary: () => summaryPage(model, p),
    safety: () => safetyPage(model, p),
    cdf: () => cdfPage(model, p),
    dsb: () => dsbPage(model, p),
    pod: () => podPage(model, p),
    psb: () => psbPage(model, p),
    'dcr-guide': () => dcrGuidePage(p),
    dcr: () => dcrPage(model, p),
  };
  const names = options.firstPageOnly ? PAGE_NAMES.slice(0, 1) : PAGE_NAMES;
  const head = pageHead(model, p);
  const sections = names
    // The header sits in a table head so Chromium repeats it on every sheet a page runs onto.
    .map(
      (name) =>
        `<section class="page" data-page="${name}"><table class="frame"><thead><tr><td>${head}</td></tr></thead>` +
        `<tbody><tr><td>${bodies[name]()}</td></tr></tbody></table></section>`,
    )
    .join('\n');
  const range =
    model.weeks.length > 0 ? ` ${model.weeks[0]} to ${model.weeks[model.weeks.length - 1]}` : '';
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    `<title>${esc(`${model.name}${range}`)}</title>` +
    `<style>${REPORT_CSS}</style></head><body>\n${sections}\n</body></html>`
  );
}
