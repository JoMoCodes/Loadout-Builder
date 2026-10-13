// Demo mode's made-up route sheet day: the fixture Routes export goes onto the Route Data page,
// the fixture driver list is brought in if the demo data has none, and the synthetic route sheet
// PDF is read into a run. A trainee can then click through Distribute and Sheets. All of it goes
// into the throwaway demo copy of the database; the person's real data is never touched.

import { join } from 'node:path';
import { dispatchTimes, type AppState, type IsoDate } from '@loadout/core';
import { importFile, importRouteSheetsPdf } from '../importFiles';
import type { RouteSheetsHost } from './host';

const ROUTES_FILE = ['routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx'];
const DRIVERS_FILE = ['associates', 'AssociateData.csv'];
const PDF_FILE = ['route-sheets', '2026-09-01.pdf'];

/**
 * Brings the made-up day in from the fixtures folder (the one that holds `routes`, `associates`
 * and `route-sheets`). Returns how many route sheets were read (a count, for the log).
 */
export async function loadDemoRouteSheets(
  state: AppState,
  host: RouteSheetsHost,
  folder: string,
  today: IsoDate,
): Promise<number> {
  await importFile(state, 'routes', join(folder, ...ROUTES_FILE), today);
  // PADs for the made-up day's dispatch times (1, 2, 3, ... in clock order), the way the PAD
  // window sets them, so the demo emails show a pad box.
  const pads: Record<string, number> = {};
  dispatchTimes(state.routeSet('routes'))
    .filter(([time]) => time !== '')
    .forEach(([time], index) => {
      pads[time] = index + 1;
    });
  state.setPads('routes', pads);
  // The demo copy has its own driver list; only a copy without one needs the fixture list.
  if (state.associates.rows.length === 0) {
    await importFile(state, 'associates', join(folder, ...DRIVERS_FILE), today);
  }
  await importRouteSheetsPdf(host, join(folder, ...PDF_FILE));
  return host.counts().sheets;
}
