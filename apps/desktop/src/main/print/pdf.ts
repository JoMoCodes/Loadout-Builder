// Turns a drawn sheet (shared/print/sheet.ts) into PDF bytes with pdf-lib.
//
// The old app wrote its PDFs with fpdf2 in the built-in Helvetica, so this does the same: the
// standard Helvetica and Helvetica-Bold (nothing embedded, as fpdf2 did), numbers rounded to a
// hundredth of a point as fpdf2 writes them, lines 0.2 mm wide with square ends. Each box is drawn
// before the text on top of it, in the order the sheet lists them.

import {
  PDFDocument,
  StandardFonts,
  beginText,
  endText,
  fill,
  fillAndStroke,
  moveText,
  rectangle,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineWidth,
  setStrokingRgbColor,
  showText,
  stroke,
  LineCapStyle,
  type PDFFont,
  type PDFName,
  type PDFOperator,
} from 'pdf-lib';
import type { Rgb, SheetDoc } from '../../shared/print/sheet';

/** fpdf2 writes every number with two decimals. */
function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** fpdf2 writes colours as fractions of 255, to four places. */
function c4(value: number): number {
  return Math.round((value / 255) * 10000) / 10000;
}

function color(set: typeof setFillingRgbColor, rgb: Rgb): PDFOperator {
  return set(c4(rgb[0]), c4(rgb[1]), c4(rgb[2]));
}

// WinAnsi (what the standard fonts are written in) has no room for the C1 control characters. The
// text has already been through `printable`, so these are the only characters left that it cannot
// write; fpdf2 wrote them as raw bytes that print as nothing, so they are left out here.
function writable(text: string): string {
  return text.replace(/[\u0080-\u009f]/g, '');
}

export async function sheetToPdf(sheet: SheetDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setProducer('Loadout Builder');
  doc.setCreator('Loadout Builder');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of sheet.pages) {
    const pdfPage = doc.addPage([r2(sheet.width), r2(sheet.height)]);
    const fonts = new Map<PDFFont, PDFName>([
      [regular, pdfPage.node.newFontDictionary('F1', regular.ref)],
      [bold, pdfPage.node.newFontDictionary('F2', bold.ref)],
    ]);
    const top = sheet.height;
    const ops: PDFOperator[] = [
      setLineCap(LineCapStyle.Projecting),
      setLineWidth(r2(sheet.lineWidth)),
    ];
    for (const mark of page.marks) {
      if (mark.kind === 'rect') {
        if (mark.stroke) ops.push(color(setStrokingRgbColor, mark.stroke));
        if (mark.fill) ops.push(color(setFillingRgbColor, mark.fill));
        ops.push(rectangle(r2(mark.x), r2(top - mark.y), r2(mark.w), r2(-mark.h)));
        if (mark.stroke && mark.fill) ops.push(fillAndStroke());
        else if (mark.fill) ops.push(fill());
        else ops.push(stroke());
      } else {
        const font = mark.bold ? bold : regular;
        ops.push(
          beginText(),
          setFontAndSize(fonts.get(font) as PDFName, r2(mark.size)),
          color(setFillingRgbColor, mark.color),
          moveText(r2(mark.x), r2(top - mark.y)),
          showText(font.encodeText(writable(mark.text))),
          endText(),
        );
      }
    }
    pdfPage.pushOperators(...ops);
  }
  return doc.save({ useObjectStreams: false });
}
