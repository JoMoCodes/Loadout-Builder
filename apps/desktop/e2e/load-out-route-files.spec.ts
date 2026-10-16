// The route files' tabs on Load Out (they were the Route Data page), driven in a real browser on
// the stand-in bridge: a tab for each loaded file, bringing a file in with Import Route Data, the
// shared route and PAD windows, PADs from the schedule, clearing, and the DWP tab. The stand-in
// does not run the core, so these prove the page; the rules are proved by the core's tests and by
// the Electron smoke check.

import { expect, test, type Page } from '@playwright/test';
import {
  BARRETT,
  CARMEN,
  COLTON,
  ZANE,
  associate,
  choosesFile,
  commandChanges,
  commandRefuses,
  entry,
  openPage,
  routeSet,
} from './support/pageData';
import { callsTo, onCall } from './support/fakeBridge';
import { demoRosterRows } from './support/rosterRows';

const status = (page: Page) => page.getByTestId('load-out-status');
const rowsOf = (page: Page) => page.locator('[role="rowgroup"] [role="row"]');
const tab = (page: Page, id: string) => page.locator(`[data-tab-button="${id}"]`);
const problem = (page: Page) => page.getByTestId('load-out-import-problem');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);

const KNOWN = [associate(CARMEN), associate(BARRETT), associate(COLTON)];

const ROUTE_ROWS = [
  entry({
    transporterId: CARMEN.id,
    driverName: CARMEN.name,
    routeCode: 'CX1',
    dispatchTime: '9:50am',
    serviceType: 'Electric Vehicle',
    detail: 'Started',
  }),
  entry({
    transporterId: BARRETT.id,
    driverName: BARRETT.name,
    routeCode: 'CX2',
    dispatchTime: '9:50am',
    serviceType: 'Electric Vehicle',
  }),
  entry({
    transporterId: COLTON.id,
    driverName: COLTON.name,
    sharedDrivers: `${COLTON.name}|${ZANE.name}`,
    sharedIds: `${COLTON.id}|${ZANE.id}`,
    routeCode: 'CX3',
    dispatchTime: '10:20am',
  }),
  entry({
    transporterId: 'A-NOT-LISTED',
    driverName: 'Someone Unlisted',
    routeCode: 'CX4',
    dispatchTime: '10:20am',
  }),
];

async function openRoutes(page: Page, rows: Array<Record<string, unknown>> = [], extra = {}) {
  await openPage(page, 'load-out', {
    snapshot: {
      associates: KNOWN as never,
      routeSets: [
        routeSet('routes', rows, extra),
        routeSet('itineraries', []),
        routeSet('schedule', []),
      ] as never,
    },
  });
  // The Routes tab is there only while a Routes file is loaded.
  if (rows.length > 0) await tab(page, 'routes').click();
}

/** Import Route Data on the Roster, then Choose on the Routes box. */
async function importRoutes(page: Page) {
  await page.getByRole('button', { name: 'Import Route Data' }).click();
  await page.getByTestId('choose-routes').click();
}

/** Says Not today to the DWP question at the end of Import Route Data. */
async function notToday(page: Page) {
  await page.getByTestId('dwp-not-today').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test('a file has a tab on Load Out only while it is loaded, right after the Roster', async ({
  page,
}) => {
  await openRoutes(page);
  await expect(tab(page, 'routes')).toHaveCount(0);
  await expect(tab(page, 'dwp')).toHaveCount(0);

  await openPage(page, 'load-out', {
    snapshot: {
      associates: KNOWN as never,
      routeSets: [
        routeSet('routes', ROUTE_ROWS),
        routeSet('itineraries', ROUTE_ROWS),
        routeSet('schedule', []),
      ] as never,
    },
  });
  const tabs = page.getByRole('tab');
  expect((await tabs.allInnerTexts()).slice(0, 3)).toEqual(['Roster', 'Routes', 'Itineraries']);

  await tab(page, 'itineraries').click();
  // Only the Itineraries tab has the button that takes PADs from the schedule.
  await expect(page.getByTestId('pads-from-schedule')).toBeVisible();
  await tab(page, 'routes').click();
  await expect(page.getByTestId('pads-from-schedule')).toHaveCount(0);
  // The file comes in on the Roster now, not on its own tab.
  await expect(page.getByTestId('import-routes')).toHaveCount(0);
});

test('shows an export with the old columns, a header that counts, and the old colours', async ({
  page,
}) => {
  await openRoutes(page, ROUTE_ROWS, { pads: [['9:50am', 1]] });
  await expect(page.getByTestId('route-routes-title')).toContainText('Routes  -  ');
  await expect(page.getByTestId('route-routes-sub')).toContainText('routes-export.xlsx');
  await expect(page.getByTestId('route-routes-metric')).toHaveText('4 rows  -  2 dispatch times');
  await expect(page.getByTestId('route-routes-detail-0')).toHaveText(
    '9:50am -> PAD 1 (2)   10:20am -> unassigned (2)',
  );
  await expect(page.getByTestId('route-routes-detail-1')).toHaveText(
    '1 shared with another driver   1 not in associate data',
  );

  const headings = await page.locator('[role="columnheader"]').allInnerTexts();
  expect(headings.map((text) => text.trim())).toEqual([
    'Driver',
    'Transporter ID',
    'Route',
    'Dispatch Time',
    'PAD',
    'Service Type',
    'Progress',
  ]);

  // Amber for an ID with no associate behind it, grey with no PAD, plain with one.
  const tone = (route: string) =>
    page.locator('[role="row"]', { hasText: route }).getAttribute('data-tone');
  expect(await tone('CX1')).toBeNull();
  expect(await tone('CX4')).toBe('warn');
  expect(await tone('CX3')).toBe('ghost');

  // A shared route reads "name (+1 more)".
  await expect(page.locator('[data-col-id="driver_name"]', { hasText: '(+1 more)' })).toHaveText(
    `${COLTON.name}   (+1 more)`,
  );
  await expect(page.locator('[data-col-id="pad"]', { hasText: 'PAD 1' })).toHaveCount(2);
});

test('the PAD drop-down narrows the table, and Reset puts it back', async ({ page }) => {
  await openRoutes(page, ROUTE_ROWS, { pads: [['9:50am', 1]] });
  await expect(page.getByText('Showing 4 of 4')).toBeVisible();
  await page.getByTestId('pad-filter-routes').selectOption('PAD 1');
  await expect(page.getByText('Showing 2 of 4')).toBeVisible();
  await page.getByTestId('pad-filter-routes').selectOption('Unassigned');
  await expect(page.getByText('Showing 2 of 4')).toBeVisible();
  await expect(rowsOf(page).first()).toContainText('CX3');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('pad-filter-routes')).toHaveValue('All PADs');
  await expect(page.getByText('Showing 4 of 4')).toBeVisible();
});

test('Import Route Data asks who shared routes belong to, then which PAD each time is in', async ({
  page,
}) => {
  await openRoutes(page);
  await choosesFile(page, 'C:\\Downloads\\Routes_XXX1_2026-09-11.xlsx');
  await commandChanges(
    page,
    'files:import',
    {
      routeSets: [
        routeSet('routes', ROUTE_ROWS),
        routeSet('itineraries', []),
        routeSet('schedule', []),
      ],
    },
    { kind: 'routes', rows: 4 },
  );

  await importRoutes(page);
  await expect.poll(() => callsTo(page, 'files:pick')).toEqual([{ kind: 'routes' }]);
  await expect
    .poll(() => callsTo(page, 'files:import'))
    .toEqual([{ kind: 'routes', path: 'C:\\Downloads\\Routes_XXX1_2026-09-11.xlsx' }]);

  // The shared routes first.
  const shared = dialog(page, 'shared-routes');
  await expect(shared).toBeVisible();
  await expect(shared).toContainText('1 route came through with more than one driver');
  await expect(shared).toContainText(
    'Pick who each one is assigned to - the van and the roster row follow that choice.',
  );
  await expect(shared.getByLabel(COLTON.name)).toBeChecked();
  await shared.getByLabel(ZANE.name).check();

  await onCall(
    page,
    'routeData:set-route-drivers',
    `(input) => {
      window.__setDriverInput = input;
      return { ok: true, value: { set: input.choices.length } };
    }`,
  );
  await shared.getByRole('button', { name: 'Save' }).click();
  const [driverCall] = (await callsTo(page, 'routeData:set-route-drivers')) as Array<{
    kind: string;
    revision: number;
    choices: unknown[];
  }>;
  expect(driverCall).toMatchObject({
    kind: 'routes',
    choices: [{ rowIndex: 2, transporterId: ZANE.id }],
  });
  // The revision is the one the page had read, so the app can tell if the table moved on.
  expect(typeof driverCall!.revision).toBe('number');
  await expect(status(page)).toHaveText('Assigned 1 shared route(s) to one driver each.');

  // Then the PADs.
  const pads = dialog(page, 'assign-pads');
  await expect(pads).toBeVisible();
  await expect(pads).toContainText('2 dispatch times in this export');
  await expect(pads).toContainText('Put each time into a PAD.');
  await expect(pads.locator('fieldset[data-time="9:50am"]')).toContainText('2 drivers');
  await pads.locator('[data-testid="pad-9:50am-1"]').check();
  await pads.locator('[data-testid="pad-10:20am-2"]').check();

  await commandChanges(page, 'routeData:set-pads', {
    routeSets: [
      routeSet('routes', ROUTE_ROWS, {
        pads: [
          ['9:50am', 1],
          ['10:20am', 2],
        ],
      }),
      routeSet('itineraries', []),
      routeSet('schedule', []),
    ],
  });
  await pads.getByRole('button', { name: 'Save' }).click();
  expect(await callsTo(page, 'routeData:set-pads')).toEqual([
    { kind: 'routes', pads: { '9:50am': 1, '10:20am': 2 } },
  ]);
  // With no roster yet, there is nothing to put the routes on: it says so, then asks for DWP.
  await notToday(page);
  await expect(status(page)).toHaveText(
    'Import a load-out sheet, then use Import Route Data again to put it on the roster.',
  );
  await tab(page, 'routes').click();
  await expect(page.getByTestId('route-routes-detail-0')).toContainText('9:50am -> PAD 1 (2)');
});

test('skipping both windows costs nothing, and says how to come back to them', async ({ page }) => {
  await openRoutes(page);
  await choosesFile(page, 'C:\\Downloads\\Routes_XXX1_2026-09-11.xlsx');
  await commandChanges(
    page,
    'files:import',
    {
      routeSets: [
        routeSet('routes', ROUTE_ROWS),
        routeSet('itineraries', []),
        routeSet('schedule', []),
      ],
    },
    { kind: 'routes', rows: 4 },
  );
  await importRoutes(page);

  await dialog(page, 'shared-routes').getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page, 'assign-pads')).toBeVisible();
  await dialog(page, 'assign-pads').getByRole('button', { name: 'Cancel' }).click();
  await notToday(page);

  expect(await callsTo(page, 'routeData:set-route-drivers')).toEqual([]);
  expect(await callsTo(page, 'routeData:set-pads')).toEqual([]);
  // The file did come in, with its own tab, and Assign PADs is there for later.
  await tab(page, 'routes').click();
  await expect(page.getByTestId('route-routes-metric')).toHaveText('4 rows  -  2 dispatch times');
  await expect(page.getByTestId('assign-pads-routes')).toBeVisible();
});

test('closing the file window, or a file the reader refuses, changes nothing and says so in plain words', async ({
  page,
}) => {
  await openRoutes(page);
  await choosesFile(page, null);
  await importRoutes(page);
  await expect.poll(() => callsTo(page, 'files:pick')).toHaveLength(1);
  expect(await callsTo(page, 'files:import')).toEqual([]);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(problem(page)).toHaveCount(0);

  await choosesFile(page, 'C:\\Downloads\\not-a-route-file.xlsx');
  await commandRefuses(
    page,
    'files:import',
    'The selected file is not a Routes export we can read.',
  );
  await importRoutes(page);
  await expect(problem(page)).toContainText('Import failed');
  await expect(problem(page)).toContainText(
    'The selected file is not a Routes export we can read.',
  );
  await expect(status(page)).toHaveText('Import failed.');
  await page.getByRole('button', { name: 'Close this message' }).click();
  await expect(problem(page)).toHaveCount(0);
});

test('Assign PADs reopens the window with what was chosen, and asks before leaving a time empty', async ({
  page,
}) => {
  await openRoutes(page, ROUTE_ROWS, { pads: [['9:50am', 3]] });
  await page.getByTestId('assign-pads-routes').click();
  const pads = dialog(page, 'assign-pads');
  await expect(pads).toBeVisible();
  await expect(pads.locator('[data-testid="pad-9:50am-3"]')).toBeChecked();
  await expect(pads.locator('[data-testid="pad-10:20am-none"]')).toBeChecked();

  // Save with a time left on None: the old question comes first.
  await pads.getByRole('button', { name: 'Save' }).click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Leave times unassigned?');
  await expect(ask).toContainText('No PAD chosen for: 10:20am.');
  await ask.getByRole('button', { name: 'No' }).click();
  await expect(pads).toBeVisible();
  expect(await callsTo(page, 'routeData:set-pads')).toEqual([]);

  // Clear all, then Save anyway.
  await pads.getByRole('button', { name: 'Clear all' }).click();
  await expect(pads.locator('[data-testid="pad-9:50am-none"]')).toBeChecked();
  await commandChanges(page, 'routeData:set-pads', null);
  await pads.getByRole('button', { name: 'Save' }).click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes' }).click();
  expect(await callsTo(page, 'routeData:set-pads')).toEqual([{ kind: 'routes', pads: {} }]);
  await expect(status(page)).toHaveText(
    'Routes: 0 of 4 drivers placed in a PAD. 4 still unassigned.',
  );
});

test('double-clicking a row opens the PAD window too', async ({ page }) => {
  await openRoutes(page, ROUTE_ROWS);
  await page.locator('[role="gridcell"][data-col-id="route_code"]').first().dblclick();
  await expect(dialog(page, 'assign-pads')).toBeVisible();
});

test('right-clicking the Driver column of a shared route reopens the choice, and says when there is none', async ({
  page,
}) => {
  await openRoutes(page, ROUTE_ROWS);
  const sharedRow = page.locator('[role="row"]', { hasText: 'CX3' });

  await page
    .locator('[role="row"]', { hasText: 'CX1' })
    .locator('[data-col-id="driver_name"]')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Who is this route assigned to?...' }).click();
  await expect(status(page)).toHaveText('CX1 came through with one driver - nothing to choose.');

  await sharedRow.locator('[data-col-id="transporter_id"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Who is this route assigned to?...' }).click();
  const shared = dialog(page, 'shared-routes');
  await expect(shared).toBeVisible();
  await shared.getByLabel(ZANE.name).check();
  await onCall(
    page,
    'routeData:set-route-drivers',
    `(input) => ({ ok: true, value: { set: input.choices.length } })`,
  );
  await shared.getByRole('button', { name: 'Save' }).click();
  await expect(status(page)).toHaveText(`CX3 is assigned to ${ZANE.name}.`);

  // Any other column explains where to click.
  await sharedRow.locator('[data-col-id="route_code"]').click({ button: 'right' });
  await expect(page.getByText('Right-click the Driver or Transporter ID column')).toBeVisible();
});

test('PADs from Schedule says how many came over, how many have no PAD there and how many are not on it', async ({
  page,
}) => {
  await openPage(page, 'load-out', {
    snapshot: {
      associates: KNOWN as never,
      routeSets: [
        routeSet('routes', []),
        routeSet('itineraries', ROUTE_ROWS),
        routeSet('schedule', [entry({ transporterId: CARMEN.id, dispatchTime: '9:55am' })], {
          pads: [['9:55am', 2]],
        }),
      ] as never,
    },
  });
  await tab(page, 'itineraries').click();

  await onCall(
    page,
    'routeData:adopt-schedule-pads',
    `() => ({ ok: true, value: { copied: 2, noPad: 1, missing: 1, total: 4 } })`,
  );
  await page.getByTestId('pads-from-schedule').click();
  expect(await callsTo(page, 'routeData:adopt-schedule-pads')).toEqual([{ kind: 'itineraries' }]);
  await expect(status(page)).toHaveText(
    '2 of 4 PADs copied from the Weekly Schedule. 1 scheduled but with no PAD there. 1 not on the schedule.',
  );

  // When the app stops it, the old words are the status.
  await commandRefuses(
    page,
    'routeData:adopt-schedule-pads',
    'The Weekly Schedule has no PADs assigned yet - use Assign PADs on its tab first.',
  );
  await page.getByTestId('pads-from-schedule').click();
  await expect(status(page)).toHaveText(
    'The Weekly Schedule has no PADs assigned yet - use Assign PADs on its tab first.',
  );
});

test("Clear on a file's tab asks first, keeps it if you say no, and empties only that file if you say yes", async ({
  page,
}) => {
  await openRoutes(page, ROUTE_ROWS);
  await page.getByTestId('clear-routes').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Clear Routes?');
  await expect(ask).toContainText('Remove all 4 rows and their PAD assignments?');
  await expect(ask).toContainText('The other route files and the roster are kept.');
  await ask.getByRole('button', { name: 'No, keep it' }).click();
  expect(await callsTo(page, 'routeData:clear')).toEqual([]);

  await commandChanges(page, 'routeData:clear', {
    routeSets: [routeSet('routes', []), routeSet('itineraries', []), routeSet('schedule', [])],
  });
  await page.getByTestId('clear-routes').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'routeData:clear')).toEqual([{ kind: 'routes' }]);
  await expect(status(page)).toHaveText('Routes cleared.');
  // With the file gone, so is its tab: the Roster shows instead.
  await expect(tab(page, 'routes')).toHaveCount(0);
  await expect(tab(page, 'roster')).toHaveAttribute('aria-selected', 'true');
});

// ----------------------------------------------------------------------------------- DWP

const DWP_ROWS = [
  { routeCode: 'CX1', bags: '12', ovs: '1', staging: 'STG.A01' },
  { routeCode: 'CX2', bags: '9', ovs: '', staging: 'STG.A02' },
  { routeCode: 'CX9', bags: '4', ovs: '', staging: 'STG.B07' },
  { routeCode: 'cx 1', bags: '3', ovs: '', staging: 'STG.A09' },
];

function dwpSnapshot(over: Record<string, unknown> = {}, day: string | null = '2026-09-11') {
  return {
    loadOutDate: '2026-09-11',
    roster: {
      sourceFile: '',
      importedAt: null,
      routeSource: '',
      // Three made-up drivers, on routes CX1, cx2 and none (the Roster tab draws them too).
      rows: demoRosterRows(3).map((view, i) => ({
        ...view,
        row: { ...view.row, routes: ['CX1', 'cx2', ''][i]! },
      })),
    },
    dwp: {
      set: {
        rows: DWP_ROWS,
        day,
        sourceFile: 'C:\\Downloads\\DWP_DSP-XXXX_09-11-2026.xlsx',
        importedAt: null,
      },
      matchedCount: 2,
      dayStatus: day === '2026-09-11' ? 'ok' : day === null ? 'unknown' : 'mismatch',
    },
    ...over,
  };
}

test('the DWP tab says how many drivers matched, calls out a route listed twice and greys what is not on the roster', async ({
  page,
}) => {
  await openPage(page, 'load-out', { snapshot: dwpSnapshot() as never });
  await tab(page, 'dwp').click();
  await expect(page.getByTestId('dwp-title')).toHaveText('DWP  -  bags, OVS and staging by route');
  await expect(page.getByTestId('dwp-sub')).toContainText('DWP_DSP-XXXX_09-11-2026.xlsx');
  await expect(page.getByTestId('dwp-metric')).toHaveText('4 routes');
  await expect(page.getByTestId('dwp-detail-0')).toHaveText('2 of 3 drivers matched by route code');
  await expect(page.getByTestId('dwp-detail-1')).toHaveText('1 route code(s) listed twice');

  const headings = await page.locator('[role="columnheader"]').allInnerTexts();
  expect(headings.map((text) => text.trim())).toEqual(['Route Code', 'Bags', 'OVS', 'Staging']);
  const tone = (code: string) =>
    page.locator('[role="row"]', { hasText: code }).getAttribute('data-tone');
  expect(await tone('CX1')).toBeNull();
  expect(await tone('CX9')).toBe('ghost');

  // "Not on the roster" keeps only the routes nobody on the roster runs.
  await page.getByTestId('dwp-not-on-roster').check();
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('dwp-not-on-roster')).not.toBeChecked();
  await expect(page.getByText('Showing 4 of 4')).toBeVisible();
});

test('the DWP tab says whether the sheet is the roster’s day', async ({ page }) => {
  await openPage(page, 'load-out', { snapshot: dwpSnapshot() as never });
  await tab(page, 'dwp').click();
  await expect(page.getByTestId('dwp-day')).toContainText("Matches the roster's day");

  await page.evaluate(() => {
    const w = window as unknown as {
      __change: (p: unknown) => void;
      __fake: { snapshot: { dwp: { set: object } } };
    };
    w.__change({
      loadOutDate: '2026-09-14',
      dwp: {
        set: { ...w.__fake.snapshot.dwp.set, day: '2026-09-11' },
        matchedCount: 0,
        dayStatus: 'mismatch',
      },
    });
  });
  await expect(page.getByTestId('dwp-day-text')).toHaveText(
    'DWP_DSP-XXXX_09-11-2026.xlsx is for Friday, September 11 2026. The roster is for Monday, September 14 2026.',
  );
  await expect(page.getByTestId('dwp-day')).toContainText('Wrong day');

  await page.evaluate(() => {
    const w = window as unknown as {
      __change: (p: unknown) => void;
      __fake: { snapshot: { dwp: { set: object } } };
    };
    w.__change({
      dwp: {
        set: { ...w.__fake.snapshot.dwp.set, day: null },
        matchedCount: 0,
        dayStatus: 'unknown',
      },
    });
  });
  await expect(page.getByTestId('dwp-day-text')).toHaveText(
    "Can't tell which day DWP_DSP-XXXX_09-11-2026.xlsx is for - a DWP sheet carries no date inside it, and this one's file name doesn't say either. The roster is for Monday, September 14 2026.",
  );
});

test('clearing the DWP sheet asks first', async ({ page }) => {
  await openPage(page, 'load-out', { snapshot: dwpSnapshot() as never });
  await tab(page, 'dwp').click();
  await page.getByTestId('clear-dwp').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Clear DWP?');
  await expect(ask).toContainText(
    'Remove all 4 routes and take staging, bags and OVS off the roster?',
  );
  await ask.getByRole('button', { name: 'No, keep it' }).click();
  expect(await callsTo(page, 'loadOut:clear-route-data')).toEqual([]);

  await commandChanges(page, 'loadOut:clear-route-data', {
    dwp: {
      set: { rows: [], day: null, sourceFile: '', importedAt: null },
      matchedCount: 0,
      dayStatus: 'unknown',
    },
  });
  await page.getByTestId('clear-dwp').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'loadOut:clear-route-data')).toEqual([{ routes: false, dwp: true }]);
  await expect(status(page)).toHaveText('DWP cleared.');
  await expect(tab(page, 'dwp')).toHaveCount(0);
});
