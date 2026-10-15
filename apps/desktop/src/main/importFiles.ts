// Reads one file with the matching core reader and feeds the result to the day's state.
// The readers' refusal texts were written for the person using the app ("The selected file is not
// a DWP sheet we can read..."), so they are passed on as they are.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  currentCount,
  newestWeek,
  tenureCount,
  weekLabel,
  type AppState,
  type IsoDate,
  type TenureBook,
} from '@loadout/core';
import {
  AssociateImportError,
  DwpImportError,
  LoadoutImportError,
  RouteDataImportError,
  TenureImportError,
  VehicleImportError,
  importAssociateData,
  importDwpSheet,
  importLoadoutSheet,
  importRouteExport,
  importTenureExport,
  importVehicleData,
} from '@loadout/core/importers';
import type { FileKind, ImportSummary, TenureImportResult } from '../shared/channels/files';
import { ChannelRefusal } from './channels';
import type { RouteSheetsHost } from './routeSheets/host';

const READER_ERRORS = [
  AssociateImportError,
  DwpImportError,
  LoadoutImportError,
  RouteDataImportError,
  TenureImportError,
  VehicleImportError,
];

async function read(
  state: AppState,
  kind: FileKind,
  path: string,
  today: IsoDate,
): Promise<number> {
  switch (kind) {
    case 'loadout':
      return state.importRoster(await importLoadoutSheet(path)).rows.length;
    case 'associates':
      // Reached through readAssociates below.
      throw new ChannelRefusal('not-allowed');
    case 'tenure':
      return state.importTenure(await importTenureExport(path)).records.size;

    case 'vehicles':
      return state.importVehicles(await importVehicleData(path)).rows.length;
    case 'dwp':
      return state.importDwp(await importDwpSheet(path)).rows.length;
    case 'route-sheets':
      // Read by the route sheets of the open data (importRouteSheetsPdf), never here.
      throw new ChannelRefusal('not-allowed');
    case 'routes':
    case 'itineraries':
    case 'schedule': {
      // The weekly schedule is read for the load-out day, else today.
      const dataset = await importRouteExport(kind, path, state.routeDay(today));
      return state.importRouteData(kind, dataset).rows.length;
    }
  }
}

/**
 * A Tenured Workforce file, folded into the kept counts. The kept counts are the truth worth
 * reporting: an old file lands without rolling anyone back, and the answer says when that
 * happened.
 */
async function readTenure(state: AppState, path: string): Promise<ImportSummary> {
  const book: TenureBook = await importTenureExport(path);
  state.importTenure(book);
  const kept = state.tenureBook;
  const fileNewest = newestWeek(book);
  const keptNewest = newestWeek(kept);
  const older =
    fileNewest !== null &&
    keptNewest !== null &&
    (fileNewest[0] < keptNewest[0] ||
      (fileNewest[0] === keptNewest[0] && fileNewest[1] < keptNewest[1]));
  const tenure: TenureImportResult = {
    fileName: basename(path),
    kept: kept.records.size,
    keptWeek: weekLabel(kept),
    older,
    fileWeek: weekLabel(book),
    // Current people only: someone marked offboarded is not on the list to cover.
    covered: tenureCount(state.associates),
    associates: currentCount(state.associates),
  };
  return { kind: 'tenure', rows: book.records.size, tenure };
}

/**
 * An associate export, folded into the one driver list: everyone in the file is added or
 * updated, and anyone with a Transporter ID the file no longer lists is marked offboarded. The
 * rows are the file's; the counts say what changed.
 */
async function readAssociates(state: AppState, path: string): Promise<ImportSummary> {
  const book = await importAssociateData(path);
  const associates = state.importAssociates(book);
  return { kind: 'associates', rows: book.rows.length, associates };
}

/**
 * Brings the file in, replacing what the state held for that kind (the associate export is
 * folded in, see readAssociates). When the reader refuses the file, nothing changes and the
 * reader's own words come back as a refusal.
 */
export async function importFile(
  state: AppState,
  kind: FileKind,
  path: string,
  today: IsoDate,
): Promise<ImportSummary> {
  try {
    if (kind === 'tenure') return await readTenure(state, path);
    if (kind === 'associates') return await readAssociates(state, path);
    return { kind, rows: await read(state, kind, path, today) };
  } catch (error) {
    if (READER_ERRORS.some((reader) => error instanceof reader)) {
      throw new ChannelRefusal('refused', (error as Error).message);
    }
    throw error;
  }
}

/**
 * A route sheet PDF, read into the run for its day. Refusals come back in the old app's words
 * ("No route sheets were found in ...").
 */
export async function importRouteSheetsPdf(
  host: RouteSheetsHost,
  path: string,
): Promise<ImportSummary> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    throw new ChannelRefusal(
      'refused',
      'That file could not be found. It may have been moved or deleted.',
    );
  }
  const result = await host.importPdf(bytes, basename(path));
  const sheets = host.counts().sheets;
  return { kind: 'route-sheets', rows: sheets, routeSheets: result };
}
