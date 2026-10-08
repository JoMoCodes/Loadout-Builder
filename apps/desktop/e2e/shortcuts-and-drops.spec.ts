// Dropping a file on the page that takes it, the shortcut keys that work from every page, and
// the questions asked before something is taken away. On the stand-in bridge: a dropped file is
// made up in the page, and the stand-in answers `files:dropped` as the app would. The checks the
// app makes on a dropped file are proved in src/main/fileDrop.test.ts and stateHost.test.ts, and
// a real file is dropped in the Electron smoke check.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';
import { loadOutDay, withMaps } from './support/loadOutDay';
import {
  BARRETT,
  CARMEN,
  associate,
  commandChanges,
  openPage,
  routeSet,
  van,
  VIN_A,
} from './support/pageData';

async function openLoadOut(page: Page, tab = 'roster') {
  await installFakeBridge(page, { snapshot: loadOutDay() });
  await withMaps(page);
  await page.addInitScript((which) => {
    window.localStorage.setItem('loadout.page', 'load-out');
    window.localStorage.setItem('loadout.load-out-tab', which);
  }, tab);
  await page.goto('/');
  if (tab === 'roster') await expect(page.getByRole('grid', { name: 'Roster' })).toBeVisible();
}

/** The stand-in takes every dropped file, as the app does with one of the right kind. */
async function takesDrops(page: Page) {
  await onCall(
    page,
    'files:dropped',
    `(input) => ({ ok: true, value: { token: 'dropped-1/' + input.file.name } })`,
  );
}

/** Drags a made-up file over a place and lets go, the way a file from the computer arrives. */
async function dropFile(page: Page, target: Locator, name: string, letGo = true) {
  const data = await page.evaluateHandle((fileName) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['made-up'], fileName));
    return transfer;
  }, name);
  await target.dispatchEvent('dragenter', { dataTransfer: data });
  await target.dispatchEvent('dragover', { dataTransfer: data });
  if (letGo) await target.dispatchEvent('drop', { dataTransfer: data });
}

const zone = (page: Page, kind: string) => page.locator(`[data-drop-kind="${kind}"]`);
const highlight = (page: Page) => page.getByTestId('drop-highlight');

// ------------------------------------------------------------------ dropping a file

test('a load-out sheet dropped on the Roster tab is brought in, asking first as Import Sheet does', async ({
  page,
}) => {
  await openLoadOut(page);
  await takesDrops(page);
  await onCall(page, 'files:import', `() => ({ ok: true, value: { kind: 'loadout', rows: 38 } })`);

  await dropFile(page, zone(page, 'loadout'), 'next_sheet.xlsx', false);
  await expect(highlight(page)).toHaveText('Drop the load-out sheet here');
  await zone(page, 'loadout').dispatchEvent('dragleave');
  await expect(highlight(page)).toHaveCount(0);

  await dropFile(page, zone(page, 'loadout'), 'next_sheet.xlsx');
  await expect(highlight(page)).toHaveCount(0);
  const ask = page.getByTestId('confirm-dialog');
  await expect(ask).toContainText('Replace it with next_sheet.xlsx?');
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'files:dropped')).toEqual([
    { page: 'load-out', kind: 'loadout', file: 'next_sheet.xlsx' },
  ]);
  // No file window: the dropped file is brought in as if it had been picked.
  expect(await callsTo(page, 'files:pick')).toEqual([]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'loadout', path: 'dropped-1/next_sheet.xlsx' },
  ]);
  await expect(page.getByTestId('load-out-status')).toContainText(
    'Imported 38 drivers from next_sheet.xlsx.',
  );
});

test('a dropped file of the wrong kind is refused in plain words, and nothing comes in', async ({
  page,
}) => {
  await openLoadOut(page);
  await onCall(
    page,
    'files:dropped',
    `() => ({ ok: false, reason: 'refused', message: "That file doesn't look like a load-out sheet. It should end in .xlsx." })`,
  );
  await dropFile(page, zone(page, 'loadout'), 'AssociateData.csv');
  await expect(page.getByTestId('inform-dialog')).toContainText(
    "That file doesn't look like a load-out sheet. It should end in .xlsx.",
  );
  await page.getByTestId('inform-ok').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Import failed.');
  expect(await callsTo(page, 'files:import')).toEqual([]);
});

test('a file dropped where nothing takes one does nothing', async ({ page }) => {
  await openLoadOut(page, 'available-vans');
  await takesDrops(page);
  await expect(page.locator('[data-drop-kind]')).toHaveCount(0);
  const stopped = await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['made-up'], 'next_sheet.xlsx'));
    const results: boolean[] = [];
    for (const type of ['dragover', 'drop']) {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      document.querySelector('[data-page="load-out"]')!.dispatchEvent(event);
      results.push(event.defaultPrevented);
    }
    return results;
  });
  // The window's own "open the file" is stopped, so the app stays where it is.
  expect(stopped).toEqual([true, true]);
  await expect(page.locator('[data-page="load-out"]')).toBeVisible();
  expect(await callsTo(page, 'files:dropped')).toEqual([]);
});

test('Route Data takes each export on its own tab, and the DWP sheet on the DWP tab', async ({
  page,
}) => {
  await openPage(page, 'route-data', {
    snapshot: {
      associates: [associate(CARMEN)] as never,
      routeSets: [
        routeSet('routes', []),
        routeSet('itineraries', []),
        routeSet('schedule', []),
      ] as never,
    },
  });
  await takesDrops(page);
  await onCall(
    page,
    'files:import',
    `(input) => ({ ok: true, value: { kind: input.kind, rows: 0 } })`,
  );

  await page.getByTestId('route-data-tab-schedule').click();
  await dropFile(page, zone(page, 'schedule'), 'Week-38-Schedule.xlsx', false);
  await expect(highlight(page)).toHaveText('Drop the Weekly Schedule here');
  await zone(page, 'schedule').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['made-up'], 'Week-38-Schedule.xlsx'));
      return transfer;
    }),
  });
  await expect.poll(() => callsTo(page, 'files:import')).toHaveLength(1);

  await page.getByTestId('route-data-tab-dwp').click();
  await dropFile(page, zone(page, 'dwp'), 'DWP_sheet.xlsx');
  await expect.poll(() => callsTo(page, 'files:import')).toHaveLength(2);

  expect(await callsTo(page, 'files:dropped')).toEqual([
    { page: 'route-data', kind: 'schedule', file: 'Week-38-Schedule.xlsx' },
    { page: 'route-data', kind: 'dwp', file: 'DWP_sheet.xlsx' },
  ]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'schedule', path: 'dropped-1/Week-38-Schedule.xlsx' },
    { kind: 'dwp', path: 'dropped-1/DWP_sheet.xlsx' },
  ]);
  expect(await callsTo(page, 'files:pick')).toEqual([]);
});

test('Vehicle Data takes the vehicle list on Vehicle Management, and a refusal shows its words', async ({
  page,
}) => {
  await openPage(page, 'vehicle-data', {
    snapshot: { vehicles: [van(VIN_A, '101')] as never, counts: { vehicles: 1 } },
  });
  await takesDrops(page);
  await onCall(page, 'files:import', `() => ({ ok: true, value: { kind: 'vehicles', rows: 3 } })`);
  await dropFile(page, zone(page, 'vehicles'), 'VehiclesData.xlsx', false);
  await expect(highlight(page)).toHaveText('Drop the vehicle list here');
  await zone(page, 'vehicles').dispatchEvent('dragleave');
  await dropFile(page, zone(page, 'vehicles'), 'VehiclesData.xlsx');
  await expect
    .poll(() => callsTo(page, 'files:import'))
    .toEqual([{ kind: 'vehicles', path: 'dropped-1/VehiclesData.xlsx' }]);

  await onCall(
    page,
    'files:dropped',
    `() => ({ ok: false, reason: 'refused', message: "That file doesn't look like a vehicle list. It should end in .xlsx." })`,
  );
  await dropFile(page, zone(page, 'vehicles'), 'notes.txt');
  await expect(page.getByTestId('vehicle-data-problem')).toContainText(
    "That file doesn't look like a vehicle list. It should end in .xlsx.",
  );
  await expect(page.getByTestId('vehicle-data-status')).toHaveText('Import failed.');

  // The other tabs do not take a file.
  await page.getByTestId('vehicle-data-tab-affinity').click();
  await expect(page.locator('[data-drop-kind]')).toHaveCount(0);
});

test('Associates takes the associate export on its tab (asking before replacing) and the tenure file on Lifetime Routes', async ({
  page,
}) => {
  await openPage(page, 'associates', {
    snapshot: {
      associates: [associate(CARMEN), associate(BARRETT)] as never,
      counts: { associates: 2, activeAssociates: 2 },
    },
  });
  await takesDrops(page);
  await onCall(
    page,
    'files:import',
    `(input) => ({ ok: true, value: { kind: input.kind, rows: 2 } })`,
  );

  await dropFile(page, zone(page, 'associates'), 'AssociateData.csv', false);
  await expect(highlight(page)).toHaveText('Drop the associate export here');
  await zone(page, 'associates').dispatchEvent('dragleave');
  await dropFile(page, zone(page, 'associates'), 'AssociateData.csv');
  const ask = page.locator('dialog[data-dialog="confirm"]');
  await expect(ask).toContainText('replaced by the file you dropped');
  await ask.getByRole('button', { name: 'Yes, replace it' }).click();
  await expect
    .poll(() => callsTo(page, 'files:import'))
    .toEqual([{ kind: 'associates', path: 'dropped-1/AssociateData.csv' }]);

  await page.getByTestId('associates-tab-lifetime-routes').click();
  await dropFile(page, zone(page, 'tenure'), 'Tenured_Workforce.csv', false);
  await expect(highlight(page)).toHaveText('Drop the Tenured Workforce file here');
  await zone(page, 'tenure').dispatchEvent('dragleave');
  await dropFile(page, zone(page, 'tenure'), 'Tenured_Workforce.csv');
  await expect.poll(() => callsTo(page, 'files:import')).toHaveLength(2);
  expect((await callsTo(page, 'files:import'))[1]).toEqual({
    kind: 'tenure',
    path: 'dropped-1/Tenured_Workforce.csv',
  });
  expect(await callsTo(page, 'files:dropped')).toEqual([
    { page: 'associates', kind: 'associates', file: 'AssociateData.csv' },
    { page: 'associates', kind: 'tenure', file: 'Tenured_Workforce.csv' },
  ]);
});

// ------------------------------------------------------------------ shortcut keys

test('Ctrl+O works from any page: it opens Load Out and runs Import Sheet', async ({ page }) => {
  await installFakeBridge(page, { snapshot: loadOutDay() });
  await withMaps(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'vehicle-data');
    window.localStorage.setItem('loadout.load-out-tab', 'available-vans');
  });
  await page.goto('/');
  await expect(page.locator('[data-page="vehicle-data"]')).toBeVisible();
  await onCall(
    page,
    'files:pick',
    `() => ({ ok: true, value: { path: 'C:/Exports/next_sheet.xlsx' } })`,
  );
  await page.locator('body').press('Control+o');
  await expect(page.locator('[data-page="load-out"]')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Roster', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The roster is there, so it asks first, as the button does.
  await expect(page.getByTestId('confirm-dialog')).toContainText('Replace current roster?');
  await page.getByTestId('confirm-no').click();
  expect(await callsTo(page, 'files:pick')).toHaveLength(1);
});

test('Ctrl+I works from any page: it opens Associates and runs Import Associates', async ({
  page,
}) => {
  await installFakeBridge(page, {
    snapshot: {
      ...loadOutDay(),
      associates: [associate(CARMEN), associate(BARRETT)] as never,
      counts: { associates: 2, activeAssociates: 2 },
    },
  });
  await withMaps(page);
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'load-out'));
  await page.goto('/');
  await expect(page.locator('[data-page="load-out"]')).toBeVisible();
  await page.locator('body').press('Control+i');
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await expect(page.getByTestId('associates-tab-associates')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const ask = page.locator('dialog[data-dialog="confirm"]');
  await expect(ask).toContainText('Replace the associate list?');
  // Pressing a shortcut while a question is open changes nothing.
  await page.keyboard.press('Control+o');
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await ask.getByRole('button', { name: 'No, keep the list' }).click();
  expect(await callsTo(page, 'files:pick')).toEqual([]);

  // From the Lifetime Routes tab, it goes back to the Associates tab.
  await page.getByTestId('associates-tab-lifetime-routes').click();
  await page.locator('body').press('Control+i');
  await expect(page.getByTestId('associates-tab-associates')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(ask).toContainText('Replace the associate list?');
});

test('How to use lists the shortcuts', async ({ page }) => {
  await openPage(page, 'how-to-use');
  const list = page.getByTestId('help-shortcuts');
  await expect(list).toContainText('Ctrl+O brings in a load-out sheet, from any page.');
  await expect(list).toContainText('Ctrl+I brings in the driver list, from any page.');
  await expect(list).toContainText('Ctrl+P on the Load Out page prints the roster');
});

// ------------------------------------------------------------- questions first

test('Assign Vans asks first when a van was given by hand', async ({ page }) => {
  const day = loadOutDay();
  const rows = day.roster!.rows;
  rows[0]!.row.assignMethod = 'by-hand';
  await installFakeBridge(page, { snapshot: day });
  await withMaps(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'load-out');
    window.localStorage.setItem('loadout.load-out-tab', 'roster');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Assign Vans' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    'Some vans were given by hand. Assign Vans will replace them. Go ahead?',
  );
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Vans left as they were.');
  expect(await callsTo(page, 'loadOut:assign-vans')).toEqual([]);
});

test('Assign Vans goes straight ahead when no van was given by hand', async ({ page }) => {
  await openLoadOut(page);
  await onCall(
    page,
    'loadOut:assign-vans',
    `() => ({ ok: true, value: { considered: 0, vansAvailable: 4, assignments: [] } })`,
  );
  await page.getByRole('button', { name: 'Assign Vans' }).click();
  await expect(page.getByTestId('assign-dialog')).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  expect(await callsTo(page, 'loadOut:assign-vans')).toHaveLength(1);
});

test('Clear Lifetime Routes asks first, starting on No, and keeps the associate list', async ({
  page,
}) => {
  await openPage(page, 'associates', {
    snapshot: {
      associates: [associate(CARMEN, { associate: { tenure: 40 } })] as never,
      counts: { associates: 1, activeAssociates: 1 },
      tenure: {
        records: 167,
        sourceFile: 'C:\\Downloads\\Tenured_Workforce_DA_1756900000.csv',
        importedAt: null,
        associatesWithCount: 1,
        weekLabel: 'Week 36, 2026',
      },
    },
  });
  await page.getByTestId('associates-tab-lifetime-routes').click();
  await page.getByTestId('clear-tenure').click();
  const ask = page.locator('dialog[data-dialog="confirm"]');
  await expect(ask).toContainText('Clear Lifetime Routes?');
  await expect(ask).toContainText('Remove the lifetime route counts of all 167 drivers?');
  await expect(ask).toContainText('The associate list and the roster are kept.');
  await expect(ask.getByRole('button', { name: 'No, keep them' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(ask).toHaveCount(0);
  expect(await callsTo(page, 'associates:clear-tenure')).toEqual([]);

  await commandChanges(page, 'associates:clear-tenure', {
    tenure: {
      records: 0,
      sourceFile: '',
      importedAt: null,
      associatesWithCount: 0,
      weekLabel: '',
    },
  });
  await page.getByTestId('clear-tenure').click();
  await page
    .locator('dialog[data-dialog="confirm"]')
    .getByRole('button', { name: 'Yes, clear' })
    .click();
  expect(await callsTo(page, 'associates:clear-tenure')).toHaveLength(1);
  await expect(page.getByTestId('associates-status')).toHaveText('Lifetime routes cleared.');
  await expect(page.getByTestId('tenure-sub')).toHaveText(
    'No Tenured Workforce file has been imported yet.',
  );

  await page.getByTestId('clear-tenure').click();
  await expect(page.getByTestId('associates-status')).toHaveText(
    'Nothing to clear - no lifetime routes kept.',
  );
});
