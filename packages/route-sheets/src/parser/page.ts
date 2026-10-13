// Reading one route sheet page (or one long sheet's stacked pages) from positioned text, and
// checking that the numbers printed on it agree. Pure functions: no PDF library needed.

import type { PdfTextItem, RouteSheet, SheetCheck } from '../types';
import { findColumns, findHeading, groupLines, readRow } from './lines';
import type { TextLine } from './lines';

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const ROUTE_CODE_RE = /^[A-Z]{1,4}\d{1,6}$/;
// e.g. "XXX1 · THU, SEP 24, 2026 · CYCLE_1 · 09:50 AM"
const DATE_LINE_RE =
  /^(\S+)\s*·\s*([A-Za-z]{3}),\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})\s*·\s*(\S+)\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)$/i;
const BAGS_RE = /^(\d+)\s+bags?$/i;
// The "fl" ligature in "overflow" is often lost during extraction ("over\u0001ow", "overow").
const OVERFLOW_RE = /^(\d+)\s+over/i;

const group = (m: RegExpMatchArray, n: number): string => m[n] ?? '';

/**
 * Pure page parser, independent of pdf.js so it can be tested with plain objects.
 * `items` have y measured from the top of the page; `pageNumber` is 1-based.
 */
export function parsePageItems(
  items: PdfTextItem[],
  pageWidth: number,
  pageNumber: number,
): RouteSheet {
  const clean = items
    .map((i) => ({ ...i, str: String(i.str).replace(/\s+/g, ' ').trim() }))
    .filter((i) => i.str.length > 0);

  const sheet: RouteSheet = {
    pageNumber,
    pageNumbers: [pageNumber], // every PDF page this sheet spans (long routes spill onto a second page)
    routeCode: null,
    staging: null,
    dsp: null,
    serviceType: null,
    station: null,
    weekday: null,
    date: null, // ISO yyyy-mm-dd
    dateLabel: null, // exactly as printed, e.g. "THU, SEP 24, 2026"
    cycle: null,
    waveTime: null,
    bagCount: null,
    overflowCount: null,
    bags: [],
    overflow: [],
    totalPackages: null,
    commercialPackages: null,
    check: { ok: false, problems: [], notes: [], bagPackages: 0, overflowPackages: 0 },
  };

  // Header: the two largest text items are the staging location and route code.
  const big = clean.filter((i) => i.size >= 20).sort((a, b) => a.y - b.y);
  const codeItem = big.find((i) => ROUTE_CODE_RE.test(i.str));
  if (codeItem) sheet.routeCode = codeItem.str.toUpperCase();
  const stagingItem =
    big.find((i) => i !== codeItem && (!codeItem || i.y < codeItem.y)) ||
    big.find((i) => i !== codeItem);
  if (stagingItem) sheet.staging = stagingItem.str;

  const lines = groupLines(clean);
  const lineText = (l: TextLine): string => l.items.map((i) => i.str).join(' ');

  for (const l of lines) {
    for (const it of l.items) {
      const m = it.str.match(DATE_LINE_RE);
      if (m && !sheet.date) {
        sheet.station = group(m, 1);
        sheet.weekday = group(m, 2).toUpperCase();
        const mon = MONTHS[group(m, 3).toUpperCase()];
        if (mon) {
          sheet.date = `${group(m, 5)}-${String(mon).padStart(2, '0')}-${String(group(m, 4)).padStart(2, '0')}`;
        }
        sheet.dateLabel = `${group(m, 2)}, ${group(m, 3)} ${group(m, 4)}, ${group(m, 5)}`;
        sheet.cycle = group(m, 6);
        sheet.waveTime = group(m, 7).replace(/\s+/g, ' ').toUpperCase();
      }
    }
  }
  // Service line is the "·"-separated line printed just above the date line.
  // The line may be split into several runs ("XXXX ·", "Standard Parcel"), so read the whole line.
  const serviceItem = clean.find(
    (i) => i.str.includes('·') && !DATE_LINE_RE.test(i.str) && i.size < 20,
  );
  const serviceLine = serviceItem && lines.find((l) => l.items.includes(serviceItem));
  if (serviceItem) {
    const parts = (serviceLine ? lineText(serviceLine) : serviceItem.str)
      .split('·')
      .map((s) => s.trim());
    if (parts.length > 1) {
      sheet.dsp = parts[0] ?? null;
      sheet.serviceType = parts.slice(1).join(' · ');
    } else {
      sheet.serviceType = serviceItem.str;
    }
  }

  // The count and the word may be one text run ("24 bags") or split into two ("24", "bags"),
  // depending on how the sheet was generated, so headings are matched on whole visual lines.
  const bagsHeader = findHeading(lines, BAGS_RE);
  const overflowHeader = findHeading(lines, OVERFLOW_RE);
  if (bagsHeader) sheet.bagCount = bagsHeader.count;
  if (overflowHeader) sheet.overflowCount = overflowHeader.count;

  const splitX = overflowHeader ? overflowHeader.x - 10 : pageWidth / 2;
  const tableTop = Math.min(
    bagsHeader ? bagsHeader.y : Infinity,
    overflowHeader ? overflowHeader.y : Infinity,
  );

  const leftLines = groupLines(
    clean.filter((i) => i.x < splitX && i.y > (bagsHeader ? bagsHeader.y : tableTop)),
  );
  const rightLines = groupLines(
    clean.filter((i) => i.x >= splitX && i.y > (overflowHeader ? overflowHeader.y : tableTop)),
  );

  // Columns are located from the table headings so a blank cell (e.g. a missing Sort Zone)
  // stays blank instead of shifting the rest of the row left.
  const leftCols = findColumns(leftLines, ['Sort Zone', 'Bag', 'Pkgs']);
  for (const l of leftLines) {
    const row = readRow(l.items, leftCols, ['sortZone', 'bag', 'packages']);
    if (!row) continue;
    sheet.bags.push({
      index: row.index,
      sortZone: row.sortZone,
      bag: row.bag,
      packages: row.packages,
    });
  }

  const rightCols = findColumns(rightLines, ['Sort Zone', 'Pkgs']);
  for (const l of rightLines) {
    const text = lineText(l);
    const total = text.match(/^Total Packages\s+(\d+)$/i);
    const commercial = text.match(/^Commercial Packages\s+(\d+)$/i);
    if (total) {
      sheet.totalPackages = Number(total[1]);
      continue;
    }
    if (commercial) {
      sheet.commercialPackages = Number(commercial[1]);
      continue;
    }
    const row = readRow(l.items, rightCols, ['sortZone', 'packages']);
    if (!row) continue;
    sheet.overflow.push({ index: row.index, sortZone: row.sortZone, packages: row.packages });
  }
  // Totals can sit outside the right column on other layouts; fall back to a whole-page search.
  if (sheet.totalPackages === null || sheet.commercialPackages === null) {
    for (const l of lines) {
      const text = lineText(l);
      const total = text.match(/Total Packages\s+(\d+)/i);
      const commercial = text.match(/Commercial Packages\s+(\d+)/i);
      if (total && sheet.totalPackages === null) sheet.totalPackages = Number(total[1]);
      if (commercial && sheet.commercialPackages === null) {
        sheet.commercialPackages = Number(commercial[1]);
      }
    }
  }

  sheet.check = verifySheet(sheet);
  return sheet;
}

/** Cross-checks the numbers printed on the sheet against each other so nothing is silently dropped. */
export function verifySheet(s: RouteSheet): SheetCheck {
  const problems: string[] = [];
  if (!s.routeCode) problems.push('Route code not found on page');
  if (!s.staging) problems.push('Staging location not found on page');
  if (!s.date) problems.push('Station/date/cycle line not found on page');
  if (s.bagCount === null) problems.push('"bags" heading not found');
  else if (s.bags.length !== s.bagCount) {
    problems.push(`Heading says ${s.bagCount} bags but ${s.bags.length} bag rows were read`);
  }
  const seqOk = (rows: { index: number }[]): boolean => rows.every((r, i) => r.index === i + 1);
  if (!seqOk(s.bags)) problems.push('Bag rows are not numbered 1..N in order');
  if (!seqOk(s.overflow)) problems.push('Overflow rows are not numbered 1..N in order');
  const bagPkgs = s.bags.reduce((a, r) => a + r.packages, 0);
  const ovPkgs = s.overflow.reduce((a, r) => a + r.packages, 0);
  if (s.overflowCount === null) problems.push('"overflow" heading not found');
  else if (ovPkgs !== s.overflowCount) {
    problems.push(`Heading says ${s.overflowCount} overflow packages but rows add up to ${ovPkgs}`);
  }
  if (s.totalPackages === null) problems.push('Total Packages not found');
  else if (bagPkgs + ovPkgs !== s.totalPackages) {
    problems.push(
      `Bags (${bagPkgs}) + overflow (${ovPkgs}) = ${bagPkgs + ovPkgs}, but Total Packages says ${s.totalPackages}`,
    );
  }
  if (s.commercialPackages === null) problems.push('Commercial Packages not found');
  // Blank cells are printed that way on the original sheet; they are not read errors, but the
  // driver needs to know, so they are reported separately.
  const notes: string[] = [];
  for (const b of s.bags) {
    if (!b.sortZone) {
      notes.push(
        `Bag #${b.index} (${b.bag || 'no bag label'}) has no Sort Zone printed on the sheet`,
      );
    }
    if (!b.bag) {
      notes.push(
        `Bag #${b.index} (${b.sortZone || 'no sort zone'}) has no Bag label printed on the sheet`,
      );
    }
  }
  for (const o of s.overflow) {
    if (!o.sortZone) notes.push(`Overflow #${o.index} has no Sort Zone printed on the sheet`);
  }
  return {
    ok: problems.length === 0,
    problems,
    notes,
    bagPackages: bagPkgs,
    overflowPackages: ovPkgs,
  };
}

/** True when the page carries its own route code heading (i.e. starts a new sheet). */
export function hasRouteCode(items: PdfTextItem[]): boolean {
  return items.some((i) => i.size >= 20 && ROUTE_CODE_RE.test(String(i.str).trim()));
}
