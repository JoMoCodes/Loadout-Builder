// Cuts single pages out of the day's route sheet PDF, byte-for-byte the same pages.

import { PDFDocument } from 'pdf-lib';

/** `pageNumbers` are 1-based, in the order they should appear. */
export async function extractPages(pdf: Uint8Array, pageNumbers: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdf, { updateMetadata: false });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    src,
    pageNumbers.map((n) => n - 1),
  );
  pages.forEach((p) => out.addPage(p));
  out.setTitle(src.getTitle() || 'Route sheet');
  return out.save();
}
