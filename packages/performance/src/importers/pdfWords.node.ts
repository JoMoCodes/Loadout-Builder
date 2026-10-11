// Node only: turns a PDF into the words on each page, for the POD report reader in pod.ts.
// Used by the tests now and later by the desktop app's main process.
//
// pdfjs gives "text items", which can hold several words and spaces. The old app used
// PdfPig, which gives single words (split on whitespace). So each item is split on
// whitespace, and each word's left edge is estimated from where it sits in the item:
// the item's width is shared out evenly by character count.
//
// Coordinates come out the way pod.ts expects (PdfPig's convention): PDF user space,
// origin at the bottom-left of the page, y growing upward. pdfjs text items are already
// in that space: transform[4] is the item's x, transform[5] its baseline y.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfWord, PdfWordsPage } from './pod';

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
}

function isTextItem(item: unknown): item is TextItemLike {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as { str?: unknown }).str === 'string' &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

/** Splits one pdfjs text item into whitespace-free words with estimated positions. */
export function wordsFromTextItem(item: TextItemLike): PdfWord[] {
  const { str, transform, width } = item;
  const x0 = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const len = str.length;
  const out: PdfWord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const x = len > 0 ? x0 + (width * m.index) / len : x0;
    out.push({ text: m[0], x, y });
  }
  return out;
}

/** Reads a PDF and returns the words on each page, first page first. */
export async function readPdfWords(data: Uint8Array): Promise<PdfWordsPage[]> {
  // pdfjs takes ownership of the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: new Uint8Array(data),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const pages: PdfWordsPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const item of content.items) {
        if (isTextItem(item)) words.push(...wordsFromTextItem(item));
      }
      pages.push({ page: p, words });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
