// The Print tab's working-out, kept apart from the screen so it can be tested on its own. Ported
// from the old Print tab (print_page.py): the read-outs at the top, the column list's Width figures,
// the Width box, who is greyed out and why, and the three buttons under each list.
//
// None of this decides who prints or how the page is laid out: that is the core's (`printing`),
// the same functions the writer uses, so what the tab says is what the paper says.

import { NO_SHIFT, printing } from '@loadout/core';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;
type PrintColumn = printing.PrintColumn;

/** The Width box steps by 5, from 20 to 400 points. */
export const WIDTH_MIN = 20;
export const WIDTH_MAX = 400;
export const WIDTH_STEP = 5;

/** A tick, or a dash, in the "On" column of the two lists. */
export const ON = '✓';
export const OFF = '-';

/** Python's round(): halves go to the even number. */
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** `_label_for`: the menu words for a key, or the first choice's words. */
export function labelFor(choices: ReadonlyArray<readonly [string, string]>, key: string): string {
  const found = choices.find(([candidate]) => candidate === key);
  return found ? found[1] : (choices[0]?.[1] ?? '');
}

/** `_key_for`: the key for some menu words, or the fallback. */
export function keyFor(
  choices: ReadonlyArray<readonly [string, string]>,
  label: string,
  fallback: string,
): string {
  const found = choices.find(([, candidate]) => candidate === label);
  return found ? found[0] : fallback;
}

/** A layout from the saved data, made whole (the stand-in bridge in tests can send a bare one). */
export function wholeSpec(raw: unknown): PrintSpec {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as PrintSpec).columns)) {
    return printing.defaultSpec();
  }
  return printing.createPrintSpec(raw as Partial<PrintSpec>);
}

/** A copy that can be changed without touching the one on screen. */
export function copySpec(spec: PrintSpec): PrintSpec {
  return {
    ...spec,
    columns: spec.columns.map((column) => ({ ...column })),
    excludedShifts: [...spec.excludedShifts],
    excludedDrivers: [...spec.excludedDrivers],
  };
}

/**
 * `_printed_widths`: what each column will really come out at, in points, worked out the way the
 * page works it out, off the drivers who are actually printing.
 */
export function printedWidths(spec: PrintSpec, rows: readonly PrintRow[]): number[] {
  return printing.columnWidths(spec, printing.geometry(spec), printing.specRowsFor(spec, rows));
}

export interface LayoutLine {
  column: string;
  kind: string;
  align: string;
  width: string;
  /** Not a field off the roster (a write-in or tick box): shown greyed, as the old list did. */
  ghost: boolean;
}

/** `_layout_values`: the column list, one line per column. */
export function layoutLines(spec: PrintSpec, rows: readonly PrintRow[]): LayoutLine[] {
  const widths = printedWidths(spec, rows);
  return spec.columns.map((column, index) => ({
    column: printing.columnLabel(column) || '(blank)',
    kind: printing.columnKindLabel(column),
    align: labelFor(printing.ALIGN_CHOICES, column.alignOverride),
    width: `${pyRound(widths[index] ?? 0)}${column.weight ? '' : ' auto'}`,
    ghost: column.kind !== printing.FIELD,
  }));
}

/** What the Width box shows for a column: the width it really prints at, in points. */
export function widthShown(spec: PrintSpec, rows: readonly PrintRow[], index: number): string {
  const widths = printedWidths(spec, rows);
  return index >= 0 && index < widths.length ? String(pyRound(widths[index] as number)) : '';
}

/**
 * `_width_changed`: the weight to fix a column at, from what was typed in the Width box. Null when
 * nothing should change: the box still shows what was put in it, the text is not a number, or it
 * comes to the weight the column already has. Typing back the number shown moves nothing.
 */
export function weightFromBox(
  spec: PrintSpec,
  column: PrintColumn,
  typed: string,
  shown: string,
): number | null {
  const text = typed.trim();
  if (text === shown) return null;
  const parsed = Number(text);
  if (text === '' || !Number.isFinite(parsed)) return null;
  const points = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.trunc(parsed)));
  const scale = Math.max(printing.SCALE_MIN, Math.min(printing.SCALE_MAX, spec.scale)) / 100;
  const weight = Math.max(1, pyRound(points / Math.max(0.01, scale)));
  return weight === column.weight ? null : weight;
}

/** `_as_scale`: a typed scale, kept between 40 and 200, or the old one if it is not a number. */
export function scaleFromBox(typed: string, fallback: number): number {
  const parsed = Number(typed.trim());
  if (typed.trim() === '' || !Number.isFinite(parsed)) return fallback;
  return Math.max(printing.SCALE_MIN, Math.min(printing.SCALE_MAX, Math.trunc(parsed)));
}

/**
 * `_forced_off`: why this driver is off the sheet whatever their own switch says, or ''. Their
 * shift type is switched off, or they hold no van and the sheet only wants drivers who do.
 */
export function forcedOff(spec: PrintSpec, row: PrintRow | undefined): string {
  if (!row) return '';
  const shift = printing.printRowValue(row, 'shift_type') || NO_SHIFT;
  const driver = printing.printRowValue(row, 'driver');
  if (spec.excludedShifts.includes(shift)) {
    return `${driver} is off because the shift type '${shift}' is. Switch that back on first.`;
  }
  if (spec.vansOnly && !printing.printRowValue(row, 'vehicle')) {
    return `${driver} has no van, and the sheet is set to drivers holding one. Untick that to put them back.`;
  }
  return '';
}

export interface ListItem {
  key: string;
  values: string[];
}

/** The shift type list: name and how many drivers, A to Z ignoring case. */
export function shiftItems(counts: ReadonlyArray<readonly [string, number]>): ListItem[] {
  return counts.map(([name, count]) => ({ key: name, values: [name, String(count)] }));
}

/** The driver list: name, shift type and van ("-" for none), A to Z ignoring case. */
export function driverItems(rows: readonly PrintRow[]): ListItem[] {
  return rows
    .map((row) => ({ row, name: printing.printRowValue(row, 'driver').toLowerCase() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ row }) => ({
      key: row.key,
      values: [
        printing.printRowValue(row, 'driver'),
        printing.printRowValue(row, 'shift_type') || '-',
        printing.printRowValue(row, 'vehicle') || '-',
      ],
    }));
}

/** Only the items a search leaves showing. The search never changes who prints. */
export function searched(items: readonly ListItem[], query: string): ListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => item.values.some((value) => value.toLowerCase().includes(q)));
}

/** All: nobody left off (every key, not only the ones on today's list). */
export function allOn(): string[] {
  return [];
}

/** None: everybody on the list left off. */
export function allOff(items: readonly ListItem[]): string[] {
  return [...new Set(items.map((item) => item.key))].sort();
}

/** Invert: on the list, those off come on and those on go off. */
export function inverted(items: readonly ListItem[], off: readonly string[]): string[] {
  const now = new Set(off);
  return [...new Set(items.map((item) => item.key).filter((key) => !now.has(key)))].sort();
}

/** One click on a row: off if it was on, on if it was off. Kept sorted, as the old list kept it. */
export function toggled(off: readonly string[], key: string): string[] {
  const next = new Set(off);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return [...next].sort();
}

export interface Summary {
  title: string;
  subtitle: string;
  pages: string;
  shape: string;
  warning: string;
}

/** `_refresh_summary`: the read-out at the top, saying what would come out of the printer now. */
export function summary(
  spec: PrintSpec,
  rows: readonly PrintRow[],
  dateLabel: string,
  rosterEmpty: boolean,
): Summary {
  if (rosterEmpty) {
    return {
      title: 'Print',
      subtitle: 'No roster loaded. Import a load-out sheet on the Roster tab.',
      pages: '',
      shape: '',
      warning: '',
    };
  }
  const chosen = printing.specRowsFor(spec, rows);
  const leftOff = rows.length - chosen.length;
  const pages = printing.pageCount(rows, spec);
  const paper = labelFor(printing.PAPERS, spec.paper).split(' ')[0];
  return {
    title: printing.titleFor(spec, dateLabel),
    subtitle:
      `${chosen.length} of ${rows.length} drivers` +
      (leftOff ? `, ${leftOff} left off` : ', everybody on it') +
      `  -  ordered by ${labelFor(printing.SORT_CHOICES, spec.sortBy).toLowerCase()}`,
    pages: `${pages} page${pages === 1 ? '' : 's'}`,
    shape:
      `${spec.columns.length} columns  -  ${paper} ` +
      `${spec.orientation === printing.LANDSCAPE ? 'landscape' : 'portrait'} at ${spec.scale}%`,
    warning: warning(spec, chosen),
  };
}

/** `_warning`: the one thing about this setup worth saying before it is printed. */
export function warning(spec: PrintSpec, chosen: readonly PrintRow[]): string {
  if (spec.columns.length === 0) return 'no columns - the page would be blank';
  if (chosen.length === 0) return 'nobody is left on the sheet';
  const bands = printing.bandCount(spec, chosen);
  return bands > 1 ? `columns spill onto ${bands} page-widths` : '';
}

/** "1 page", "2 pages". */
export function pagesWord(pages: number): string {
  return `${pages} page${pages === 1 ? '' : 's'}`;
}

/** What the status line says after Print Page or Print Vans wrote a file. */
export function writtenNote(
  done: { drivers: number; pages: number; fileName: string; leftOff: number },
  leftOffNote: string,
): string {
  const tail = done.leftOff
    ? ` ${done.leftOff} left off${leftOffNote ? ` - ${leftOffNote}` : ''}.`
    : '';
  return `Wrote ${done.drivers} drivers over ${pagesWord(done.pages)} to ${done.fileName}.${tail}`;
}

/** What a newly added column is called in the status line. */
export function columnName(column: PrintColumn): string {
  return printing.columnLabel(column) || printing.columnKindLabel(column).toLowerCase();
}
