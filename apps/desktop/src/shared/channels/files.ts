// Picking a file and bringing it in. The reading happens in the main process; the page never
// sees a file's contents, only the counts.

import { filled, oneOf, shape, text } from './check';
import { as, defineCommand } from './define';

/** The six kinds of file the app reads (the schedule, routes and itineraries are route data). */
export const FILE_KINDS = [
  'loadout',
  'associates',
  'tenure',
  'vehicles',
  'dwp',
  'routes',
  'itineraries',
  'schedule',
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** The pages a file can be dropped on. */
export const DROP_PAGES = ['load-out', 'route-data', 'vehicle-data', 'associates'] as const;
export type DropPage = (typeof DROP_PAGES)[number];

/** Which kinds of file each page takes when one is dropped on it. */
export const DROP_KINDS: Record<DropPage, readonly FileKind[]> = {
  'load-out': ['loadout'],
  'route-data': ['routes', 'itineraries', 'schedule', 'dwp'],
  'vehicle-data': ['vehicles'],
  associates: ['associates', 'tenure'],
};

/** How each kind of file is named to the person, and the endings it may have. */
export const FILE_WORDS: Record<
  FileKind,
  {
    /** "a load-out sheet" */ a: string;
    /** "the load-out sheet" */ the: string;
    endings: readonly string[];
  }
> = {
  loadout: { a: 'a load-out sheet', the: 'the load-out sheet', endings: ['.xlsx', '.xlsm'] },
  associates: {
    a: 'an associate export',
    the: 'the associate export',
    endings: ['.csv'],
  },
  tenure: {
    a: 'a Tenured Workforce file',
    the: 'the Tenured Workforce file',
    endings: ['.csv'],
  },
  vehicles: { a: 'a vehicle list', the: 'the vehicle list', endings: ['.xlsx', '.xlsm'] },
  dwp: { a: 'a DWP sheet', the: 'the DWP sheet', endings: ['.xlsx', '.xlsm'] },
  routes: { a: 'a Routes export', the: 'the Routes export', endings: ['.xlsx', '.xlsm'] },
  itineraries: {
    a: 'an Itineraries export',
    the: 'the Itineraries export',
    endings: ['.xlsx', '.xlsm'],
  },
  schedule: {
    a: 'a Weekly Schedule',
    the: 'the Weekly Schedule',
    endings: ['.xlsx', '.xlsm'],
  },
};

/**
 * What the page hands the bridge for a dropped file. The bridge (the preload) turns the file
 * into its place on the computer and sends `{ page, kind, path }` to the main process, so the
 * page itself never sees where the file is.
 */
export interface DropFromPage {
  page: DropPage;
  kind: FileKind;
  file: File;
}

export interface DropResult {
  /**
   * Stands in for the file in `files:import` (`path: token`). It is not a place on the computer:
   * the main process keeps the real one. It ends in the file's name, for the page's messages.
   */
  token: string;
}

export interface PickResult {
  /** Where the person chose a file, or null if they closed the window without choosing. */
  path: string | null;
}

/** What a Tenured Workforce file did to the kept counts (the Associates page says it). */
export interface TenureImportResult {
  /** The file's name, for the message. */
  fileName: string;
  /** Drivers that now have a count kept, from every file so far. */
  kept: number;
  /** The newest week any kept count was read in ("Week 34, 2026"), or ''. */
  keptWeek: string;
  /** The file was older than what was already kept, so the newer counts stayed. */
  older: boolean;
  /** The file's own newest week, or ''. */
  fileWeek: string;
  /** Associates that now carry a count. */
  covered: number;
  /** Associates in the list. */
  associates: number;
}

export interface ImportSummary {
  kind: FileKind;
  /** How many lines came in (drivers, vans, route lines, counts). */
  rows: number;
  /** For a Tenured Workforce file only: what it did to the kept counts. */
  tenure?: TenureImportResult;
}

export const filesChannels = [
  /** Opens the file window, set up for this kind of file. Changes nothing. */
  defineCommand('files:pick', {
    input: shape({ kind: oneOf(FILE_KINDS) }),
    result: as<PickResult>(),
    quiet: true,
  }),
  /**
   * Reads a file that `files:pick` returned and puts it in the day's data, replacing what was
   * there for that kind. When the reader refuses the file, the reply is `{ ok: false, reason:
   * 'refused', message }` and the message is the reader's plain-words text. Asking first is the
   * page's job; this does it.
   */
  defineCommand('files:import', {
    input: shape({ kind: oneOf(FILE_KINDS), path: filled(1024) }),
    result: as<ImportSummary>(),
  }),
  /**
   * A file was dropped on a page. The page sends `{ page, kind, file }`; the bridge sends the
   * main process `{ page, kind, path }`. The main process checks the file (the page takes that
   * kind, the ending fits, it is there, it is one file, it is not too big) and remembers it as
   * chosen. The answer is a token the page then passes to `files:import` as the path. A file
   * that does not fit is refused in plain words. Changes nothing by itself.
   */
  defineCommand('files:dropped', {
    input: shape({ page: oneOf(DROP_PAGES), kind: oneOf(FILE_KINDS), path: text(4096) }),
    result: as<DropResult>(),
    quiet: true,
  }),
] as const;
