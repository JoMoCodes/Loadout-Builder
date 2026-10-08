// The roster as the fixed printed sheet: which columns, in what order, and the cells under them.
//
// Ported from the old app's export.py, without the PDF and spreadsheet writers. The printed sheet is
// not the Roster table. It carries five columns - who, which van, which shift, which route, which
// PAD - with a blank column either side to write in, and it always carries every driver, in name
// order, whatever the Roster tab happens to be filtered or sorted to at the time.
//
// Ask for the DWP version and it carries Bags, OVS and Staging beside the route they belong to, and
// the leading blank column is dropped to pay for them. Those three are read off the roster, not out
// of the DWP sheet, so the page and the Roster tab can never say different things.

import { rosterDateLabel, type DriverRow, type Roster } from './models/roster';

/**
 * One column of the sheet: its heading, how to read it off a driver row (null for the blank
 * spacers), and its relative width. `field` is the old app's name for the row field it reads.
 */
export interface ExportColumn {
  heading: string;
  field: string | null;
  read: ((row: DriverRow) => string) | null;
  weight: number;
}

// The widths are relative: each format scales them to its own page. They are set from what the
// data measures at 10pt, with the DWP layout - the tighter of the two - as the one that has to fit.
const SPACER: ExportColumn = { heading: '', field: null, read: null, weight: 61 };

export const COLUMNS: readonly ExportColumn[] = [
  SPACER,
  { heading: 'Driver', field: 'driver', read: (row) => row.driver, weight: 113 },
  // Wide enough for '655103 (LMR)': the rental vans carry their note in the same cell.
  { heading: 'Vehicle', field: 'vehicle', read: (row) => row.vehicle, weight: 78 },
  { heading: 'Shift Type', field: 'shift_type', read: (row) => row.shiftType, weight: 90 },
  { heading: 'Routes', field: 'routes', read: (row) => row.routes, weight: 46 },
  // The column already says PAD, so the cell just carries the number.
  { heading: 'PAD', field: 'pad', read: (row) => row.pad, weight: 32 },
  SPACER,
];

// Narrow on purpose: both hold a count of three digits at most.
const DWP_WEIGHT = 36;

// 'STG.G02' is seven narrow characters; the bold heading above it is wider.
const STAGING_WEIGHT = 55;

/** `_standard`: one of the standard columns, by its heading. */
export function standard(heading: string): ExportColumn {
  const found = COLUMNS.find((column) => column.heading === heading);
  if (!found) throw new Error(`No standard column called ${JSON.stringify(heading)}.`);
  return found;
}

/**
 * The columns to print, with or without the DWP numbers. Bags, OVS and Staging go straight after
 * the route they belong to; the leading spacer is what pays for the width.
 */
export function layout(withDwp = false): readonly ExportColumn[] {
  if (!withDwp) return COLUMNS;
  return [
    standard('Driver'),
    standard('Vehicle'),
    standard('Shift Type'),
    standard('Routes'),
    { heading: 'Bags', field: 'bags', read: (row) => row.bags, weight: DWP_WEIGHT },
    { heading: 'OVS', field: 'ovs', read: (row) => row.ovs, weight: DWP_WEIGHT },
    {
      heading: 'Staging',
      field: 'staging_location',
      read: (row) => row.stagingLocation,
      weight: STAGING_WEIGHT,
    },
    standard('PAD'),
    SPACER,
  ];
}

/** How many drivers carry any of the three columns the DWP fills. */
export function carryingDwp(roster: Pick<Roster, 'rows'>): number {
  return roster.rows.filter((row) => row.bags || row.ovs || row.stagingLocation).length;
}

// Characters Windows will not have in a filename.
const ILLEGAL = /[<>:"/\\|?*]/g;

/** The sheet could not be written where it was asked to go. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

/**
 * What the save dialog offers, without an extension. Nothing on the page says which day it is, so
 * the file name carries it, and the two versions are named apart.
 */
export function defaultFilename(roster: Pick<Roster, 'loadOutDate'>, withDwp = false): string {
  const label = withDwp ? 'Load Out with DWP' : 'Load Out';
  return `${label} - ${rosterDateLabel(roster)}`.replace(ILLEGAL, '-');
}

/**
 * Every driver, in name order, as the cells to print. Empty cells stay empty rather than taking the
 * roster's "-": on a printed sheet with a box round every cell, that box is somewhere to write.
 */
export function rowsFor(roster: Pick<Roster, 'rows'>, withDwp = false): string[][] {
  const columns = layout(withDwp);
  // A stable sort on the lowercased name, as Python's sorted() is.
  const drivers = roster.rows
    .map((row) => ({ row, name: row.driver.toLowerCase() }))
    .sort((a, b) => compareCodePoints(a.name, b.name))
    .map((item) => item.row);
  return drivers.map((row) => columns.map((column) => (column.read ? column.read(row) || '' : '')));
}

function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const x = (left[index] as string).codePointAt(0) as number;
    const y = (right[index] as string).codePointAt(0) as number;
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

// A plain number and nothing else: an optional minus, no leading zero, and at most one decimal
// point. Tighter than parsing as a float would be, which also swallows 'nan', 'inf' and '1e5'.
const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * `_cell`: what goes in a spreadsheet cell - a number wherever the text is one, so Excel has no
 * "number stored as text" warning to show. A leading zero is left as text: '007' is not 7.
 */
export function cell(text: string): string | number | null {
  if (!text) return null;
  // Deliberate, as in the old app: Python's re.match with `$` also accepts one trailing newline.
  if (!NUMERIC.test(text.endsWith('\n') ? text.slice(0, -1) : text)) return text;
  return Number(text.trim());
}
