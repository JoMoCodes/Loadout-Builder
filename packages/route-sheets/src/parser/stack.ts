// Turning the pages of a route sheet PDF (already read into positioned text) into sheets.
// A long route spills onto the next page(s); those pages are stacked under the first and read
// as one sheet. Blank pages and pages with no route code are skipped and reported.

import type { PageError, ParsedRouteSheetPdf, PdfItemsPage, RouteSheet } from '../types';
import { hasRouteCode, parsePageItems } from './page';

export function sheetsFromPages(pages: PdfItemsPage[]): ParsedRouteSheetPdf {
  const sheets: RouteSheet[] = [];
  const pageErrors: PageError[] = [];
  let i = 0;
  while (i < pages.length) {
    const pg = pages[i];
    if (!pg) break;
    if (!pg.items.length) {
      pageErrors.push({
        pageNumber: pg.pageNumber,
        message: `Page ${pg.pageNumber} is blank and was skipped.`,
      });
      i++;
      continue;
    }
    if (!hasRouteCode(pg.items)) {
      pageErrors.push({
        pageNumber: pg.pageNumber,
        message: `Page ${pg.pageNumber} does not look like a route sheet (no route code found).`,
      });
      i++;
      continue;
    }
    // A long route spills onto the next page(s), which carry the rest of its tables but no
    // route code of their own. Stack those pages under this one and read them as one sheet.
    const pageNumbers = [pg.pageNumber];
    const items = [...pg.items];
    let offset = pg.height;
    let j = i + 1;
    for (;;) {
      const next = pages[j];
      if (!next || !next.items.length || hasRouteCode(next.items)) break;
      for (const it of next.items) items.push({ ...it, y: it.y + offset });
      offset += next.height;
      pageNumbers.push(next.pageNumber);
      j++;
    }
    const sheet = parsePageItems(items, pg.width, pg.pageNumber);
    sheet.pageNumbers = pageNumbers;
    sheets.push(sheet);
    i = j;
  }
  return { sheets, pageErrors, pageCount: pages.length };
}
