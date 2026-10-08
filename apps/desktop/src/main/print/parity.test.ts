// The printed sheets against the old app's, on the three made-up fixture days.
//
// scripts/parity/print/python_print.py ran the old app's own writers (fpdf2 and openpyxl) on each
// day, and scripts/parity/print/extract.ts read what they wrote back into text
// (scripts/parity/print/expected/). Here this app's writers are given the same rows and layouts,
// their files are read back the same way, and the two are compared: page count, paper, every piece
// of text in drawing and reading order with its font, size, colour and place (to 0.02 pt), every
// box, and every workbook cell's value and look, column widths, frozen rows and page setup.

import { describe, expect, it } from 'vitest';
import { inkPdf, inkWorkbook } from './inspect';
import {
  diffPdf,
  diffWorkbook,
  encodePdf,
  encodeWorkbook,
  readingOrder,
  type PdfRecord,
} from './parity';
import { DAYS, caseNames, dayCases, reference, writeCase } from './referenceCases';

const TOLERANCE_PT = 0.02;

describe.each(DAYS)('the printed sheets on %s', (day) => {
  const cases = caseNames(day).filter((c) => !c.skip);

  it('has every case the old app drew', () => {
    const names = cases.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['export-plain', 'export-dwp', 'default', 'vans']),
    );
    expect(names.length).toBeGreaterThanOrEqual(14);
  });

  it.each(cases)('$name: the PDF matches the old one', async ({ name, file }) => {
    const expected = reference(day, file).pdf;
    const written = await writeCase(day, name, 'pdf');
    const actual = encodePdf(await inkPdf(written.bytes));
    const diff = diffPdf(expected, actual, TOLERANCE_PT);
    expect(diff.problems).toEqual([]);
    expect(diff.texts).toBeGreaterThan(0);
    expect(diff.boxes).toBeGreaterThan(0);
    expect(readingOrder(actual)).toEqual(readingOrder(expected));
    // The page count the writer reports is the pages it drew, as the old app's was.
    const entry = dayCases(day).print[name];
    if (entry?.pages !== undefined) {
      expect(written.pages).toBe(entry.pages);
      expect(actual.pages).toHaveLength(entry.pages);
    }
    if (entry?.drivers !== undefined) expect(written.drivers).toBe(entry.drivers);
  });

  it.each(cases)('$name: the workbook matches the old one', async ({ name, file }) => {
    const expected = reference(day, file).xlsx;
    const written = await writeCase(day, name, 'xlsx');
    const actual = encodeWorkbook(await inkWorkbook(written.bytes));
    expect(diffWorkbook(expected, actual)).toEqual([]);
  });
});

describe('the comparison itself', () => {
  const sample = (): PdfRecord => ({
    pages: [
      {
        size: [612, 792],
        texts: [[10, 20, 'Driver', 'Helvetica-Bold', 10, '20,25,35']],
        boxes: [[5, 5, 100, 22, 'B', '120,126,138', '232,234,237', 0.57]],
      },
    ],
  });

  it('notices a word moved, changed, or in another font', () => {
    const moved = sample();
    (moved.pages[0]!.texts[0] as unknown[])[0] = 10.5;
    expect(diffPdf(sample(), moved).problems).toHaveLength(1);
    const changed = sample();
    (changed.pages[0]!.texts[0] as unknown[])[2] = 'Drive';
    (changed.pages[0]!.texts[0] as unknown[])[3] = 'Helvetica';
    expect(diffPdf(sample(), changed).problems).toHaveLength(2);
  });

  it('notices a missing page or box, and lets a hundredth of a point go', () => {
    expect(diffPdf(sample(), { pages: [] }).problems).toContain('pages: expected 1, got 0');
    const nudged = sample();
    (nudged.pages[0]!.boxes[0] as unknown[])[0] = 5.01;
    expect(diffPdf(sample(), nudged).problems).toEqual([]);
    const unboxed = sample();
    unboxed.pages[0]!.boxes = [];
    expect(diffPdf(sample(), unboxed).problems).toContain('page 1 box count: expected 1, got 0');
  });

  it('notices a cell that is text instead of a number, or looks different', () => {
    const sheet = {
      name: 'Load Out',
      widths: [12.2],
      styles: ['plain', 'bold'],
      cells: [['A1', 551894, 0] as [string, number, number]],
      frozen: '',
      printTitlesRow: '1:1',
      pageSetup: 'portrait',
    };
    expect(diffWorkbook([sheet], [{ ...sheet, cells: [['A1', '551894', 0]] }])).toHaveLength(1);
    expect(diffWorkbook([sheet], [{ ...sheet, cells: [['A1', 551894, 1]] }])).toHaveLength(1);
    expect(diffWorkbook([sheet], [sheet])).toEqual([]);
  });
});
