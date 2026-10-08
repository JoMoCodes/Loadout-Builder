// Parity harness, TypeScript half for agent 2b: vans, export, printing and shared/helvetica.
//
//   npm run parity:ts      (dump.ts runs dump-2a.ts, then this file's default export)
//
// Writes scripts/parity/actual/<day>/{vans,export,printing}.json and
// scripts/parity/actual/shared/helvetica.json in the shape scripts/parity/CONTRACT.md describes, so
// scripts/parity/diff.mjs can compare them with what the old app wrote.
//
// The day's state is built the same way as for the other modules: 2a's `mainRun` imports the
// made-up fixtures onto a copy of the fixture database and brings route data and the DWP over
// (CONTRACT.md section 3). This file then assigns vans and writes what follows from that.
//
// Everything is made-up fixture data. Nothing here prints names: only counts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  candidateFamily,
  candidateNeededQualification,
  candidateServiceType,
  candidateTenure,
  assignedOf,
  byMethod,
  eligible,
  isAssigned,
  looseCount,
  methodLabel,
  unassignedOf,
  type Candidate,
} from '../../../packages/core/src/assignment';
import * as sheet from '../../../packages/core/src/export';
import type { Associate } from '../../../packages/core/src/models/associates';
import { clockKey } from '../../../packages/core/src/models/clock';
import { NO_SHIFT } from '../../../packages/core/src/models/constants';
import { needsVan, rosterDateLabel } from '../../../packages/core/src/models/roster';
import {
  category,
  isRental,
  isStepVan,
  manualOnly,
  orderRank,
  vehicleFamily,
  vehicleRequiredQualification,
  type Vehicle,
} from '../../../packages/core/src/models/vehicles';
import * as printing from '../../../packages/core/src/printing/printing';
import type { AppState } from '../../../packages/core/src/state/appState';
import type { IsoDate } from '../../../packages/core/src/models/dates';
import { mainRun } from './dump-2a';
import { loadDays, type Day } from './harness';
import {
  assignableVehicles,
  assignVans,
  availableVehicles,
  isOperational,
  isOverridden,
  lmrVehicles,
  operationalVehicles,
  overriddenCount,
  vehiclePriority,
} from '../../../packages/core/src/state/vans';

const here = dirname(fileURLToPath(import.meta.url));
const PARITY = join(here, '..');
const ACTUAL = join(PARITY, 'actual');

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// ------------------------------------------------------------------ writing

function codePointCompare(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = (left[i] as string).codePointAt(0) as number;
    const y = (right[i] as string).codePointAt(0) as number;
    if (x !== y) return x - y;
  }
  return left.length - right.length;
}

/** Make a value ready for the JSON file: CONTRACT.md, "Rules for every file". */
function norm(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value;
    const rounded = Number(value.toFixed(6));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (value instanceof Set)
    return [...value].map(norm).sort((a, b) => codePointCompare(String(a), String(b)));
  if (value instanceof Map) return norm(Object.fromEntries(value));
  if (Array.isArray(value)) return value.map(norm);
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort(codePointCompare)) {
      out[key] = norm((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  throw new Error(`Cannot write a ${typeof value} to JSON.`);
}

/**
 * Python's `json.dumps(indent=2, sort_keys=True)`. Written out by hand because JavaScript lists
 * keys that look like whole numbers first, in number order, whatever order they were added in.
 */
function stringify(value: Json, indent = ''): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => inner + stringify(item, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(value).sort(codePointCompare);
  if (keys.length === 0) return '{}';
  const lines = keys.map(
    (key) => `${inner}${JSON.stringify(key)}: ${stringify(value[key] as Json, inner)}`,
  );
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stringify(norm(payload))}\n`, 'utf8');
}

// ------------------------------------------------------------------ modules

const assocRef = (a: Associate | null): Json =>
  a === null ? null : { name: a.name, transporter_id: a.transporterId };
const vehicleRef = (v: Vehicle | null): Json => (v === null ? null : { name: v.name, vin: v.vin });

function vansModule(state: AppState, beforeAvailable: string[]): Json {
  const indices: number[] = [];
  const candidates: Candidate[] = [];
  state.roster.rows.forEach((row, index) => {
    if (needsVan(row)) {
      indices.push(index);
      candidates.push({ row, associate: state.associateFor(row) });
    }
  });
  const assignable = assignableVehicles(state);
  const eligibleVins = candidates.map((c) =>
    assignable
      .filter((v) => eligible(c, v, state.lmrApproved))
      .map((v) => v.vin)
      .sort(codePointCompare),
  );
  // Read before assignVans, which blanks every row: the candidate's wave time is unchanged by it.
  const result = assignVans(state);
  const entries = candidates.map((cand, i) => {
    const item = result.assignments[i];
    if (!item) throw new Error('The assigner returned fewer answers than drivers.');
    return {
      assignment: {
        assigned: isAssigned(item),
        driver: item.driver,
        method: item.method,
        method_label: methodLabel(item.method),
        reason: item.reason,
        vehicle: vehicleRef(item.vehicle),
      },
      candidate: {
        associate: assocRef(cand.associate),
        clock_key: clockKey(cand.row.waveTime),
        family: candidateFamily(cand),
        needed_qualification: candidateNeededQualification(cand),
        service_type: candidateServiceType(cand),
        tenure: candidateTenure(cand),
        wave_time: cand.row.waveTime,
      },
      driver: cand.row.driver,
      eligible_vins: eligibleVins[i],
      row_index: indices[i],
    };
  });
  const fleet = state.vehicles.rows.map((v) => ({
    category: category(v),
    effective_operational: isOperational(state, v),
    family: vehicleFamily(v),
    is_rental: isRental(v),
    is_step_van: isStepVan(v),
    manual_only: manualOnly(v),
    name: v.name,
    operational: v.operational,
    order_rank: orderRank(v),
    overridden: isOverridden(state, v),
    ownership: v.ownership,
    priority: vehiclePriority(state, v),
    required_qualification: vehicleRequiredQualification(v),
    service_tier: v.serviceTier,
    service_type: v.serviceType,
    vin: v.vin,
  }));
  return norm({
    assignable_vehicles: assignableVehicles(state).map((v) => v.vin),
    assignments: entries,
    available_vehicles_after: availableVehicles(state).map((v) => v.vin),
    available_vehicles_before: beforeAvailable,
    fleet,
    lmr_approved: state.lmrApproved,
    lmr_vehicles: lmrVehicles(state).map((v) => v.vin),
    operational_vehicles: operationalVehicles(state).map((v) => v.vin),
    overridden_count: overriddenCount(state),
    result: {
      assigned: assignedOf(result).length,
      by_method: byMethod(result),
      considered: result.considered,
      loose: looseCount(result),
      unassigned: unassignedOf(result).length,
      vans_available: result.vansAvailable,
    },
    roster_after: state.roster.rows.map((row) => ({
      assign_method: row.assignMethod,
      driver: row.driver,
      vehicle: row.vehicle,
      vin: row.vin,
    })),
  });
}

function exportModule(state: AppState): Json {
  const layouts: Record<string, Json> = {};
  const rows: Record<string, Json> = {};
  const names: Record<string, Json> = {};
  for (const [withDwp, key] of [
    [false, 'plain'],
    [true, 'with_dwp'],
  ] as const) {
    layouts[key] = sheet.layout(withDwp).map((column) => ({
      field: column.field,
      heading: column.heading,
      weight: column.weight,
    }));
    rows[key] = sheet.rowsFor(state.roster, withDwp);
    names[key] = sheet.defaultFilename(state.roster, withDwp);
  }
  return norm({
    carrying_dwp: sheet.carryingDwp(state.roster),
    date_label: rosterDateLabel(state.roster),
    default_filename: names,
    layout: layouts,
    rows,
  });
}

function specDump(
  spec: printing.PrintSpec,
  allRows: printing.PrintRow[],
  dateLabel: string,
  source: string,
): Json {
  const geo = printing.geometry(spec);
  const printingRows = printing.specRowsFor(spec, allRows);
  const widths = printing.columnWidths(spec, geo, printingRows);
  const pages = printing.paginate(printingRows, spec, geo);
  return norm({
    band_count: printing.bandCount(spec, printingRows),
    band_count_no_rows: printing.bandCount(spec),
    bands: printing.bands(spec, widths, geo),
    column_widths: widths,
    column_widths_no_rows: printing.columnWidths(spec, geo, []),
    columns: spec.columns.map((c) => ({
      align: printing.columnAlign(c),
      kind_label: printing.columnKindLabel(c),
      label: printing.columnLabel(c),
      width: printing.columnWidth(c),
    })),
    default_filename: printing.defaultFilename(spec, dateLabel),
    geometry: {
      font_size: geo.fontSize,
      header_h: geo.headerH,
      margin: geo.margin,
      page_h: geo.pageH,
      page_w: geo.pageW,
      row_h: geo.rowH,
      scale: geo.scale,
      title_h: geo.titleH,
      usable_h: printing.usableH(geo),
      usable_w: printing.usableW(geo),
    },
    page_count: printing.pageCount(allRows, spec),
    pages: pages.map((p) => ({
      band: p.band,
      columns: p.columns,
      first_of_band: p.firstOfBand,
      group: p.group,
      row_keys: p.rows.map((r) => r.key),
    })),
    printing_keys: printingRows.map((r) => r.key),
    source,
    spec: printing.specToDict(spec),
    title_for: printing.titleFor(spec, dateLabel),
  });
}

/** The five layouts the old harness builds to push the page math (python_dump.synthetic_specs). */
function syntheticSpecs(rows: printing.PrintRow[]): Array<[string, printing.PrintSpec]> {
  const everyField = (): printing.PrintColumn[] =>
    printing.PRINT_FIELDS.map(([key]) => printing.createPrintColumn({ field: key }));
  const shifts = [
    ...new Set(rows.map((r) => printing.printRowValue(r, 'shift_type') || NO_SHIFT)),
  ].sort(codePointCompare);
  return [
    [
      'synthetic:everything-landscape-no-fit',
      printing.createPrintSpec({
        columns: everyField(),
        paper: 'tabloid',
        orientation: printing.LANDSCAPE,
        fitOnePage: false,
        title: 'Everything',
      }),
    ],
    [
      'synthetic:everything-squeezed-big',
      printing.createPrintSpec({
        columns: everyField(),
        scale: 200,
        sortBy: 'wave_time',
        sortReverse: true,
      }),
    ],
    [
      'synthetic:grouped-by-pad-vans-only',
      printing.createPrintSpec({
        columns: printing.defaultSpec().columns,
        groupBreak: 'pad',
        vansOnly: true,
        sortBy: 'wave_time',
        note: 'A line of my own',
        stripes: true,
        showTitle: false,
      }),
    ],
    [
      'synthetic:narrow-stretched-a4',
      printing.createPrintSpec({
        columns: printing.vansColumns(),
        paper: 'a4',
        stretch: true,
        centerH: false,
        showPageNumbers: false,
        sortBy: 'vehicle',
      }),
    ],
    [
      'synthetic:tick-boxes-leave-offs',
      printing.createPrintSpec({
        columns: [
          printing.createPrintColumn({ kind: printing.CHECKBOX, heading: 'Checked In' }),
          printing.createPrintColumn({ field: 'driver', weight: 140 }),
          printing.createPrintColumn({ field: 'routes', alignOverride: 'C' }),
          printing.createPrintColumn({ kind: printing.BLANK, weight: 90 }),
          printing.createPrintColumn({ field: 'staging_location', heading: 'Where' }),
        ],
        paper: 'legal',
        scale: 60,
        groupBreak: 'shift_type',
        excludedShifts: shifts.slice(0, 1),
        excludedDrivers: rows.slice(0, 2).map((r) => r.key),
        sortBy: 'staging_location',
      }),
    ],
  ];
}

function printingModule(state: AppState, today: IsoDate): Json {
  const rows = state.printRows(today);
  const dateLabel = rosterDateLabel(state.roster);
  const specs: Array<[string, printing.PrintSpec, string]> = [
    ['default', printing.defaultSpec(), 'default_spec()'],
    ['working', state.printSpec(), 'the working layout in the database, else the default'],
  ];
  for (const name of state.printPresets()) {
    const preset = state.printPreset(name);
    if (preset === null) throw new Error('A saved print layout listed by name could not be read.');
    specs.push([`preset:${name}`, preset, 'a layout saved under a name in the database']);
  }
  for (const [name, spec] of syntheticSpecs(rows)) {
    specs.push([name, spec, 'built by the harness to push the page math']);
  }
  const out: Record<string, Json> = {};
  for (const [key, spec, source] of specs) out[key] = specDump(spec, rows, dateLabel, source);
  return norm({
    date_label: dateLabel,
    print_rows: rows.map((r) => ({ key: r.key, values: r.values })),
    specs: out,
  });
}

function helveticaModule(): Json {
  const widths: { regular: Record<string, number>; bold: Record<string, number> } = {
    regular: {},
    bold: {},
  };
  for (let code = 32; code < 256; code += 1) {
    const char = String.fromCodePoint(code);
    widths.regular[String(code)] = printing.measure(char, 1000.0);
    widths.bold[String(code)] = printing.measure(char, 1000.0, true);
  }
  return norm(widths);
}

// --------------------------------------------------------------------- main

/** Write 2b's modules for every day. dump.ts calls this after 2a's modules. */
export default async function dump2b(days: Day[] = loadDays()): Promise<void> {
  for (const day of days) {
    const { ctx } = await mainRun(day);
    try {
      const state = ctx.state;
      const before = availableVehicles(state).map((v) => v.vin);
      writeJson(join(ACTUAL, day.id, 'vans.json'), vansModule(state, before));
      writeJson(join(ACTUAL, day.id, 'export.json'), exportModule(state));
      writeJson(join(ACTUAL, day.id, 'printing.json'), printingModule(state, day.date));
    } finally {
      ctx.close();
    }
  }
  writeJson(join(ACTUAL, 'shared', 'helvetica.json'), helveticaModule());
}
