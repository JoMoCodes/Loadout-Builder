// Every table on the Route Data, Vehicle Data and Associates pages is the shared table: its
// columns sort when a heading is clicked, and its order and widths are kept under its own name in
// the saved data. This walks all ten of them.

import { expect, test, type Page } from '@playwright/test';
import {
  BARRETT,
  CARMEN,
  COLTON,
  VIN_A,
  VIN_B,
  associate,
  entry,
  openPage,
  routeSet,
  van,
} from './support/pageData';
import { callsTo } from './support/fakeBridge';

const SNAPSHOT = () => ({
  associates: [associate(CARMEN), associate(BARRETT), associate(COLTON)] as never,
  vehicles: [van(VIN_A, '101'), van(VIN_B, '2')] as never,
  routeSets: [
    routeSet('routes', [
      entry({ transporterId: CARMEN.id, driverName: CARMEN.name, dispatchTime: '10:20am' }),
      entry({ transporterId: BARRETT.id, driverName: BARRETT.name, dispatchTime: '9:50am' }),
    ]),
    routeSet('itineraries', [
      entry({ transporterId: CARMEN.id, driverName: CARMEN.name, dispatchTime: '10:20am' }),
    ]),
    routeSet('schedule', [
      entry({ transporterId: CARMEN.id, driverName: CARMEN.name, dispatchTime: '9:55am' }),
    ]),
  ] as never,
  dwp: {
    set: {
      rows: [
        { routeCode: 'CX2', bags: '1', ovs: '', staging: '' },
        { routeCode: 'CX1', bags: '2', ovs: '', staging: '' },
      ],
      day: null,
      sourceFile: '',
      importedAt: null,
    },
    matchedCount: 0,
    dayStatus: 'unknown',
  } as never,
});

/** Opens a table, checks its name was used to look for a saved layout, and sorts it by a heading. */
async function check(page: Page, view: string, heading: string, order: [string, string]) {
  await expect(page.locator(`[data-grid-view="${view}"]`)).toBeVisible();
  const asked = (await callsTo(page, 'layout:get')) as Array<{ view: string }>;
  expect(asked.map((call) => call.view)).toContain(view);

  const header = page.locator('[role="columnheader"]', {
    has: page.locator('span', { hasText: new RegExp(`^${heading}$`) }),
  });
  await header.click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  const first = await page.locator('[role="rowgroup"] [role="row"]').first().innerText();
  expect(first).toContain(order[0]);
  await header.click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  expect(await page.locator('[role="rowgroup"] [role="row"]').first().innerText()).toContain(
    order[1],
  );
}

test('the Route Data tables sort by heading and keep their layout under their own names', async ({
  page,
}) => {
  await openPage(page, 'route-data', { snapshot: SNAPSHOT() });
  // Clock times sort as clock times: 9:50am comes before 10:20am.
  await check(page, 'route-data-routes', 'Dispatch Time', ['9:50am', '10:20am']);
  await page.getByTestId('route-data-tab-itineraries').click();
  await check(page, 'route-data-itineraries', 'Driver', [CARMEN.name, CARMEN.name]);
  await page.getByTestId('route-data-tab-schedule').click();
  await check(page, 'route-data-schedule', 'Associate', [CARMEN.name, CARMEN.name]);
  await page.getByTestId('route-data-tab-dwp').click();
  await check(page, 'dwp', 'Route Code', ['CX1', 'CX2']);
});

test('the Vehicle Data tables sort by heading and keep their layout under their own names', async ({
  page,
}) => {
  await openPage(page, 'vehicle-data', { snapshot: SNAPSHOT() });
  // Van 2 comes before van 101: numbers sort as numbers.
  await check(page, 'vehicles', 'Vehicle', ['2', '101']);
  await page.getByTestId('vehicle-data-tab-affinity').click();
  await check(page, 'van-affinity', 'Vehicle', ['2', '101']);
  await page.getByTestId('group-by-vehicle').uncheck();
  await check(page, 'van-affinity-drivers', 'Associate', [BARRETT.name, COLTON.name]);
  await page.getByTestId('vehicle-data-tab-lmr').click();
  await check(page, 'lmr-approved', 'Associate', [BARRETT.name, COLTON.name]);
});

test('the Associates tables sort by heading and keep their layout under their own names', async ({
  page,
}) => {
  await openPage(page, 'associates', { snapshot: SNAPSHOT() });
  await check(page, 'associates', 'Name', [BARRETT.name, COLTON.name]);
  await page.getByTestId('associates-tab-lifetime-routes').click();
  await check(page, 'lifetime-routes', 'Name', [BARRETT.name, COLTON.name]);
});

test('a column dragged on one of these tables stays put after a reload', async ({ page }) => {
  await openPage(page, 'associates', { snapshot: SNAPSHOT() });
  // The stand-in keeps what is saved, as the saved data would.
  await page.addInitScript(() => {
    const saved: Record<string, unknown> = {};
    const w = window as unknown as {
      __fake: { hooks: Record<string, (input: never) => unknown> };
    };
    w.__fake.hooks['layout:set'] = (input: { view: string }) => {
      saved[input.view] = input;
      window.localStorage.setItem('test.layout', JSON.stringify(saved));
      return { ok: true, value: null };
    };
    w.__fake.hooks['layout:get'] = (input: { view: string }) => {
      const kept = JSON.parse(window.localStorage.getItem('test.layout') ?? '{}') as Record<
        string,
        { order: string[]; widths: Record<string, number> }
      >;
      return { ok: true, value: kept[input.view] ?? { order: [], widths: {} } };
    };
  });
  await page.reload();
  const headings = async () =>
    (await page.locator('[role="columnheader"]').allInnerTexts()).map((text) => text.trim());
  expect((await headings())[0]).toBe('Name');

  // Right-click a heading and nudge the column left, the keyboard-friendly way to reorder.
  const status = page.locator('[role="columnheader"]', {
    has: page.locator('span', { hasText: /^Status$/ }),
  });
  await status.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move column left' }).click();
  await expect
    .poll(async () => (await headings()).slice(0, 3))
    .toEqual(['Name', 'Status', 'Transporter ID']);

  await page.reload();
  await expect
    .poll(async () => (await headings()).slice(0, 3))
    .toEqual(['Name', 'Status', 'Transporter ID']);
});
