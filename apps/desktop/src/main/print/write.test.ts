// Writing a sheet to a file: the format off the extension, and problems in plain words.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { printing, sheetExport } from '@loadout/core';
import { Canvas, fitExport, fitPrint, vansSpec } from '../../shared/print/sheet';
import { inkPdf, inkWorkbook } from './inspect';
import { exportRows, printRows } from './referenceCases';
import { formatFor, writeExportFile, writePrintFile } from './write';

const DAY = '2026-09-11';
let folder: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-print-test-'));
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

describe('the format comes off the extension', () => {
  it('reads .pdf, .xlsx and .xlsm, whatever their case', () => {
    expect(formatFor('a.PDF')).toBe('pdf');
    expect(formatFor('a.xlsx')).toBe('xlsx');
    expect(formatFor('a.XLSM')).toBe('xlsx');
    expect(formatFor('a.csv')).toBeNull();
    expect(formatFor('a')).toBeNull();
  });

  it('refuses anything else in plain words', async () => {
    const spec = printing.defaultSpec();
    await expect(
      writePrintFile(path.join(folder, 'a.txt'), printRows(DAY), spec, 'x'),
    ).rejects.toThrow("Don't know how to write a '.txt' file.\n\nSave it as .pdf or .xlsx.");
    const roster = { rows: [] };
    await expect(writeExportFile(path.join(folder, 'a'), roster, false)).rejects.toThrow(
      "Don't know how to write a 'no extension' file.",
    );
  });
});

describe('Print Page', () => {
  it('writes a PDF and a workbook, and says how many drivers and pages', async () => {
    const rows = printRows(DAY);
    const pdfFile = path.join(folder, 'Load Out.pdf');
    const result = await writePrintFile(pdfFile, rows, printing.defaultSpec(), 'Friday');
    expect(result.drivers).toBe(rows.length);
    const pdf = await inkPdf(new Uint8Array(readFileSync(pdfFile)));
    expect(pdf.pages).toHaveLength(result.pages);
    const xlsxFile = path.join(folder, 'Load Out.xlsx');
    await writePrintFile(xlsxFile, rows, printing.defaultSpec(), 'Friday');
    const [sheet] = await inkWorkbook(new Uint8Array(readFileSync(xlsxFile)));
    // Title, a blank line, the headings, then one row per driver.
    expect(sheet!.cells.filter((c) => c.address.startsWith('B')).length).toBe(rows.length + 1);
  });

  it('will not print a layout with no columns', async () => {
    const spec = printing.createPrintSpec({ columns: [] });
    await expect(
      writePrintFile(path.join(folder, 'a.pdf'), printRows(DAY), spec, ''),
    ).rejects.toThrow('There are no columns on this layout');
  });

  it('says why nobody is left, naming the van switch only when it is on', async () => {
    const rows = printRows(DAY);
    const spec = printing.createPrintSpec({
      columns: printing.defaultSpec().columns,
      excludedDrivers: rows.map((r) => r.key),
    });
    await expect(writePrintFile(path.join(folder, 'a.pdf'), rows, spec, '')).rejects.toThrow(
      'Every driver is being left off - by name or by shift type.',
    );
    await expect(
      writePrintFile(path.join(folder, 'a.pdf'), rows, { ...spec, vansOnly: true }, ''),
    ).rejects.toThrow('by name, by shift type or for not holding a van.');
  });

  it('says so in plain words when the file cannot be written there', async () => {
    // A folder of that name is where the file should go, so it cannot be written.
    const blocked = path.join(folder, 'taken.pdf');
    await writePrintFile(
      path.join(blocked, '..', 'ok.pdf'),
      printRows(DAY),
      printing.defaultSpec(),
      '',
    );
    const { mkdirSync } = await import('node:fs');
    mkdirSync(blocked);
    await expect(
      writePrintFile(blocked, printRows(DAY), printing.defaultSpec(), ''),
    ).rejects.toThrow(/taken\.pdf/);
  });
});

describe('Print Vans', () => {
  it("is the tab's own page and people, cut down to who and which van, in van order", () => {
    const tab = printing.createPrintSpec({
      columns: printing.defaultSpec().columns,
      paper: 'legal',
      scale: 80,
      sortBy: 'pad',
      sortReverse: true,
      excludedShifts: ['Sweeper'],
      excludedDrivers: ['id:X'],
    });
    const vans = vansSpec(tab);
    expect(vans.columns).toEqual(printing.vansColumns());
    expect(vans).toMatchObject({
      title: 'Vans',
      sortBy: 'vehicle',
      sortReverse: false,
      vansOnly: true,
      paper: 'legal',
      scale: 80,
      excludedShifts: ['Sweeper'],
      excludedDrivers: ['id:X'],
    });
    expect(vansSpec({ ...tab, title: 'Yard' }).title).toBe('Yard');
    // The tab itself is untouched.
    expect(tab.sortBy).toBe('pad');
  });
});

describe('the fixed exports', () => {
  it('write the headings even with nobody on the roster, as the old export did', async () => {
    const file = path.join(folder, 'a.pdf');
    expect(await writeExportFile(file, { rows: [] }, false)).toBe(0);
    const pdf = await inkPdf(new Uint8Array(readFileSync(file)));
    expect(pdf.pages).toHaveLength(1);
    expect(pdf.pages[0]!.texts.map((t) => t.text)).toEqual(
      sheetExport.layout(false).flatMap((c) => (c.heading ? [c.heading] : [])),
    );
    expect(exportRows(DAY, false).length).toBeGreaterThan(0);
  });

  it('keep identifiers as text and plain numbers as numbers in the workbook', async () => {
    const file = path.join(folder, 'a.xlsx');
    const row = (vehicle: string, pad: string) => ({
      driver: 'Ariana Nethercott',
      vehicle,
      shiftType: '',
      routes: 'CX16',
      pad,
      bags: '',
      ovs: '',
      stagingLocation: 'STG.G02',
    });
    const rows = [row('655103 (LMR)', '2'), row('ET5720', '007'), row('551894', '')];
    await writeExportFile(file, { rows } as never, true);
    const [sheet] = await inkWorkbook(new Uint8Array(readFileSync(file)));
    const value = (address: string) => sheet!.cells.find((c) => c.address === address)?.value;
    // Sorted by name, all the same name: kept in order. Vehicle is column B, PAD is column H.
    expect(value('B2')).toBe('655103 (LMR)');
    expect(value('B3')).toBe('ET5720');
    expect(value('B4')).toBe(551894);
    expect(value('H2')).toBe(2);
    expect(value('H3')).toBe('007');
    expect(value('G2')).toBe('STG.G02');
    expect(value('D2')).toBe('CX16');
    expect(sheet!.printTitlesRow).toBe('1:1');
    expect(sheet!.pageSetup.fitToWidth).toBe(1);
    expect(sheet!.pageSetup.fitToHeight).toBe(0);
    expect(sheetExport.layout(true).map((c) => c.heading)).toEqual([
      'Driver',
      'Vehicle',
      'Shift Type',
      'Routes',
      'Bags',
      'OVS',
      'Staging',
      'PAD',
      '',
    ]);
  });
});

describe('trimming a cell to its column', () => {
  const canvas = () => {
    const c = new Canvas(612, 792);
    c.setFont(false, 10);
    return c;
  };

  it('cuts with an ellipsis, and keeps one character rather than none on the Print tab', () => {
    expect(fitPrint(canvas(), 'ATTN NEEDED: Unscheduled Driver', 60)).toMatch(/^ATTN.*\.\.\.$/);
    expect(fitPrint(canvas(), 'Ariana', 9)).toBe('A');
    expect(fitPrint(canvas(), 'O’Brien', 200)).toBe("O'Brien");
  });

  it('cuts to nothing on the fixed export, as the old one did', () => {
    expect(fitExport(canvas(), 'Ariana', 9)).toBe('');
    expect(fitExport(canvas(), 'Shift', 200)).toBe('Shift');
  });

  it('puts text where fpdf2 put it: a cell margin in, the baseline 0.3 of the size below the middle', () => {
    const c = canvas();
    c.addPage();
    c.setXY(50, 82);
    c.cell(100, 20, 'Abc', true, 'L');
    c.cell(60, 20, 'R', false, 'R');
    const [box, left, right] = c.finish().pages[0]!.marks;
    expect(box).toMatchObject({ kind: 'rect', x: 50, y: 82, w: 100, h: 20, fill: null });
    expect(left).toMatchObject({ kind: 'text', x: 52.835, y: 95 });
    expect(right).toMatchObject({ kind: 'text', y: 95 });
    // The sample fpdf2 drew for the same cell put "R" at 199.95.
    expect((right as { x: number }).x).toBeCloseTo(199.95, 2);
  });
});
