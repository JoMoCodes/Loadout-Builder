// The Vehicle Data page, driven in a real browser on the stand-in bridge: the fleet table and its
// buttons, the "set here" status, priorities, Van Affinity (the driver window and its messages),
// and the LMR Approved Drivers tab. The rules are proved by the core's tests; these prove the page.

import { expect, test, type Page } from '@playwright/test';
import {
  BARRETT,
  CARMEN,
  COLTON,
  VIN_A,
  VIN_B,
  VIN_C,
  associate,
  choosesFile,
  commandChanges,
  commandRefuses,
  openPage,
  van,
} from './support/pageData';
import { callsTo } from './support/fakeBridge';

const status = (page: Page) => page.getByTestId('vehicle-data-status');
const rowsOf = (page: Page) => page.locator('[role="rowgroup"] [role="row"]');
const tab = (page: Page, id: string) => page.getByTestId(`vehicle-data-tab-${id}`);
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const row = (page: Page, text: string) => page.locator('[role="row"]', { hasText: text });

const FLEET = () => [
  van(VIN_A, '101', {
    vehicle: { plate: 'PL-101', registrationExpiry: '2026-12-31', status: 'OPERATIONAL' },
  }),
  van(VIN_B, '102', {
    operational: false,
    overridden: true,
    priority: '5',
    vehicle: {
      operational: true,
      statusNote: 'Waiting on a part',
      registrationExpiry: '2026-09-01',
    },
  }),
  van(VIN_C, '103', {
    rental: true,
    vehicle: {
      ownership: 'AMAZON_RENTAL',
      serviceType: 'Large Van',
      registrationExpiry: '2026-10-11',
      ownershipEnd: '2026-10-20',
    },
  }),
];

const PEOPLE = () => [
  associate(CARMEN, { onRoster: true }),
  associate(BARRETT, { associate: { status: 'INACTIVE' } }),
  associate(COLTON, { lmrApproved: true }),
];

async function openFleet(page: Page, over: Record<string, unknown> = {}) {
  await openPage(page, 'vehicle-data', {
    snapshot: {
      vehicles: FLEET() as never,
      associates: PEOPLE() as never,
      lmrApproved: [COLTON.id],
      counts: {
        vehicles: 3,
        operationalVehicles: 2,
        overriddenVehicles: 1,
        lmrApproved: 1,
      },
      sources: {
        associates: { sourceFile: '', importedAt: null },
        vehicles: { sourceFile: 'C:\\Downloads\\VehiclesData.xlsx', importedAt: null },
      },
      ...over,
    } as never,
  });
}

test('has the three tabs, and an empty fleet says what to import', async ({ page }) => {
  await openPage(page, 'vehicle-data');
  await expect(page.getByRole('tab')).toHaveText([
    'Vehicle Management',
    'Van Affinity',
    'LMR Approved Drivers',
  ]);
  await expect(page.getByTestId('fleet-title')).toHaveText('No vehicles loaded');
  await expect(page.getByTestId('fleet-metric')).toHaveText('0 vehicles');
  await expect(page.getByText('Import VehiclesData.xlsx to bring in the fleet')).toBeVisible();
  await tab(page, 'affinity').click();
  await expect(
    page.getByText('Import the fleet on the Vehicle Management tab first'),
  ).toBeVisible();
  await tab(page, 'lmr').click();
  await expect(page.getByText('No associate data loaded.')).toBeVisible();
});

test('shows the fleet with the old columns, status words, and colours with words', async ({
  page,
}) => {
  await openFleet(page);
  await expect(page.getByTestId('fleet-title')).toHaveText('Fleet');
  await expect(page.getByTestId('fleet-sub')).toContainText('VehiclesData.xlsx');
  await expect(page.getByTestId('fleet-metric')).toHaveText('3 vehicles  -  2 operational');
  await expect(page.getByTestId('fleet-detail-0')).toHaveText('Branded Van: 1   Rental Van: 1');
  await expect(page.getByTestId('fleet-detail-1')).toHaveText(
    'registration expired: 1   expiring soon: 1   status set here: 1',
  );

  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Pick',
    'Vehicle',
    'Priority',
    'Status',
    'Service Type',
    'Category',
    'Assign',
    'Make / Model',
    'Plate',
    'Year',
    'Ownership',
    'Registration',
    'Note',
    'VIN',
  ]);

  const grounded = row(page, '102');
  await expect(grounded.locator('[data-col-id="state"]')).toHaveText('Grounded  (set here)');
  await expect(grounded.locator('[data-col-id="priority"]')).toHaveText('5');
  await expect(grounded.locator('[data-col-id="note"]')).toHaveText('Waiting on a part');
  await expect(grounded.locator('[data-col-id="registration"]')).toHaveText(
    '2026-09-01  (expired)',
  );
  await expect(grounded).toHaveAttribute('data-tone', 'bad');

  const rental = row(page, '103');
  await expect(rental.locator('[data-col-id="ownership"]')).toHaveText('Amazon Rental');
  await expect(rental.locator('[data-col-id="category"]')).toHaveText('Rental Van');
  await expect(rental.locator('[data-col-id="registration"]')).toHaveText('2026-10-11  (30d left)');
  await expect(rental.locator('[data-col-id="note"]')).toHaveText('until 2026-10-20');
  await expect(rental).toHaveAttribute('data-tone', 'warn');
  await expect(row(page, '101')).not.toHaveAttribute('data-tone', /.+/);
});

test('Status and Service drop-downs narrow the fleet', async ({ page }) => {
  await openFleet(page);
  await page.getByTestId('vehicle-status-filter').selectOption('Grounded');
  await expect(page.getByText('Showing 1 of 3')).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(1);
  await page.getByTestId('vehicle-status-filter').selectOption('Operational');
  await expect(page.getByText('Showing 2 of 3')).toBeVisible();
  await page.getByTestId('vehicle-service-filter').selectOption('Large Van');
  await expect(page.getByText('Showing 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Showing 3 of 3')).toBeVisible();
});

test('Ground / Return flips the ticked vans, and with none ticked the one you are on', async ({
  page,
}) => {
  await openFleet(page);
  // Nothing chosen: the old words.
  await page.getByTestId('ground-return').click();
  await expect(status(page)).toHaveText('Select a vehicle first.');

  // The row you are on.
  await row(page, '101').locator('[data-col-id="name"]').click();
  await commandChanges(page, 'vehicles:set-operational', null, { changed: 1 });
  await page.getByTestId('ground-return').click();
  expect(await callsTo(page, 'vehicles:set-operational')).toEqual([
    { vins: [VIN_A], operational: false },
  ]);
  await expect(status(page)).toHaveText('101 grounded.');

  // Ticked vans: a mixed pick all go to what the first one is not.
  await row(page, '101').getByTestId('pick-row').check();
  await row(page, '102').getByTestId('pick-row').check();
  await expect(page.getByTestId('picked-count')).toContainText('2 picked.');
  await page.getByTestId('ground-return').click();
  const calls = await callsTo(page, 'vehicles:set-operational');
  expect(calls[1]).toEqual({ vins: [VIN_A, VIN_B], operational: false });
  await expect(status(page)).toHaveText('101, 102 grounded.');

  await page.getByRole('button', { name: 'Clear the ticks' }).click();
  await expect(page.getByTestId('picked-count')).toHaveCount(0);
});

test('pressing Ground / Return twice puts the van back, reading the van as it is now', async ({
  page,
}) => {
  await openFleet(page);
  await row(page, '101').locator('[data-col-id="name"]').click();
  // The app answers by changing the van, as it would; the page must not use its old copy.
  const grounded = FLEET();
  grounded[0] = van(VIN_A, '101', { operational: false, overridden: true });
  await commandChanges(page, 'vehicles:set-operational', { vehicles: grounded }, { changed: 1 });
  await page.getByTestId('ground-return').click();
  await expect(row(page, '101').locator('[data-col-id="state"]')).toHaveText(
    'Grounded  (set here)',
  );
  await page.getByTestId('ground-return').click();
  expect(await callsTo(page, 'vehicles:set-operational')).toEqual([
    { vins: [VIN_A], operational: false },
    { vins: [VIN_A], operational: true },
  ]);
  await expect(status(page)).toHaveText('101 back in service.');
});

test('double-clicking a van flips it, and the right-click menu has the old three items', async ({
  page,
}) => {
  await openFleet(page);
  await commandChanges(page, 'vehicles:set-operational', null, { changed: 1 });
  await row(page, '102').locator('[data-col-id="name"]').dblclick();
  expect(await callsTo(page, 'vehicles:set-operational')).toEqual([
    { vins: [VIN_B], operational: true },
  ]);
  await expect(status(page)).toHaveText('102 back in service.');

  await row(page, '102').locator('[data-col-id="state"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText([
    'Ground / return to service',
    'Set priority...',
    'Match the export again',
  ]);
  await commandChanges(page, 'vehicles:match-export', null, { reset: 1 });
  await page.getByRole('menuitem', { name: 'Match the export again' }).click();
  expect(await callsTo(page, 'vehicles:match-export')).toEqual([{ vins: [VIN_B] }]);
  await expect(status(page)).toHaveText('1 vehicle(s) back to the status in the export.');

  await commandChanges(page, 'vehicles:match-export', null, { reset: 0 });
  await row(page, '101').locator('[data-col-id="state"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Match the export again' }).click();
  await expect(status(page)).toHaveText('Those vehicles already match the export.');
});

test('Set Priority asks for a whole number, refuses words, and empty takes the number away', async ({
  page,
}) => {
  await openFleet(page);
  await row(page, '102').locator('[data-col-id="name"]').click();
  await page.getByTestId('set-priority').click();
  const prompt = dialog(page, 'prompt');
  await expect(prompt).toContainText('Priority number for 102.');
  await expect(prompt).toContainText(
    'Higher goes out first, to the longest-serving driver who can take it.',
  );
  await expect(prompt.getByTestId('prompt-answer')).toHaveValue('5');

  await prompt.getByTestId('prompt-answer').fill('high');
  await prompt.getByRole('button', { name: 'OK' }).click();
  await expect(prompt.getByTestId('prompt-problem')).toHaveText(
    "'high' isn't a number. Use a whole number, or leave it empty to remove the priority.",
  );
  expect(await callsTo(page, 'vehicles:set-priority')).toEqual([]);

  await commandChanges(page, 'vehicles:set-priority', null);
  await prompt.getByTestId('prompt-answer').fill('9');
  await prompt.getByRole('button', { name: 'OK' }).click();
  expect(await callsTo(page, 'vehicles:set-priority')).toEqual([{ vins: [VIN_B], priority: '9' }]);
  await expect(status(page)).toHaveText('102 set to priority 9.');

  await page.getByTestId('set-priority').click();
  await dialog(page, 'prompt').getByTestId('prompt-answer').fill('');
  await dialog(page, 'prompt').getByRole('button', { name: 'OK' }).click();
  await expect(status(page)).toHaveText('Priority removed from 102.');

  // Cancel does nothing.
  await page.getByTestId('set-priority').click();
  await dialog(page, 'prompt').getByRole('button', { name: 'Cancel' }).click();
  expect(await callsTo(page, 'vehicles:set-priority')).toHaveLength(2);
});

test('importing the fleet says how many vans came in and how many are operational', async ({
  page,
}) => {
  await openPage(page, 'vehicle-data');
  await choosesFile(page, 'C:\\Downloads\\VehiclesData.xlsx');
  await commandChanges(
    page,
    'files:import',
    {
      vehicles: FLEET(),
      counts: { vehicles: 3, operationalVehicles: 2, overriddenVehicles: 1 },
      sources: {
        associates: { sourceFile: '', importedAt: null },
        vehicles: { sourceFile: 'C:\\Downloads\\VehiclesData.xlsx', importedAt: null },
      },
    },
    { kind: 'vehicles', rows: 3 },
  );
  await page.getByTestId('import-vehicles').click();
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'vehicles', path: 'C:\\Downloads\\VehiclesData.xlsx' },
  ]);
  await expect(status(page)).toHaveText(
    'Imported 3 vehicles from VehiclesData.xlsx - 2 operational. 1 kept the status set here.',
  );
  await expect(page.getByTestId('fleet-metric')).toHaveText('3 vehicles  -  2 operational');
});

test('a fleet file the reader refuses shows its words and changes nothing', async ({ page }) => {
  await openFleet(page);
  await choosesFile(page, 'C:\\Downloads\\wrong.xlsx');
  await commandRefuses(
    page,
    'files:import',
    'The selected file is not a vehicle export we can read.',
  );
  await page.getByTestId('import-vehicles').click();
  await expect(page.getByTestId('vehicle-data-problem')).toContainText(
    'The selected file is not a vehicle export we can read.',
  );
  await expect(page.getByTestId('fleet-metric')).toHaveText('3 vehicles  -  2 operational');
});

test('Clear Vehicles asks, and says what is kept', async ({ page }) => {
  await openFleet(page);
  await page.getByTestId('clear-vehicles').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Clear vehicles?');
  await expect(ask).toContainText('Remove all 3 vehicles?');
  await expect(ask).toContainText(
    'Van affinity and any statuses you set here are kept, and come back when you import the fleet again.',
  );
  // A red question starts on No, so Enter keeps the fleet.
  await expect(ask.getByRole('button', { name: 'No, keep it' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(ask).toHaveCount(0);
  expect(await callsTo(page, 'vehicles:clear')).toEqual([]);

  await commandChanges(page, 'vehicles:clear', {
    vehicles: [],
    counts: { vehicles: 0, operationalVehicles: 0, overriddenVehicles: 0 },
  });
  await page.getByTestId('clear-vehicles').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'vehicles:clear')).toHaveLength(1);
  await expect(status(page)).toHaveText('Vehicles cleared.');
  await expect(page.getByTestId('fleet-title')).toHaveText('No vehicles loaded');
});

test('Match All to Export and Clear Priorities ask before they act', async ({ page }) => {
  await openFleet(page);
  await page.getByTestId('clear-overrides').click();
  await expect(dialog(page, 'confirm')).toContainText('Put all 1 vans with a status set here back');
  await dialog(page, 'confirm').getByRole('button', { name: 'No, keep it' }).click();
  expect(await callsTo(page, 'vehicles:clear-overrides')).toEqual([]);

  await commandChanges(page, 'vehicles:clear-overrides', null);
  await page.getByTestId('clear-overrides').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'vehicles:clear-overrides')).toHaveLength(1);
  await expect(status(page)).toHaveText('Every van is back to the status in the export.');

  await commandChanges(page, 'vehicles:clear-priorities', null);
  await page.getByTestId('clear-priorities').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'vehicles:clear-priorities')).toHaveLength(1);
  await expect(status(page)).toHaveText('Priorities cleared.');
});

// ---------------------------------------------------------------------- Van Affinity

const AFFINITY = { [VIN_A]: { primary_1: CARMEN.id } };

async function openAffinity(page: Page) {
  await openFleet(page, {
    vehicles: [
      van(VIN_A, '101', { affinity: AFFINITY[VIN_A] }),
      van(VIN_B, '102', { operational: false, vehicle: { operational: true } }),
    ],
    affinity: AFFINITY,
    counts: { vehicles: 2, affinitySlots: 1 },
  });
  await tab(page, 'affinity').click();
}

test('Van Affinity shows two preferred drivers and two backups for each van', async ({ page }) => {
  await openAffinity(page);
  await expect(page.getByTestId('affinity-metric')).toHaveText('1 assignments');
  await expect(page.getByTestId('affinity-detail-0')).toHaveText('1 drivers across 1 vans');
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Vehicle',
    'Status',
    'Service Type',
    'Primary Driver 1',
    'Primary Driver 2',
    'Secondary Driver 1',
    'Secondary Driver 2',
  ]);
  await expect(row(page, '101').locator('[data-col-id="primary_1"]')).toHaveText(
    `${CARMEN.name} [EDV]`,
  );
  await expect(row(page, '102')).toHaveAttribute('data-tone', 'ghost');
  await page.getByTestId('affinity-operational-only').check();
  await expect(page.getByText('Showing 1 of 2')).toBeVisible();
});

test('double-clicking a driver column opens the window, which starts on active drivers who hold nothing', async ({
  page,
}) => {
  await openAffinity(page);
  await row(page, '102').locator('[data-col-id="primary_2"]').dblclick();
  const driver = dialog(page, 'driver');
  await expect(driver).toBeVisible();
  await expect(driver).toContainText('Who is primary driver 2 on van 102?');
  await expect(driver).toContainText(
    'A driver holds one primary van and one secondary van. Picking someone who already holds one of the same kind moves them here.',
  );
  // Active drivers who hold nothing first, then those who hold a van, then the inactive.
  const names = await driver.locator('tbody tr td:first-child').allInnerTexts();
  expect(names).toEqual([COLTON.name, CARMEN.name, BARRETT.name]);
  await expect(driver.locator(`tr[data-associate="${CARMEN.id}"]`)).toContainText('primary on 101');

  // Search, then pick by double-click.
  await driver.getByTestId('driver-search').fill('carm');
  await expect(driver.locator('tbody tr')).toHaveCount(1);
  await commandChanges(page, 'vehicles:set-affinity', null, {
    displaced: [{ vin: VIN_A, slot: 'primary_1' }],
  });
  await driver.locator('tbody tr').first().dblclick();
  expect(await callsTo(page, 'vehicles:set-affinity')).toEqual([
    { vin: VIN_B, slot: 'primary_2', transporterId: CARMEN.id },
  ]);
  await expect(status(page)).toHaveText(
    `${CARMEN.name} is primary driver 2 on van 102. Gave up primary driver 1 on 101.`,
  );
});

test('a click on a heading sorts the driver window; it stays in its own order until then', async ({
  page,
}) => {
  await openAffinity(page);
  await row(page, '102').locator('[data-col-id="primary_2"]').dblclick();
  const driver = dialog(page, 'driver');
  const names = () => driver.locator('tbody tr td:first-child').allInnerTexts();
  expect(await names()).toEqual([COLTON.name, CARMEN.name, BARRETT.name]);
  await driver.getByRole('button', { name: 'Associate' }).click();
  expect(await names()).toEqual([BARRETT.name, CARMEN.name, COLTON.name]);
  await driver.getByRole('button', { name: /Associate/ }).click();
  expect(await names()).toEqual([COLTON.name, CARMEN.name, BARRETT.name]);
});

test('right-click assigns or empties a slot, and says so when it is already empty', async ({
  page,
}) => {
  await openAffinity(page);
  await row(page, '101').locator('[data-col-id="primary_1"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText(['Assign driver...', 'Empty this slot']);
  await commandChanges(page, 'vehicles:clear-affinity', null);
  await page.getByRole('menuitem', { name: 'Empty this slot' }).click();
  expect(await callsTo(page, 'vehicles:clear-affinity')).toEqual([
    { vin: VIN_A, slot: 'primary_1' },
  ]);
  await expect(status(page)).toHaveText('Primary Driver 1 on van 101 emptied.');

  await row(page, '101').locator('[data-col-id="secondary_1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Empty this slot' }).click();
  await expect(status(page)).toHaveText('That slot is already empty.');

  // The window offers "Empty this slot" for a slot that has someone in it.
  await row(page, '101').locator('[data-col-id="primary_1"]').dblclick();
  const driver = dialog(page, 'driver');
  await driver.getByRole('button', { name: 'Empty this slot' }).click();
  expect(await callsTo(page, 'vehicles:clear-affinity')).toHaveLength(2);

  // Away from the driver columns, the old nudge.
  await row(page, '101').locator('[data-col-id="name"]').dblclick();
  await expect(status(page)).toHaveText('Double-click one of the driver columns to set it.');
});

test('Clear All asks first, and "Group by vehicle" off is read only', async ({ page }) => {
  await openAffinity(page);
  await page.getByTestId('clear-all-affinity').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Remove all 1 driver assignments?');
  await expect(ask).toContainText('This cannot be undone.');
  await ask.getByRole('button', { name: 'No, keep it' }).click();
  expect(await callsTo(page, 'vehicles:clear-all-affinity')).toEqual([]);
  await commandChanges(page, 'vehicles:clear-all-affinity', {
    affinity: {},
    counts: { affinitySlots: 0 },
  });
  await page.getByTestId('clear-all-affinity').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  await expect(status(page)).toHaveText('Van affinity cleared.');
  await page.getByTestId('clear-all-affinity').click();
  await expect(status(page)).toHaveText('No affinity set yet.');

  await page.getByTestId('group-by-vehicle').uncheck();
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual(['Associate', 'Vans', 'Status', 'Primary Van', 'Secondary Van']);
  await expect(rowsOf(page)).toHaveCount(3);
  await rowsOf(page).first().locator('[data-col-id="primary"]').dblclick();
  await expect(status(page)).toHaveText("Switch to 'Group by vehicle' to change affinity.");
  await expect(dialog(page, 'driver')).toHaveCount(0);
});

test('the driver side shows each associate’s primary and secondary van', async ({ page }) => {
  await openFleet(page, {
    vehicles: [van(VIN_A, '101'), van(VIN_B, '102')],
    affinity: { [VIN_A]: { primary_1: CARMEN.id }, [VIN_B]: { secondary_2: CARMEN.id } },
    counts: { affinitySlots: 2 },
  });
  await tab(page, 'affinity').click();
  await page.getByTestId('group-by-vehicle').uncheck();
  const carmen = row(page, CARMEN.name);
  await expect(carmen.locator('[data-col-id="primary"]')).toHaveText('101');
  await expect(carmen.locator('[data-col-id="secondary"]')).toHaveText('102');
});

test('Van Affinity needs the associate list first, and says so', async ({ page }) => {
  await openFleet(page, { associates: [] });
  await tab(page, 'affinity').click();
  await row(page, '101').locator('[data-col-id="primary_1"]').dblclick();
  const info = dialog(page, 'message');
  await expect(info).toContainText('No associate data');
  await expect(info).toContainText('Import the associate export on the Associates page first');
  await info.getByRole('button', { name: 'OK' }).click();
  expect(await callsTo(page, 'vehicles:set-affinity')).toEqual([]);
});

// ---------------------------------------------------------------------------- LMR

test('LMR Approved Drivers lists who may take a rental, with the rental vans in the header', async ({
  page,
}) => {
  await openFleet(page);
  await tab(page, 'lmr').click();
  await expect(page.getByTestId('lmr-metric')).toHaveText('1 approved');
  await expect(page.getByTestId('lmr-detail-0')).toHaveText('1 of 1 LMR vans operational:  103');
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Pick',
    'Associate',
    'LMR',
    'Transporter ID',
    'Vans',
    'Status',
    'On Load Out',
    'Position',
  ]);
  await expect(row(page, COLTON.name).locator('[data-col-id="approved"]')).toHaveText('Approved');
  await expect(row(page, CARMEN.name).locator('[data-col-id="on_loadout"]')).toHaveText('Yes');
  await expect(row(page, BARRETT.name)).toHaveAttribute('data-tone', 'ghost');

  await page.getByTestId('lmr-show-filter').selectOption('Approved');
  await expect(page.getByText('Showing 1 of 3')).toBeVisible();
  await page.getByTestId('lmr-show-filter').selectOption('Not approved');
  await expect(page.getByText('Showing 2 of 3')).toBeVisible();
  await page.getByTestId('lmr-on-load-out').check();
  await expect(page.getByText('Showing 1 of 3')).toBeVisible();
});

test('Approve and Remove work on every ticked associate, and say who changed', async ({ page }) => {
  await openFleet(page);
  await tab(page, 'lmr').click();
  await page.getByTestId('lmr-approve').click();
  await expect(status(page)).toHaveText('Select an associate first.');

  await row(page, CARMEN.name).getByTestId('pick-row').check();
  await row(page, BARRETT.name).getByTestId('pick-row').check();
  await row(page, COLTON.name).getByTestId('pick-row').check();
  await commandChanges(page, 'vehicles:set-lmr', null, { changed: 2 });
  await page.getByTestId('lmr-approve').click();
  // Colton is already approved, so only the other two change.
  expect(await callsTo(page, 'vehicles:set-lmr')).toEqual([
    { transporterIds: [CARMEN.id, BARRETT.id], approved: true },
  ]);
  await expect(status(page)).toHaveText(
    `${CARMEN.name}, ${BARRETT.name} approved for LMR. 3 approved.`,
  );

  await page.getByTestId('lmr-remove').click();
  const calls = await callsTo(page, 'vehicles:set-lmr');
  expect(calls[1]).toEqual({ transporterIds: [COLTON.id], approved: false });
  await expect(status(page)).toHaveText(`${COLTON.name} no longer approved for LMR. 0 approved.`);
});

test('double-click toggles approval; the right-click menu does the same for the ticked rows', async ({
  page,
}) => {
  await openFleet(page);
  await tab(page, 'lmr').click();
  await commandChanges(page, 'vehicles:set-lmr', null, { changed: 1 });
  await row(page, CARMEN.name).locator('[data-col-id="name"]').dblclick();
  expect(await callsTo(page, 'vehicles:set-lmr')).toEqual([
    { transporterIds: [CARMEN.id], approved: true },
  ]);
  await row(page, COLTON.name).locator('[data-col-id="name"]').dblclick();
  expect((await callsTo(page, 'vehicles:set-lmr'))[1]).toEqual({
    transporterIds: [COLTON.id],
    approved: false,
  });

  await row(page, COLTON.name).locator('[data-col-id="name"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText(['Approve for LMR', 'Remove approval']);
  await page.getByRole('menuitem', { name: 'Remove approval' }).click();
  expect((await callsTo(page, 'vehicles:set-lmr')).at(-1)).toEqual({
    transporterIds: [COLTON.id],
    approved: false,
  });
});

test('Space toggles approval for the row you are on, and on the tick box it ticks instead', async ({
  page,
}) => {
  await openFleet(page);
  await tab(page, 'lmr').click();
  await commandChanges(page, 'vehicles:set-lmr', null, { changed: 1 });
  await row(page, CARMEN.name).locator('[data-col-id="name"]').click();
  await page.keyboard.press('Space');
  expect(await callsTo(page, 'vehicles:set-lmr')).toEqual([
    { transporterIds: [CARMEN.id], approved: true },
  ]);
  // On the first column, Space ticks the row instead of changing anyone's approval.
  // Click the edge of the cell, not the tick box itself, then use the keyboard.
  await row(page, BARRETT.name)
    .locator('[data-col-id="pick"]')
    .click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Space');
  await expect(row(page, BARRETT.name).getByTestId('pick-row')).toBeChecked();
  expect(await callsTo(page, 'vehicles:set-lmr')).toHaveLength(1);
});

test('Clear All asks first and says what happens', async ({ page }) => {
  await openFleet(page);
  await tab(page, 'lmr').click();
  await page.getByTestId('lmr-clear-all').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Remove LMR approval from all 1 associates?');
  await expect(ask).toContainText(
    'No one will be auto-assigned a rental until you approve someone again.',
  );
  await ask.getByRole('button', { name: 'No, keep them' }).click();
  expect(await callsTo(page, 'vehicles:clear-lmr')).toEqual([]);
  await commandChanges(page, 'vehicles:clear-lmr', { lmrApproved: [] });
  await page.getByTestId('lmr-clear-all').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  await expect(status(page)).toHaveText('LMR approvals cleared.');
  await page.getByTestId('lmr-clear-all').click();
  await expect(status(page)).toHaveText('Nobody is approved for LMR yet.');
});
