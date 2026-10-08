// Reads one file with the matching core reader and feeds the result to the day's state.
// The readers' refusal texts were written for the person using the app ("The selected file is not
// a DWP sheet we can read..."), so they are passed on as they are.

import { basename } from 'node:path';
import { newestWeek, weekLabel, type AppState, type IsoDate, type TenureBook } from '@loadout/core';
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
      return state.importAssociates(await importAssociateData(path)).rows.length;
    case 'tenure':
      return state.importTenure(await importTenureExport(path)).records.size;

    case 'vehicles':
      return state.importVehicles(await importVehicleData(path)).rows.length;
    case 'dwp':
      return state.importDwp(await importDwpSheet(path)).rows.length;
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
    covered: state.associates.rows.filter((associate) => associate.tenure !== null).length,
    associates: state.associates.rows.length,
  };
  return { kind: 'tenure', rows: book.records.size, tenure };
}

/**
 * Brings the file in, replacing what the state held for that kind. When the reader refuses the
 * file, nothing changes and the reader's own words come back as a refusal.
 */
export async function importFile(
  state: AppState,
  kind: FileKind,
  path: string,
  today: IsoDate,
): Promise<ImportSummary> {
  try {
    if (kind === 'tenure') return await readTenure(state, path);
    return { kind, rows: await read(state, kind, path, today) };
  } catch (error) {
    if (READER_ERRORS.some((reader) => error instanceof reader)) {
      throw new ChannelRefusal('refused', (error as Error).message);
    }
    throw error;
  }
}
