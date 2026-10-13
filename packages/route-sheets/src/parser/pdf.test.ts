// Twins of the old Route Sheet Distributor's PDF tests (same names, same assertions), plus one
// that reads every made-up fixture PDF from disk.

import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ROUTE_SHEET_DAYS,
  buildRouteSheetPdf,
  readRoutesRows,
  waveFromDeparture,
} from '../../../fixtures/make-route-sheets.mjs';
import type { ParsedRouteSheetPdf, PdfTextItem } from '../types';
import { parsePageItems } from './page';
import { parseRouteSheetPdf, readPdfItems } from './pdfItems.node';
import { sheetsFromPages } from './stack';
import { SHEETS } from './testkit';

describe('route sheet PDF', () => {
  let parsed: ParsedRouteSheetPdf;
  beforeAll(async () => {
    parsed = await parseRouteSheetPdf(await buildRouteSheetPdf(SHEETS));
  });

  it('PDF: reads header, bags, overflow and totals exactly as printed', () => {
    expect(parsed.sheets.length).toBe(8);
    const s = parsed.sheets[0]!;
    expect(s.routeCode).toBe('CX101');
    expect(s.staging).toBe('STG.A1.1');
    expect(s.dsp).toBe('XXXX');
    expect(s.serviceType).toBe('Standard Parcel Electric - Rivian MEDIUM');
    expect(s.station).toBe('XXX1');
    expect(s.date).toBe('2026-09-24');
    expect(s.cycle).toBe('CYCLE_1');
    expect(s.waveTime).toBe('09:50 AM');
    expect(s.bags).toEqual([
      { index: 1, sortZone: 'A-1.1A', bag: 'Green 1069', packages: 18 },
      { index: 2, sortZone: '', bag: 'Orange 5270', packages: 11 },
      { index: 3, sortZone: 'A-1.3A', bag: 'Navy 0566', packages: 5 },
    ]);
    expect(s.overflow).toEqual([
      { index: 1, sortZone: 'A-99.JW', packages: 1 },
      { index: 2, sortZone: 'A-6.3U', packages: 2 },
    ]);
    expect(s.totalPackages).toBe(37);
    expect(s.commercialPackages).toBe(4);
  });

  it('PDF: a blank Sort Zone stays blank (row is not shifted) and is reported as a note', () => {
    const s = parsed.sheets[0]!;
    expect(s.check.ok).toBe(true);
    expect(s.check.notes).toEqual(['Bag #2 (Orange 5270) has no Sort Zone printed on the sheet']);
  });

  it('PDF: numbers that do not add up fail the check', () => {
    const s = parsed.sheets.find((x) => x.routeCode === 'CX108')!;
    expect(s.check.ok).toBe(false);
    expect(s.check.problems.join(' ')).toMatch(/Total Packages says 99/);
  });

  it('PDF: parser works from positioned items without widths (fallback path)', () => {
    const items: PdfTextItem[] = [
      { str: 'STG.X1.1', x: 36, y: 60, size: 57 },
      { str: 'CX1', x: 36, y: 130, size: 36 },
      { str: 'XXXX · Svc', x: 348, y: 138, size: 10.5 },
      { str: 'XXX1 · THU, SEP 24, 2026 · CYCLE_1 · 09:50 AM', x: 346, y: 155, size: 10.5 },
      { str: '1 bags', x: 36, y: 225, size: 15 },
      { str: '2 overflow', x: 322, y: 225, size: 15 },
      { str: '1', x: 36, y: 274, size: 10.5 },
      { str: 'Z-1', x: 67, y: 274, size: 10.5 },
      { str: 'Green 1', x: 171, y: 274, size: 10.5 },
      { str: '5', x: 253, y: 274, size: 10.5 },
      { str: '1', x: 322, y: 274, size: 10.5 },
      { str: 'Z-9', x: 358, y: 274, size: 10.5 },
      { str: '2', x: 540, y: 274, size: 10.5 },
      { str: 'Total Packages', x: 322, y: 320, size: 10.5 },
      { str: '7', x: 540, y: 320, size: 10.5 },
      { str: 'Commercial Packages', x: 322, y: 337, size: 10.5 },
      { str: '0', x: 540, y: 337, size: 10.5 },
    ];
    const s = parsePageItems(items, 612, 1);
    expect(s.check.ok, s.check.problems.join('; ')).toBe(true);
    expect(s.bags).toEqual([{ index: 1, sortZone: 'Z-1', bag: 'Green 1', packages: 5 }]);
  });

  it('PDF: headings split into separate runs ("24" + "bags", "ETDT ·" + service) are still read', () => {
    // Layout taken from a real sheet generated on 2026-10-10, where the count and the word became
    // separate text runs and the service line split after the "·".
    const items: PdfTextItem[] = [
      { str: 'STG.G6.1', x: 36, y: 108.7, width: 236, size: 57 },
      { str: 'CX203', x: 36, y: 165.7, width: 106.9, size: 36 },
      { str: 'ETDT ·', x: 348.1, y: 148.5, width: 30.2, size: 10.5 },
      {
        str: 'Standard Parcel Electric - Rivian MEDIUM',
        x: 381.1,
        y: 148.5,
        width: 194.9,
        size: 10.5,
      },
      {
        str: 'XXX1 · SAT, OCT 10, 2026 · CYCLE_1 · 09:50 AM',
        x: 347.2,
        y: 165,
        width: 228.8,
        size: 10.5,
      },
      { str: '2', x: 36, y: 238.5, width: 17.6, size: 15 },
      { str: 'bags', x: 57.5, y: 238.5, width: 33, size: 15 },
      { str: 'Sort Zone', x: 66.7, y: 267, width: 46.9, size: 10.5 },
      { str: 'Bag', x: 209.9, y: 267, width: 18.1, size: 10.5 },
      { str: 'Pkgs', x: 243.3, y: 267, width: 22.2, size: 10.5 },
      { str: '1', x: 36, y: 283.5, width: 6.2, size: 10.5 },
      { str: 'E-11.2C', x: 66.7, y: 283.5, width: 37.4, size: 10.5 },
      { str: 'Yellow 7936', x: 167.7, y: 283.5, width: 60.3, size: 10.5 },
      { str: '20', x: 253.2, y: 283.5, width: 12.3, size: 10.5 },
      { str: '2', x: 36, y: 300, width: 6.2, size: 10.5 },
      { str: 'E-11.4C', x: 66.7, y: 300, width: 37.4, size: 10.5 },
      { str: 'Green 7445', x: 171.2, y: 300, width: 56.8, size: 10.5 },
      { str: '13', x: 253.2, y: 300, width: 12.3, size: 10.5 },
      { str: '3', x: 322.2, y: 238.5, width: 17.6, size: 15 },
      { str: 'overflow', x: 343.7, y: 238.5, width: 62.3, size: 15 },
      { str: 'Sort Zone', x: 353, y: 267, width: 46.9, size: 10.5 },
      { str: 'Pkgs', x: 529.5, y: 267, width: 22.2, size: 10.5 },
      { str: '1', x: 322.2, y: 283.5, width: 6.2, size: 10.5 },
      { str: 'E-11.2Z', x: 353, y: 283.5, width: 38, size: 10.5 },
      { str: '1', x: 545.5, y: 283.5, width: 6.2, size: 10.5 },
      { str: '2', x: 322.2, y: 300, width: 6.2, size: 10.5 },
      { str: 'E-11.3W', x: 353, y: 300, width: 41.7, size: 10.5 },
      { str: '2', x: 545.5, y: 300, width: 6.2, size: 10.5 },
      { str: 'Total Packages', x: 322.2, y: 654, width: 73.6, size: 10.5 },
      { str: '36', x: 533.2, y: 654, width: 18.5, size: 10.5 },
      { str: 'Commercial Packages', x: 322.2, y: 669, width: 107.4, size: 10.5 },
      { str: '6', x: 539.4, y: 669, width: 12.3, size: 10.5 },
    ];
    const s = parsePageItems(items, 612, 1);
    expect(s.check.ok, s.check.problems.join('; ')).toBe(true);
    expect(s.dsp).toBe('ETDT');
    expect(s.serviceType).toBe('Standard Parcel Electric - Rivian MEDIUM');
    expect(s.bagCount).toBe(2);
    expect(s.overflowCount).toBe(3);
    expect(s.bags.map((b) => b.packages)).toEqual([20, 13]);
    expect(s.overflow.map((o) => o.packages)).toEqual([1, 2]);
    expect(s.totalPackages).toBe(36);
  });

  it('PDF: a long route whose tables spill onto the next page is read as one sheet, and blank pages are skipped', async () => {
    const long = { ...SHEETS[0]!, routeCode: 'CX901', continued: true };
    const buf = await buildRouteSheetPdf([SHEETS[1]!, long, { blank: true }, SHEETS[2]!]);
    const r = await parseRouteSheetPdf(buf);
    expect(r.sheets.map((s) => s.routeCode)).toEqual(['CX102', 'CX901', 'CX103']);
    const s = r.sheets[1]!;
    expect(s.check.ok, s.check.problems.join('; ')).toBe(true);
    expect(s.pageNumber).toBe(2);
    expect(s.pageNumbers).toEqual([2, 3]);
    expect(s.bagCount).toBe(3);
    expect(s.bags.length).toBe(3);
    expect(s.overflow.length).toBe(2);
    expect(s.totalPackages).toBe(37);
    expect(r.sheets[2]!.pageNumbers).toEqual([5]);
    expect(r.pageCount).toBe(5);
    expect(r.pageErrors.map((e) => e.pageNumber)).toEqual([4]);
    expect(r.pageErrors[0]!.message).toMatch(/blank/);
    // The old test ends by cutting the route's two pages out with the exporter's extractPages.
    // That function belongs to the exporter, so its twin (in src/export) covers that assertion.
  });

  it('PDF: every synthetic fixture page passes the number check except the one meant to fail', async () => {
    const dir = new URL('../../../fixtures/route-sheets/', import.meta.url);
    for (const day of ROUTE_SHEET_DAYS) {
      const rows = await readRoutesRows(day);
      const codes = new Set(rows.map((r) => String(r['Route code']).trim()));
      const waves = new Set(rows.map((r) => waveFromDeparture(r['Planned Departure Time'])));
      for (const name of [`${day}.pdf`, `${day}-split-runs.pdf`]) {
        const label = `${name}: `;
        const data = new Uint8Array(await readFile(new URL(name, dir)));
        const r = sheetsFromPages(await readPdfItems(data));
        expect(r.sheets.length, label + 'sheet count').toBe(codes.size - 1 + 1);
        const failing = r.sheets.filter((s) => !s.check.ok);
        expect(
          failing.length,
          label + failing.map((s) => s.check.problems.join('; ')).join(' | '),
        ).toBe(1);
        const third = [...codes][2];
        expect(failing[0]!.routeCode, label + 'the page meant to fail').toBe(third);
        expect(failing[0]!.check.problems.join(' ')).toMatch(/Total Packages says/);
        const long = r.sheets[1]!;
        expect(long.pageNumbers.length, label + 'long route spans two pages').toBe(2);
        expect(r.pageErrors.length, label + 'page errors').toBe(2);
        expect(r.pageErrors[0]!.message).toMatch(/does not look like a route sheet/);
        expect(r.pageErrors[1]!.message).toMatch(/is blank/);
        for (const s of r.sheets) {
          expect(s.waveTime, label + 'wave time').toMatch(/^\d{2}:\d{2} [AP]M$/);
          expect(waves.has(s.waveTime ?? ''), label + 'wave time is a dispatch time').toBe(true);
          expect(s.station).toBe('XXX1');
          expect(s.dsp).toBe('XXXX');
        }
        expect(r.sheets.some((s) => s.routeCode === 'CX900')).toBe(true);
        const notes = r.sheets[0]!.check.notes;
        expect(notes.length).toBe(2);
        expect(notes[0]).toMatch(/^Bag #2 .* has no Sort Zone printed on the sheet$/);
        expect(notes[1]).toMatch(/^Bag #3 .* has no Bag label printed on the sheet$/);
      }
    }
  });
});
