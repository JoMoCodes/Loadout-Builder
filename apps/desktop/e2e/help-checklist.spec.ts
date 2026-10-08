// The first-day checklist on Home, on the stand-in bridge: it ticks itself off as the data
// changes, its buttons open the right page and press that page's button, its "?" says where to
// get the file, it hides once done, and How to use brings it back.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, installFakeBridge, onCall } from './support/fakeBridge';
import { demoRosterRows } from './support/rosterRows';

const list = (page: Page) => page.getByTestId('first-run-checklist');
const step = (page: Page, id: string) => list(page).locator(`[data-step="${id}"]`);

/** Changes the stand-in's data the way the app does: change it, then say so. */
async function change(page: Page, apply: string) {
  await page.evaluate((code) => {
    const fake = window.__fake!;
    (0, eval)(code)(fake.snapshot);
    (fake.snapshot as { revision: number }).revision += 1;
  }, apply);
  await emit(page, 'state:changed', { revision: 99 });
}

test.beforeEach(async ({ page }) => {
  await installFakeBridge(page);
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'home'));
});

test('starts with nothing done and points at the driver list', async ({ page }) => {
  await page.goto('/');
  await expect(list(page)).toBeVisible();
  await expect(page.getByTestId('checklist-count')).toHaveText('0 of 5 done');
  await expect(list(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(step(page, 'drivers')).toHaveAttribute('data-step-current', 'true');
  for (const id of ['drivers', 'vans', 'sheet', 'route-data', 'assign-print'])
    await expect(step(page, id)).toHaveAttribute('data-step-done', 'false');
  // Each step says why, in a line of its own.
  await expect(step(page, 'drivers')).toContainText('So the app knows who can drive');
});

test('ticks itself off as the data changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('checklist-count')).toHaveText('0 of 5 done');

  await change(page, '(s) => { s.counts.associates = 40; s.counts.vehicles = 25; }');
  await expect(page.getByTestId('checklist-count')).toHaveText('2 of 5 done');
  await expect(step(page, 'drivers')).toHaveAttribute('data-step-done', 'true');
  await expect(step(page, 'vans')).toHaveAttribute('data-step-done', 'true');
  await expect(step(page, 'sheet')).toHaveAttribute('data-step-current', 'true');

  // A roster with no route data yet: the sheet is done, route data is next.
  const rows = demoRosterRows(6).map((view) => ({
    ...view,
    row: { ...view.row, waveTime: '', pad: '', vehicle: '', vin: '' },
  }));
  await change(page, `(s) => { s.roster.rows = ${JSON.stringify(rows)}; }`);
  await expect(page.getByTestId('checklist-count')).toHaveText('3 of 5 done');
  await expect(step(page, 'route-data')).toHaveAttribute('data-step-current', 'true');
  await expect(step(page, 'route-data').locator('[data-step-do]')).toHaveText('Import route data');

  // A route export brought in: the button now brings it over.
  await change(page, '(s) => { s.counts.routeRows = { routes: 30 }; }');
  await expect(step(page, 'route-data').locator('[data-step-do]')).toHaveText(
    'Bring over route data',
  );

  await change(page, `(s) => { s.roster.rows.forEach((v) => { v.row.waveTime = '10:20 AM'; }); }`);
  await expect(page.getByTestId('checklist-count')).toHaveText('4 of 5 done');
  await expect(step(page, 'assign-print').locator('[data-step-do]')).toHaveText('Assign vans');

  await change(page, `(s) => { s.roster.rows.forEach((v) => { v.row.vehicle = 'Van 12'; }); }`);
  await expect(step(page, 'assign-print').locator('[data-step-do]')).toHaveText(
    'Open the Print tab',
  );
  await expect(page.getByTestId('checklist-count')).toHaveText('4 of 5 done');
});

test('hides itself once every step is done, and How to use brings it back', async ({ page }) => {
  const rows = demoRosterRows(4).map((view) => ({
    ...view,
    row: { ...view.row, waveTime: '10:20 AM', vehicle: 'Van 12' },
  }));
  await installFakeBridge(page, {
    snapshot: {
      roster: { sourceFile: '', importedAt: null, routeSource: 'routes', rows },
      counts: { associates: 4, vehicles: 4 },
    },
  });
  await page.goto('/');
  await expect(page.getByTestId('checklist-count')).toHaveText('4 of 5 done');

  // Printing a roster is the last step (the app notes every Print Page and export that wrote a file).
  await page.evaluate(() => window.dispatchEvent(new Event('loadout:printed')));
  await expect(page.getByTestId('checklist-count')).toHaveText('5 of 5 done');
  await expect(page.getByTestId('checklist-finished')).toContainText('All five steps are done');
  await expect
    .poll(
      async () =>
        (await callsTo(page, 'settings:set')).filter(
          (p) => (p as { checklistHidden?: boolean }).checklistHidden === true,
        ).length,
    )
    .toBe(1);
  expect(await callsTo(page, 'settings:set')).toContainEqual({ printedOnce: true });

  // Gone next time Home opens.
  await page.click('[data-nav="settings"]');
  await page.click('[data-nav="home"]');
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(list(page)).toHaveCount(0);

  // How to use has "Show the checklist again".
  await page.click('[data-nav="how-to-use"]');
  await page.getByTestId('show-checklist-again').click();
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(list(page)).toBeVisible();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ checklistHidden: false });
});

test('a step button opens the page and presses its import button', async ({ page }) => {
  await page.goto('/');
  // The person closes the file window each time.
  await onCall(page, 'files:pick', '() => ({ ok: true, value: { path: null } })');
  await step(page, 'drivers').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await expect.poll(() => callsTo(page, 'files:pick')).toEqual([{ kind: 'associates' }]);

  await page.click('[data-nav="home"]');
  await step(page, 'vans').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="vehicle-data"]')).toBeVisible();
  await expect.poll(async () => (await callsTo(page, 'files:pick')).length).toBe(2);
  expect((await callsTo(page, 'files:pick'))[1]).toEqual({ kind: 'vehicles' });

  await page.click('[data-nav="home"]');
  await step(page, 'sheet').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="load-out"]')).toBeVisible();
  await expect.poll(async () => (await callsTo(page, 'files:pick')).length).toBe(3);
  expect((await callsTo(page, 'files:pick'))[2]).toEqual({ kind: 'loadout' });
});

test('the ? on a step says where to get the file', async ({ page }) => {
  await page.goto('/');
  await step(page, 'sheet').locator('[data-step-help]').click();
  const note = page.locator('dialog[data-dialog="where-to-get"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText("Where to get today's load-out sheet");
  await expect(note.locator('[data-screenshot-to-come]')).toContainText(
    'Screenshot to come: the Load-out sheet download button in DSP Workplace',
  );
  await expect(note.locator('img')).toHaveCount(1);
  await note.getByRole('button', { name: 'Close' }).click();
  await expect(note).toHaveCount(0);
});

test('"Try it with made-up data" turns on demo mode', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('checklist-try-demo').click();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ demoMode: true });
  // In demo mode the link is not needed.
  await expect(page.getByTestId('checklist-try-demo')).toHaveCount(0);
});

test('"Hide this list" puts it away, and Help brings it back', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('checklist-hide').click();
  await expect(list(page)).toHaveCount(0);
  await page.getByTestId('help-menu').click();
  await page.getByTestId('help-show-checklist').click();
  await expect(list(page)).toBeVisible();
});
