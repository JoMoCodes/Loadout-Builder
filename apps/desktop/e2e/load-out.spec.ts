// The Load Out page in a plain browser, with the stand-in bridge holding a small made-up day
// (e2e/support/loadOutDay.ts). It proves the page: the tabs, the buttons, the menus, the windows
// and the filters, and that each one sends the right command. The rules behind the commands are
// proved by the core's tests, the handler tests and the Electron smoke check.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';
import { IDS, loadOutDay, VINS, withMaps } from './support/loadOutDay';

async function open(page: Page, changes: Record<string, unknown> = {}) {
  await installFakeBridge(page, { snapshot: { ...loadOutDay(), ...changes } });
  await withMaps(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'load-out');
    window.localStorage.setItem('loadout.load-out-tab', 'roster');
  });
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Roster' })).toBeVisible();
}

const status = (page: Page) => page.getByTestId('load-out-status');

/** What the app does on a hand move, in the stand-in: trade the fields, then say it changed. */
const tradeFields = (fields: string[]) => `(input) => {
  const rows = window.__fake.snapshot.roster.rows;
  const a = rows[input.from].row;
  const b = rows[input.to].row;
  for (const field of ${JSON.stringify(fields)}) {
    const held = a[field];
    a[field] = b[field];
    b[field] = held;
  }
  return { ok: true, value: null };
}`;
const HAND_OVER = tradeFields([
  'routes',
  'serviceType',
  'waveTime',
  'pad',
  'vehicle',
  'vin',
  'stagingLocation',
  'bags',
  'ovs',
]);
const HAND_OVER_VAN = tradeFields(['vehicle', 'vin']);
const cell = (page: Page, driver: string, column: string) =>
  page
    .locator('[role="row"]', { has: page.locator(`[data-col-id="driver"]`, { hasText: driver }) })
    .locator(`[data-col-id="${column}"]`);
const menuItems = (page: Page) => page.getByRole('menu').getByRole('menuitem').allInnerTexts();

async function rightClick(page: Page, driver: string, column: string) {
  await cell(page, driver, column).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
}

test('the page has four tabs, and remembers the one you were on', async ({ page }) => {
  await open(page);
  const tabs = page.getByRole('tab');
  expect(await tabs.allInnerTexts()).toEqual([
    'Roster',
    'Print',
    'Available Vans',
    'Previous Roster',
  ]);
  await page.getByRole('tab', { name: 'Print' }).click();
  // The Print tab is mounted in its place (its own tests are in print-tab.spec.ts).
  await expect(page.locator('[data-tab="print"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Available Vans' }).click();
  await page.click('[data-nav="home"]');
  await page.click('[data-nav="load-out"]');
  await expect(page.getByRole('tab', { name: 'Available Vans' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the Roster shows the old columns in the old order, with the header the old app had', async ({
  page,
}) => {
  await open(page);
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Driver',
    'Shift Type',
    'Transporter ID',
    'Lifetime Routes',
    'Vans',
    'Check',
    'Routes',
    'Wave Time',
    'PAD',
    'Service Type',
    'Vehicle',
    'VIN',
    'Matched On',
    'Device',
    'Staging',
    'Bags',
    'OVS',
    'Bag',
  ]);
  await expect(page.getByTestId('roster-title')).toHaveText('Load Out - Friday, September 11 2026');
  await expect(page.getByTestId('roster-source')).toHaveText('2026_09_11_17_37_loadout_sheet.xlsx');
  await expect(page.getByTestId('roster-count')).toHaveText('5 drivers');
  await expect(page.getByTestId('roster-breakdown')).toContainText('vans assigned: 2/3');
  await expect(page.getByTestId('roster-anchor')).toHaveText(
    '4 of 5 drivers found in the driver list, 1 need review',
  );
  await expect(cell(page, 'Colton Alderman', 'assign_method')).toHaveText('primary affinity');
  await expect(cell(page, 'Colton Alderman', 'tenure')).toHaveText('120');
  await expect(cell(page, 'Colton Alderman', 'pad')).toHaveText('PAD 1');
  // The Check column: words on a coloured chip, and the row stripe follows it.
  await expect(
    cell(page, 'Gideon Whitaker', 'check').locator('[data-slot="chip"]'),
  ).toHaveAttribute('data-tone', 'warn');
  await expect(
    cell(page, 'Carmen Abernathy', 'check').locator('[data-slot="chip"]'),
  ).toHaveAttribute('data-tone', 'bad');
});

test('filters: shift type, search and Needs attention', async ({ page }) => {
  await open(page);
  await page.getByTestId('shift-filter').selectOption('Electric Route');
  await expect(page.getByText(/Showing 3 of \d/)).toBeVisible();
  await page.getByTestId('shift-filter').selectOption('All shift types');
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('CX4');
  await expect(page.getByText('Showing 1 of 5')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('');
  await page.getByRole('button', { name: /Needs attention/ }).click();
  await expect(page.getByText('Showing 2 of 5')).toBeVisible();
});

test('right-click menus use the old wording, and only where they fit', async ({ page }) => {
  await open(page);
  await rightClick(page, 'Colton Alderman', 'driver');
  expect(await menuItems(page)).toEqual(['Remove from the roster...']);
  await page.keyboard.press('Escape');
  await rightClick(page, 'Colton Alderman', 'transporter_id');
  expect(await menuItems(page)).toEqual(['Link to associate...', 'Match automatically']);
  await page.keyboard.press('Escape');
  for (const column of ['routes', 'service_type']) {
    await rightClick(page, 'Colton Alderman', column);
    expect(await menuItems(page)).toEqual(['Reassign this route...']);
    await page.keyboard.press('Escape');
  }
  for (const column of ['vehicle', 'vin']) {
    await rightClick(page, 'Colton Alderman', column);
    expect(await menuItems(page)).toEqual(['Reassign this van...', 'Unassign this van']);
    await page.keyboard.press('Escape');
    await rightClick(page, 'Gideon Whitaker', column);
    expect(await menuItems(page)).toEqual(['Assign a Van...']);
    await page.keyboard.press('Escape');
  }
  await rightClick(page, 'Colton Alderman', 'wave_time');
  await expect(page.getByRole('menu')).toContainText('Nothing to do on that column.');
});

test('Remove from the roster asks first, then sends the row and the snapshot it came from', async ({
  page,
}) => {
  await open(page);
  await rightClick(page, 'Gideon Whitaker', 'driver');
  await page.getByRole('menuitem', { name: 'Remove from the roster...' }).click();
  const ask = page.getByTestId('confirm-dialog');
  await expect(ask).toContainText('Take Gideon Whitaker off the roster?');
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.getByTestId('confirm-no').click();
  expect(await callsTo(page, 'loadOut:remove-driver')).toEqual([]);

  // Double-click does what the menu would.
  await cell(page, 'Gideon Whitaker', 'driver').dblclick();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:remove-driver')).toEqual([{ revision: 7, rowIndex: 1 }]);
  await expect(status(page)).toHaveText('Gideon Whitaker removed. 4 drivers on the roster.');
});

test('the link window: suggestions first, search, link, not an associate', async ({ page }) => {
  await open(page);
  await rightClick(page, 'Carmen Abernathy', 'transporter_id');
  await page.getByRole('menuitem', { name: 'Link to associate...' }).click();
  const dialog = page.getByTestId('link-dialog');
  await expect(dialog).toContainText('Which associate is "Carmen Abernathy"?');
  const first = dialog.locator('tbody tr').first();
  await expect(first).toContainText('Nolan Abernathy   (suggested)');
  // An inactive associate is greyed out, but still there to pick.
  await expect(first).toHaveAttribute('data-tone', 'ghost');
  // No hand link yet, so no "Match automatically" button.
  await expect(dialog.getByRole('button', { name: 'Match automatically' })).toHaveCount(0);
  await dialog.getByTestId('dialog-search').fill('whitaker');
  await expect(dialog.locator('tbody tr')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Link' }).click();
  expect(await callsTo(page, 'loadOut:link-driver')).toEqual([
    { revision: 7, rowIndex: 3, transporterId: IDS.gideon },
  ]);
  await expect(status(page)).toHaveText('Linked Carmen Abernathy to Gideon Whitaker.');

  await rightClick(page, 'Carmen Abernathy', 'transporter_id');
  await page.getByRole('menuitem', { name: 'Link to associate...' }).click();
  await page.getByTestId('link-dialog').getByRole('button', { name: 'Not an associate' }).click();
  expect((await callsTo(page, 'loadOut:link-driver')).at(-1)).toEqual({
    revision: 7,
    rowIndex: 3,
    transporterId: null,
  });

  await rightClick(page, 'Colton Alderman', 'transporter_id');
  await page.getByRole('menuitem', { name: 'Match automatically' }).click();
  expect(await callsTo(page, 'loadOut:unlink-driver')).toEqual([{ revision: 7, rowIndex: 0 }]);
});

test('Reassign this route: asks, lists drivers with no work first, and swaps with the others', async ({
  page,
}) => {
  await open(page);
  await rightClick(page, 'Colton Alderman', 'routes');
  await page.getByRole('menuitem', { name: 'Reassign this route...' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Move CX1 off Colton Alderman?');
  await page.getByTestId('confirm-yes').click();
  const pick = page.getByTestId('roster-pick-dialog');
  await expect(pick.getByTestId('dialog-caption')).toHaveText('Reassign CX1');
  await expect(pick).toContainText('Who takes CX1 from Colton Alderman?');
  // The stand-in moves the route and its van, as the app does, so the message can be read back.
  await onCall(page, 'loadOut:reassign-route', HAND_OVER);
  const names = await pick.locator('tbody tr td:first-child').allInnerTexts();
  expect(names).toEqual([
    'Carmen Abernathy',
    'Sabrina Woodbridge',
    'Gideon Whitaker',
    'Nadine Abernathy',
  ]);
  // Those with work are greyed: picking one is a swap.
  await expect(pick.locator('tbody tr').nth(2)).toHaveAttribute('data-tone', 'ghost');
  await pick.locator('tbody tr').nth(1).click();
  await pick.getByRole('button', { name: 'Reassign' }).click();
  expect(await callsTo(page, 'loadOut:reassign-route')).toEqual([{ revision: 7, from: 0, to: 2 }]);
  await expect(status(page)).toHaveText(
    'Sabrina Woodbridge takes CX1 and van 51. Colton Alderman now has nothing.',
  );
});

test('Reassign this van lists only drivers with a route, those without a van first', async ({
  page,
}) => {
  await open(page);
  await rightClick(page, 'Colton Alderman', 'vehicle');
  await page.getByRole('menuitem', { name: 'Reassign this van...' }).click();
  await page.getByTestId('confirm-yes').click();
  const pick = page.getByTestId('roster-pick-dialog');
  await expect(pick.getByTestId('dialog-caption')).toHaveText('Reassign van 51');
  await onCall(page, 'loadOut:reassign-van', HAND_OVER_VAN);
  expect(await pick.locator('tbody tr td:first-child').allInnerTexts()).toEqual([
    'Gideon Whitaker',
    'Nadine Abernathy',
  ]);
  await pick.locator('tbody tr').nth(1).dblclick();
  expect(await callsTo(page, 'loadOut:reassign-van')).toEqual([{ revision: 7, from: 0, to: 4 }]);
  await expect(status(page)).toHaveText(
    'Swapped vans: Nadine Abernathy takes 51, Colton Alderman takes 52.',
  );
});

test('Unassign this van, and Assign a Van from the free ones, best fit first', async ({ page }) => {
  await open(page);
  await onCall(page, 'loadOut:take-van', `() => ({ ok: true, value: '51' })`);
  await rightClick(page, 'Colton Alderman', 'vin');
  await page.getByRole('menuitem', { name: 'Unassign this van' }).click();
  // It asks first, starting on No, so Enter keeps the van where it is.
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Take van 51 off Colton Alderman?',
  );
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('confirm-dialog')).toBeHidden();
  expect(await callsTo(page, 'loadOut:take-van')).toEqual([]);
  await rightClick(page, 'Colton Alderman', 'vin');
  await page.getByRole('menuitem', { name: 'Unassign this van' }).click();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:take-van')).toEqual([{ revision: 7, rowIndex: 0 }]);
  await expect(status(page)).toHaveText(
    "Took van 51 off Colton Alderman. It's back on the Available Vans tab.",
  );

  await rightClick(page, 'Gideon Whitaker', 'vehicle');
  await page.getByRole('menuitem', { name: 'Assign a Van...' }).click();
  const pick = page.getByTestId('van-pick-dialog');
  await expect(pick).toContainText('Which van for Gideon Whitaker?');
  await expect(pick).toContainText('2 free.');
  const rows = pick.locator('tbody tr');
  await expect(rows.nth(0)).toContainText('60');
  await expect(rows.nth(0)).toContainText('Matches the route');
  // The self-owned van is listed too, flagged rather than hidden.
  await expect(rows.nth(1)).toContainText('Not Step Van qualified');
  await expect(rows.nth(1)).toContainText('Manual');
  await expect(rows.nth(1)).toHaveAttribute('data-tone', 'bad');
  await pick.getByRole('button', { name: 'Assign', exact: true }).last().click();
  expect(await callsTo(page, 'loadOut:give-van')).toEqual([
    { revision: 7, rowIndex: 1, vin: VINS[2] },
  ]);
  await expect(status(page)).toHaveText('Gideon Whitaker takes van 60 - matches the route.');
});

test('Import Sheet (and Ctrl+O) asks before replacing the roster', async ({ page }) => {
  await open(page);
  await onCall(
    page,
    'files:pick',
    `() => ({ ok: true, value: { path: 'C:\\\\Exports\\\\next_sheet.xlsx' } })`,
  );
  await onCall(page, 'files:import', `() => ({ ok: true, value: { kind: 'loadout', rows: 38 } })`);
  await page.getByRole('button', { name: 'Import Sheet' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'A roster for Friday, September 11 2026 is already loaded (5 drivers).',
  );
  await page.getByTestId('confirm-no').click();
  await expect(status(page)).toHaveText('Import cancelled - existing roster kept.');
  expect(await callsTo(page, 'files:import')).toEqual([]);

  await page.locator('body').press('Control+o');
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'files:pick')).toEqual([{ kind: 'loadout' }, { kind: 'loadout' }]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'loadout', path: 'C:\\Exports\\next_sheet.xlsx' },
  ]);
  await expect(status(page)).toHaveText(
    'Imported 38 drivers from next_sheet.xlsx. 4 of 38 found in the driver list.',
  );
});

test('an import the reader refuses shows its own words', async ({ page }) => {
  await open(page, { roster: { sourceFile: '', importedAt: null, routeSource: '', rows: [] } });
  await onCall(page, 'files:pick', `() => ({ ok: true, value: { path: 'C:\\\\wrong.xlsx' } })`);
  await onCall(
    page,
    'files:import',
    `() => ({ ok: false, reason: 'refused', message: 'The selected file is not a load-out sheet we can read.' })`,
  );
  await page.getByRole('button', { name: 'Import Sheet' }).first().click();
  await expect(page.getByTestId('inform-dialog')).toContainText(
    'The selected file is not a load-out sheet we can read.',
  );
  await page.getByTestId('inform-ok').click();
  await expect(status(page)).toHaveText('Import failed.');
});

test('Bring Over Route Data asks which export, then brings the DWP over after a day check', async ({
  page,
}) => {
  await open(page);
  await onCall(
    page,
    'loadOut:bring-over-route-data',
    `() => ({ ok: true, value: { kind: 'itineraries', filled: 3, dispatchTimes: 3, routeCodes: 3, serviceTypes: 3, pads: 2, noAssociate: 1, notInExport: 1, duplicates: 0, addedDrivers: [], needsReview: [] } })`,
  );
  await onCall(
    page,
    'loadOut:bring-over-dwp',
    `() => ({ ok: true, value: { filled: 1, staging: 1, bags: 1, ovs: 1, noRouteCode: 2, notInSheet: 2, cleared: 0 } })`,
  );
  await page.getByRole('button', { name: 'Bring Over Route Data' }).click();
  const source = page.getByTestId('source-dialog');
  await expect(source).toContainText('Which export should the roster take?');
  // Only the exports that have rows are offered, each described.
  await expect(source.getByRole('radio')).toHaveCount(2);
  await expect(source).toContainText(
    '2 rows  -  brings dispatch time, route code, service type, PAD',
  );
  await source.getByLabel('Itineraries').check();
  await source.getByRole('button', { name: 'Bring Over' }).click();
  expect(await callsTo(page, 'loadOut:bring-over-route-data')).toEqual([{ kind: 'itineraries' }]);
  // The DWP sheet is another day's: it asks before bringing it over.
  const ask = page.getByTestId('confirm-dialog');
  await expect(ask).toContainText(
    'DWP_DSP-XXXX_09-17-2026.xlsx is for Thursday, September 17 2026.',
  );
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:bring-over-dwp')).toHaveLength(1);
  await expect(status(page)).toHaveText(
    'Brought over Itineraries to 3 of 5 drivers - 3 dispatch times, 3 routes, 3 service types, ' +
      '2 PADs. 1 not in the export. 1 not found in the driver list.  DWP: 1 staging, 1 bags, ' +
      '1 OVS onto 1 drivers. 4 without a match.',
  );
});

test('Bring Over DWP on its own can be stopped at the day check', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Bring Over DWP' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    "Is this the right day's DWP sheet?",
  );
  await page.getByTestId('confirm-no').click();
  await expect(status(page)).toHaveText("DWP data left alone - the sheet may be the wrong day's.");
  expect(await callsTo(page, 'loadOut:bring-over-dwp')).toEqual([]);
});

test('Assign Vans shows what the run did, with anyone not placed first', async ({ page }) => {
  await open(page);
  await onCall(
    page,
    'loadOut:assign-vans',
    `() => ({ ok: true, value: {
      considered: 3, vansAvailable: 4,
      assignments: [
        { driver: 'Colton Alderman', vehicle: { name: '51', vin: '', serviceType: 'Standard Parcel Step Van - US', ownership: '' }, method: 'affinity-primary', reason: '' },
        { driver: 'Gideon Whitaker', vehicle: null, method: 'none', reason: 'No van free that they are cleared for' },
        { driver: 'Nadine Abernathy', vehicle: { name: '52', vin: '', serviceType: 'Standard Parcel Electric - Rivian MEDIUM', ownership: '' }, method: 'service-type', reason: '' },
      ] } })`,
  );
  await page.getByRole('button', { name: 'Assign Vans' }).click();
  const dialog = page.getByTestId('assign-dialog');
  await expect(dialog).toContainText('2 of 3 drivers have a van');
  await expect(dialog).toContainText('1 by primary affinity, 1 by service type.');
  const first = dialog.locator('tbody tr').first();
  await expect(first).toContainText('Gideon Whitaker');
  await expect(first).toContainText('not assigned');
  await expect(first).toContainText('No van free that they are cleared for');
  await expect(first).toHaveAttribute('data-tone', 'bad');
  await expect(status(page)).toHaveText(
    'Assigned 2 of 3 drivers from 4 operational vans. 1 left without one.',
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Assign Vans explains when there is nothing to assign from', async ({ page }) => {
  await open(page, { vehicles: [] });
  await page.getByRole('button', { name: 'Assign Vans' }).click();
  await expect(page.getByTestId('inform-dialog')).toContainText(
    'Import the fleet on the Vehicle Data page first',
  );
  expect(await callsTo(page, 'loadOut:assign-vans')).toEqual([]);
});

test('Clear Roster asks first; the More menu clears vans and manual links', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Clear Roster' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Associate data and manual links are kept.',
  );
  // A red question starts on No: Enter does not clear anything.
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('confirm-dialog')).toBeHidden();
  expect(await callsTo(page, 'loadOut:clear-roster')).toEqual([]);
  await page.getByRole('button', { name: 'Clear Roster' }).click();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:clear-roster')).toHaveLength(1);
  await expect(status(page)).toHaveText('Roster cleared.');

  await onCall(page, 'loadOut:clear-vans', `() => ({ ok: true, value: 2 })`);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Clear Van Assignments' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Take the van off all 2 drivers who have one?',
  );
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.getByTestId('confirm-no').click();
  expect(await callsTo(page, 'loadOut:clear-vans')).toEqual([]);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Clear Van Assignments' }).click();
  await page.getByTestId('confirm-yes').click();
  await expect(status(page)).toHaveText('Cleared the van from 2 drivers.');

  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Clear Manual Links' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Remove all 3 hand-made driver links?',
  );
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:clear-links')).toHaveLength(1);
});

test('Move Data to Previous Roster asks before replacing the one kept', async ({ page }) => {
  await open(page);
  await onCall(page, 'loadOut:move-to-previous-roster', `() => ({ ok: true, value: 5 })`);
  await page.getByRole('button', { name: 'Move Data to Previous Roster' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'The Previous Roster tab already holds 2 drivers (Thursday, September 10 2026).',
  );
  await page.getByTestId('confirm-yes').click();
  await expect(status(page)).toHaveText(
    "Copied 5 drivers to the Previous Roster, 2 of them holding a van. Today's roster is unchanged.",
  );
});

test('a command refused because the roster changed says so in plain words', async ({ page }) => {
  await open(page);
  await onCall(
    page,
    'loadOut:unlink-driver',
    `() => ({ ok: false, reason: 'refused', message: 'The roster changed while you were choosing. Look at it again and try once more.' })`,
  );
  await rightClick(page, 'Colton Alderman', 'transporter_id');
  await page.getByRole('menuitem', { name: 'Match automatically' }).click();
  await expect(status(page)).toHaveText(
    'The roster changed while you were choosing. Look at it again and try once more.',
  );
});

test('the panel beside the table shows the driver’s associate record and issues', async ({
  page,
}) => {
  await open(page);
  await cell(page, 'Gideon Whitaker', 'shift_type').click();
  const detail = page.getByTestId('driver-detail');
  await expect(detail).toContainText('Gideon Whitaker');
  await expect(detail).toContainText('ID expires in 10d');
  await expect(detail).toContainText(IDS.gideon);
});

test('Available Vans lists the free vans, marks hand-assign-only ones Manual, and filters', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('tab', { name: 'Available Vans' }).click();
  const grid = page.getByRole('grid', { name: 'Available vans' });
  await expect(grid).toBeVisible();
  await expect(page.getByTestId('available-count')).toHaveText('2 available');
  await expect(page.getByTestId('available-source')).toHaveText(
    'Operational vans nobody on the roster is holding. 2 of 4 are out.',
  );
  await expect(page.getByTestId('available-manual')).toHaveText('1 hand-assign only: 70');
  await expect(grid.locator('[role="gridcell"][data-col-id="assign"]')).toHaveText([
    'Auto',
    'Manual',
  ]);
  await page.getByTestId('category-filter').selectOption('Step Van');
  await expect(page.getByText('Showing 1 of 2')).toBeVisible();
});

test('Previous Roster shows yesterday, greys out those without a van, and filters', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('tab', { name: 'Previous Roster' }).click();
  await expect(page.getByTestId('previous-roster-count')).toHaveText('2 drivers  -  1 had a van');
  await expect(page.getByTestId('previous-roster-carry')).toHaveText(
    "1 of them are on today's roster",
  );
  const rows = page
    .getByRole('grid', { name: 'Previous roster' })
    .locator('[role="rowgroup"] [role="row"]');
  await expect(rows).toHaveCount(2);
  await page.getByTestId('held-a-van').check();
  await expect(rows).toHaveCount(1);
});

test('Bring Over Route Data takes the one export there is without asking', async ({ page }) => {
  const day = loadOutDay();
  const sets = (day.routeSets ?? []).map((set) =>
    set.kind === 'routes' ? set : { ...set, rows: [] },
  );
  await open(page, { routeSets: sets, dwp: { ...day.dwp!, set: { ...day.dwp!.set, rows: [] } } });
  await onCall(
    page,
    'loadOut:bring-over-route-data',
    `() => ({ ok: true, value: { kind: 'routes', filled: 0, dispatchTimes: 0, routeCodes: 0, serviceTypes: 0, pads: 0, noAssociate: 0, notInExport: 5, duplicates: 0, addedDrivers: [], needsReview: [] } })`,
  );
  await page.getByRole('button', { name: 'Bring Over Route Data' }).click();
  await expect
    .poll(() => callsTo(page, 'loadOut:bring-over-route-data'))
    .toEqual([{ kind: 'routes' }]);
  await expect(page.getByTestId('source-dialog')).toHaveCount(0);
  await expect(page.getByTestId('load-out-status')).toHaveText(
    "Nothing to bring over from Routes - none of the roster's drivers appear in it.",
  );
  // No DWP sheet is loaded, so the DWP pass after it has nothing to do and says nothing.
  expect(await callsTo(page, 'loadOut:bring-over-dwp')).toEqual([]);
});

test("a DWP sheet for the roster's own day goes straight over, with no question", async ({
  page,
}) => {
  const day = loadOutDay();
  await open(page, {
    dwp: { ...day.dwp!, dayStatus: 'ok', set: { ...day.dwp!.set, day: '2026-09-11' } },
  });
  await onCall(
    page,
    'loadOut:bring-over-dwp',
    `() => ({ ok: true, value: { filled: 1, staging: 1, bags: 1, ovs: 1, noRouteCode: 4, notInSheet: 0, cleared: 0 } })`,
  );
  await page.getByRole('button', { name: 'Bring Over DWP' }).click();
  await expect.poll(() => callsTo(page, 'loadOut:bring-over-dwp')).toHaveLength(1);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'DWP: 1 staging, 1 bags, 1 OVS onto 1 drivers. 4 without a match.',
  );
});

test('Available Vans and Previous Roster sort by heading and keep their layout under their own names', async ({
  page,
}) => {
  await open(page);
  const sorts = async (grid: string, heading: string, order: [string, string]) => {
    const table = page.getByRole('grid', { name: grid });
    const header = table.locator('[role="columnheader"]', {
      has: page.locator('span', { hasText: new RegExp(`^${heading}$`) }),
    });
    const first = () => table.locator('[role="rowgroup"] [role="row"]').first().innerText();
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(await first()).toContain(order[0]);
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(await first()).toContain(order[1]);
    // Moving a column saves the layout under the table's own name.
    await header.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move column right' }).click();
  };
  await page.getByRole('tab', { name: 'Available Vans' }).click();
  await sorts('Available vans', 'Vehicle', ['60', '70']);
  await page.getByRole('tab', { name: 'Previous Roster' }).click();
  await sorts('Previous roster', 'Driver', ['Colton Alderman', 'Sabrina Woodbridge']);
  const views = ((await callsTo(page, 'layout:set')) as Array<{ view: string }>).map((c) => c.view);
  expect(views).toEqual(expect.arrayContaining(['available-vans', 'previous-roster']));
});

test('Ctrl+O works from another tab, and not behind an open question', async ({ page }) => {
  await open(page);
  await onCall(
    page,
    'files:pick',
    `() => ({ ok: true, value: { path: 'C:\\\\Exports\\\\next_sheet.xlsx' } })`,
  );
  await page.getByRole('tab', { name: 'Print' }).click();
  await page.locator('body').press('Control+o');
  await expect(page.getByRole('tab', { name: 'Roster', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const ask = page.getByTestId('confirm-dialog');
  await expect(ask).toContainText('Replace current roster?');
  expect(await callsTo(page, 'files:pick')).toHaveLength(1);
  // Pressing it again while the question is open changes nothing.
  await page.keyboard.press('Control+o');
  await expect(ask).toContainText('Replace current roster?');
  expect(await callsTo(page, 'files:pick')).toHaveLength(1);
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Import cancelled - existing roster kept.',
  );
});
