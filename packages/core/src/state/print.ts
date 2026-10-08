// The print side of the day's state: today's roster as the printed sheet wants it, and the saved
// print layouts.
//
// Ported from the print methods of the old app's AppState (state.py). Each takes the state as its
// first argument and `AppState` delegates to them.

import { driverKey } from '../matching/matching';
import { tenureLabel, type Associate } from '../models/associates';
import type { IsoDate } from '../models/dates';
import type { DriverRow } from '../models/roster';
import {
  defaultSpec,
  specFromJson,
  specToJson,
  type PrintRow,
  type PrintSpec,
} from '../printing/printing';
import type { AppState } from './appState';
import { assignMethodLabel } from './vans';

/** Python `Store.WORKING_LAYOUT`: the layout the Print tab was last left on has no name. */
export const WORKING_LAYOUT = '';

/**
 * `_print_key`: what the Print tab files a driver's "leave them off" under. The Transporter ID
 * wherever there is one, so it survives re-importing the sheet; the normalised name otherwise.
 * Prefixed, so a name can never be read as an ID.
 */
export function printKey(row: DriverRow, associate: Associate | null): string {
  if (associate !== null && associate.transporterId) return `id:${associate.transporterId}`;
  return `name:${driverKey(row.driver)}`;
}

/**
 * Today's roster as the printed sheet wants it: one row, every field. Cells are empty where there
 * is nothing, rather than carrying the table's '-'. `today` is for the Check column.
 */
export function printRows(state: AppState, today: IsoDate): PrintRow[] {
  return state.roster.rows.map((row) => {
    const associate = state.associateFor(row);
    return {
      key: printKey(row, associate),
      values: {
        driver: row.driver,
        shift_type: row.shiftType,
        transporter_id: associate ? associate.transporterId : '',
        tenure: associate ? tenureLabel(associate) : '',
        vans: state.vanBadges(associate),
        check: state.checkText(row, today),
        routes: row.routes,
        wave_time: row.waveTime,
        // The heading already says PAD, so the cell carries the number on its own.
        pad: row.pad,
        service_type: row.serviceType,
        vehicle: row.vehicle,
        vin: row.vin,
        assign_method: assignMethodLabel(row),
        device: row.device,
        staging_location: row.stagingLocation,
        bags: row.bags,
        ovs: row.ovs,
        bag: row.bag,
      },
    };
  });
}

/** How the Print tab was last left. The default layout if never touched. */
export function printSpec(state: AppState): PrintSpec {
  const stored = state.store.loadPrintLayout(WORKING_LAYOUT);
  return stored ? specFromJson(stored) : defaultSpec();
}

/** Remember the layout the Print tab is showing. Outside `notify`: it changes one tab only. */
export function setPrintSpec(state: AppState, spec: PrintSpec): void {
  state.store.savePrintLayout(WORKING_LAYOUT, specToJson(spec));
}

export function printPreset(state: AppState, name: string): PrintSpec | null {
  const stored = state.store.loadPrintLayout(name);
  return stored ? specFromJson(stored) : null;
}

export function savePrintPreset(state: AppState, name: string, spec: PrintSpec): void {
  state.store.savePrintLayout(name, specToJson(spec));
}
