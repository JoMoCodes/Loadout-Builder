// The Print tab's working-out, against the old tab's rules (print_page.py). The rows are the
// made-up fixture day's own print rows.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { printing } from '@loadout/core';
import {
  allOff,
  driverItems,
  forcedOff,
  inverted,
  layoutLines,
  pyRound,
  scaleFromBox,
  searched,
  summary,
  toggled,
  weightFromBox,
  widthShown,
  writtenNote,
} from './logic';

const here = path.dirname(fileURLToPath(import.meta.url));
const day = JSON.parse(
  readFileSync(
    path.join(
      here,
      ...Array(7).fill('..'),
      'scripts',
      'parity',
      'expected',
      '2026-09-11',
      'printing.json',
    ),
    'utf8',
  ),
) as {
  date_label: string;
  print_rows: printing.PrintRow[];
  specs: Record<string, { column_widths: number[]; page_count: number; band_count: number }>;
};
const rows = day.print_rows;

describe('the read-out at the top', () => {
  it('says the title, who is on it, the pages and the shape, as the old tab did', () => {
    const top = summary(printing.defaultSpec(), rows, day.date_label, false);
    expect(top.title).toBe(`Load Out  -  ${day.date_label}`);
    expect(top.subtitle).toBe(
      `${rows.length} of ${rows.length} drivers, everybody on it  -  ordered by driver name`,
    );
    expect(top.pages).toBe(`${day.specs.default!.page_count} pages`);
    expect(top.shape).toBe('7 columns  -  Letter portrait at 100%');
    expect(top.warning).toBe('');
  });

  it('says how many page-widths a sheet spills onto, and when nobody or nothing is left', () => {
    const wide = printing.createPrintSpec({
      columns: printing.PRINT_FIELDS.map(([key]) => printing.createPrintColumn({ field: key })),
      fitOnePage: false,
    });
    expect(summary(wide, rows, '', false).warning).toMatch(/^columns spill onto \d+ page-widths$/);
    const empty = printing.createPrintSpec({ columns: [] });
    expect(summary(empty, rows, '', false).warning).toBe('no columns - the page would be blank');
    const nobody = { ...printing.defaultSpec(), excludedDrivers: rows.map((r) => r.key) };
    expect(summary(nobody, rows, '', false).warning).toBe('nobody is left on the sheet');
    expect(summary(nobody, rows, '', true).subtitle).toBe(
      'No roster loaded. Import a load-out sheet on the Roster tab.',
    );
  });
});

describe('the column list and the Width box', () => {
  it('shows the width each column really prints at, with "auto" where nobody fixed it', () => {
    const lines = layoutLines(printing.defaultSpec(), rows);
    expect(lines.map((l) => l.width)).toEqual(
      day.specs.default!.column_widths.map((w) => `${pyRound(w)} auto`),
    );
    expect(lines[0]).toMatchObject({ column: '(blank)', kind: 'Write-in', ghost: true });
    expect(lines[1]).toMatchObject({ column: 'Driver', kind: 'Column', align: 'Default' });
  });

  it('changes the figure when the scale, the paper or the roster does', () => {
    const spec = printing.defaultSpec();
    const at = (s: printing.PrintSpec, r = rows) => layoutLines(s, r)[1]!.width;
    expect(at({ ...spec, scale: 150 })).not.toBe(at(spec));
    expect(at(spec, rows.slice(0, 3))).not.toBe(at(spec));
    const wide = {
      ...spec,
      columns: printing.PRINT_FIELDS.map(([key]) => printing.createPrintColumn({ field: key })),
    };
    expect(at({ ...wide, paper: 'tabloid' })).not.toBe(at(wide));
  });

  it('moves nothing when the number shown is typed back, and fixes the width otherwise', () => {
    const spec = printing.defaultSpec();
    const column = spec.columns[1] as printing.PrintColumn;
    const shown = widthShown(spec, rows, 1);
    expect(weightFromBox(spec, column, shown, shown)).toBeNull();
    expect(weightFromBox(spec, column, 'abc', shown)).toBeNull();
    expect(weightFromBox(spec, column, '150', shown)).toBe(150);
    expect(weightFromBox(spec, column, '9999', shown)).toBe(400);
    expect(weightFromBox(spec, column, '5', shown)).toBe(20);
    // The box is in points on the page; a column is kept at full scale.
    expect(weightFromBox({ ...spec, scale: 50 }, column, '100', shown)).toBe(200);
    // Python's round: 25 / 0.4 = 62.5 goes to the even 62.
    expect(weightFromBox({ ...spec, scale: 40 }, column, '25', shown)).toBe(62);
  });

  it('keeps the scale between 40 and 200, and ignores what is not a number', () => {
    expect(scaleFromBox('500', 100)).toBe(200);
    expect(scaleFromBox('10', 100)).toBe(40);
    expect(scaleFromBox('abc', 90)).toBe(90);
    expect(scaleFromBox('75.9', 90)).toBe(75);
  });
});

describe('who prints', () => {
  it('says why a driver is off when their shift type is, or they have no van on a vans-only sheet', () => {
    const someone = rows.find((r) => r.values.shift_type && !r.values.vehicle)!;
    const shift = someone.values.shift_type!;
    const spec = { ...printing.defaultSpec(), excludedShifts: [shift] };
    expect(forcedOff(spec, someone)).toBe(
      `${someone.values.driver} is off because the shift type '${shift}' is. Switch that back on first.`,
    );
    const vansOnly = { ...printing.defaultSpec(), vansOnly: true };
    expect(forcedOff(vansOnly, someone)).toContain('has no van');
    expect(forcedOff(printing.defaultSpec(), someone)).toBe('');
  });

  it('All, None and Invert, and a click, as the old lists did', () => {
    const items = driverItems(rows);
    const names = items.map((i) => i.values[0]!.toLowerCase());
    expect(names).toEqual([...names].sort());
    const none = allOff(items);
    expect(none).toHaveLength(new Set(rows.map((r) => r.key)).size);
    expect(inverted(items, none)).toEqual([]);
    expect(inverted(items, [])).toEqual(none);
    expect(toggled(toggled([], 'a'), 'a')).toEqual([]);
  });

  it('a search narrows only what is on screen', () => {
    const items = driverItems(rows);
    const first = items[0]!.values[0]!;
    expect(searched(items, first.toUpperCase()).length).toBeGreaterThanOrEqual(1);
    expect(searched(items, '').length).toBe(items.length);
  });
});

describe('the status line after printing', () => {
  it('says how many and where, and how many were left off', () => {
    expect(
      writtenNote({ drivers: 20, pages: 1, fileName: 'Vans.pdf', leftOff: 4 }, 'without a van'),
    ).toBe('Wrote 20 drivers over 1 page to Vans.pdf. 4 left off - without a van.');
    expect(writtenNote({ drivers: 20, pages: 2, fileName: 'a.xlsx', leftOff: 0 }, '')).toBe(
      'Wrote 20 drivers over 2 pages to a.xlsx.',
    );
  });
});
