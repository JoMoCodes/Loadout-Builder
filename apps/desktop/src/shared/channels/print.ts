// Channels for the Print tab and the two fixed exports (Export Roster, Export with DWP).
//
// A layout crosses as its saved form (snake_case, what `printing.specToDict` gives) and comes back
// as a `PrintSpec`: the main process reads it with the same reconciling reader a saved layout goes
// through, so anything it cannot honour is dropped rather than trusted. File paths never cross:
// every command that writes a file opens the save window itself, in the main process.

import type { printing } from '@loadout/core';
import { anyObject, boolean, filled, nothing, shape } from './check';
import { as, defineCommand, defineQuery } from './define';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;

/** What the Print tab draws from: today's drivers as the printed sheet wants them. */
export interface PrintRowsView {
  /** One per driver, every field as the text that prints (empty, never "-"). */
  rows: PrintRow[];
  /** The day, as the title and the file names carry it. */
  dateLabel: string;
  rosterEmpty: boolean;
  /** Shift type (or "(no shift type)") to how many drivers have it, A to Z ignoring case. */
  shiftCounts: Array<[string, number]>;
  /** Drivers carrying bags, OVS or staging (what Export with DWP would print). */
  carryingDwp: number;
  /** A DWP sheet is loaded. */
  dwpLoaded: boolean;
}

/** What a Print Page or Print Vans did. */
export type PrintOutcome =
  | { status: 'cancelled' }
  | {
      status: 'written';
      /** The file's name (no folder). */
      fileName: string;
      drivers: number;
      pages: number;
      /** Drivers on the roster who are not on the sheet. */
      leftOff: number;
      /** Asked to open it, and it did not open. */
      openFailed: boolean;
    };

/** What an export did. */
export type ExportOutcome =
  | { status: 'cancelled' }
  /**
   * Nothing written, and why: no roster, or (Export with DWP) no driver carries staging, bags or
   * OVS, with or without a DWP sheet loaded. The page puts it in words.
   */
  | { status: 'nothing'; reason: 'no-roster' | 'no-dwp-on-roster' | 'no-dwp-sheet' }
  | { status: 'written'; fileName: string; drivers: number; carryingDwp: number };

const layout = anyObject;
const name = filled(80);

export const printChannels = [
  /** Today's drivers as the sheet wants them, and the day. Changes nothing. */
  defineQuery('print:rows', { input: nothing, result: as<PrintRowsView>() }),
  /** Remembers the layout the tab is showing (the unnamed working layout). */
  defineCommand('print:set-spec', {
    input: shape({ spec: layout }),
    result: as<PrintSpec>(),
    quiet: true,
  }),
  /** Saves the layout under a name (replacing one of that name). Answers the names. */
  defineCommand('print:save-preset', {
    input: shape({ name, spec: layout }),
    result: as<string[]>(),
  }),
  /** Puts a saved layout on the tab (it becomes the working layout too). */
  defineCommand('print:load-preset', { input: shape({ name }), result: as<PrintSpec>() }),
  /** Forgets a saved layout. What is on the tab stays. Answers the names left. */
  defineCommand('print:delete-preset', { input: shape({ name }), result: as<string[]>() }),
  /** Puts the tab back to the sheet it started with. Saved layouts are kept. */
  defineCommand('print:reset', { input: nothing, result: as<PrintSpec>() }),
  /**
   * Print Page (or Print Vans, with `vans`): asks where to save it, then writes the .pdf or .xlsx
   * the name asks for, and opens it if `openAfter`.
   */
  defineCommand('print:print', {
    input: shape({ spec: layout, vans: boolean, openAfter: boolean }),
    result: as<PrintOutcome>(),
    quiet: true,
  }),
  /** Preview: writes the sheet to a temporary PDF and opens it. */
  defineCommand('print:preview', {
    input: shape({ spec: layout }),
    result: as<{ drivers: number; pages: number; openFailed: boolean }>(),
    quiet: true,
  }),
  /** Export Roster (or Export with DWP): asks where to save it, then writes it. */
  defineCommand('print:export', {
    input: shape({ withDwp: boolean }),
    result: as<ExportOutcome>(),
    quiet: true,
  }),
] as const;
