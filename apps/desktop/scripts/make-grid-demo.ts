// Writes the made-up rows the grid demo page shows (e2e/support/roster-demo.json), which the table's browser tests draw on the Roster tab.
//
//   npm run demo-data -w @loadout/desktop
//
// Only the made-up files in packages/fixtures/ are read, through the same importers and day
// state the app uses: each fixture day is imported, route data and the DWP are brought over,
// and vans are assigned. The three days together are not enough rows to test a long table, so
// the days are repeated (a "copy" number keeps every row's id apart) until there are 520 rows.
// Nothing is printed except counts.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { padLabel, tenureLabel } from '@loadout/core';
import { fresh, loadDays, MAIN_KIND } from '../../../scripts/parity/ts/harness';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'e2e', 'support', 'roster-demo.json');
const WANTED = 520;

interface DemoRow {
  id: string;
  day: string;
  driver: string;
  shiftType: string;
  transporterId: string;
  tenure: string;
  vans: string;
  check: string;
  routes: string;
  waveTime: string;
  pad: string;
  serviceType: string;
  vehicle: string;
  vin: string;
  matchedOn: string;
  device: string;
  staging: string;
  bags: string;
  ovs: string;
  bag: string;
}

async function main(): Promise<void> {
  const perDay: DemoRow[][] = [];
  for (const day of loadDays()) {
    const ctx = await fresh(day);
    const { state } = ctx;
    state.applyRouteData(MAIN_KIND);
    state.applyDwp();
    state.assignVans();
    perDay.push(
      state.roster.rows.map((row, index) => {
        const associate = state.associateFor(row);
        return {
          id: `${day.id}-${index}`,
          day: day.id,
          driver: row.driver,
          shiftType: row.shiftType,
          transporterId: associate?.transporterId ?? '',
          tenure: associate ? tenureLabel(associate) : '',
          vans: state.vanBadges(associate),
          check: state.checkText(row, day.date),
          routes: row.routes,
          waveTime: row.waveTime,
          pad: padLabel(row),
          serviceType: row.serviceType,
          vehicle: row.vehicle,
          vin: row.vin,
          matchedOn: state.assignMethodLabel(row),
          device: row.device,
          staging: row.stagingLocation,
          bags: row.bags,
          ovs: row.ovs,
          bag: row.bag,
        };
      }),
    );
    ctx.close();
  }

  const rows: DemoRow[] = [];
  for (let copy = 0; rows.length < WANTED; copy += 1) {
    for (const day of perDay) {
      for (const row of day) {
        if (rows.length >= WANTED) break;
        rows.push({ ...row, id: `${row.id}-${copy}` });
      }
    }
  }
  writeFileSync(OUT, JSON.stringify({ note: 'Made-up rows from packages/fixtures.', rows }) + '\n');
  const sizes = perDay.map((day) => day.length).join(', ');
  console.log(`Wrote ${rows.length} made-up rows from ${perDay.length} fixture days (${sizes}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The demo data could not be written.');
  process.exitCode = 1;
});
