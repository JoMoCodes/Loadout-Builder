// Node only: turns a route sheet PDF into positioned text items, page by page, and reads the
// sheets from them. The rules themselves are pure and live in page.ts and stack.ts, so the
// main entry of this package stays free of Node and pdfjs.
//
// Each item keeps what the reader needs: the text, where it starts (x from the left edge, y from
// the TOP of the page), how wide it is and how big the letters are.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedRouteSheetPdf, PdfItemsPage, PdfTextItem } from '../types';
import { sheetsFromPages } from './stack';

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is TextItemLike {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as { str?: unknown }).str === 'string' &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

/** Reads a PDF and returns the positioned text on each page, first page first. */
export async function readPdfItems(data: Uint8Array): Promise<PdfItemsPage[]> {
  // pdfjs takes ownership of the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: new Uint8Array(data),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const pages: PdfItemsPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const i of content.items) {
        if (!isTextItem(i) || i.str.trim().length === 0) continue;
        items.push({
          str: i.str,
          x: i.transform[4] ?? 0,
          y: viewport.height - (i.transform[5] ?? 0),
          width: i.width,
          size: Math.abs(i.transform[3] ?? 0) || i.height,
        });
      }
      pages.push({ pageNumber: p, items, width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Parses a route sheet PDF. Returns { sheets, pageErrors, pageCount }. */
export async function parseRouteSheetPdf(data: Uint8Array): Promise<ParsedRouteSheetPdf> {
  return sheetsFromPages(await readPdfItems(data));
}
