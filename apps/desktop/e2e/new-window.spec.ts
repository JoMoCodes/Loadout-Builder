// "Open in new window": a right-click on a page in the left menu or on a tab asks the main process
// for a window on it. A page-only window (one opened that way, told what to show in its address)
// shows that page alone, says what it shows in its title, keeps the main window's memory of the
// last page and tab untouched, and hears every change like the main window does.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, installFakeBridge } from './support/fakeBridge';
import { loadOutDay, withMaps } from './support/loadOutDay';

async function open(page: Page, address = '/') {
  await installFakeBridge(page, { snapshot: loadOutDay() });
  await withMaps(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'home');
    window.localStorage.setItem('loadout.load-out-tab', 'print');
  });
  await page.goto(address);
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
}

const menuItem = (page: Page) => page.getByRole('menuitem', { name: 'Open in new window' });

test('right-click a page in the left menu to open it in a new window', async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="settings"]').click({ button: 'right' });
  await expect(menuItem(page)).toBeVisible();
  await menuItem(page).click();
  expect(await callsTo(page, 'app:open-window')).toEqual([{ page: 'settings' }]);
  // The main window itself stays where it was.
  await expect(page.locator('[data-page="home"]')).toBeVisible();
});

test('right-click a tab to open that tab in a new window', async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="load-out"]').click();
  await page.getByRole('tab', { name: 'Available Vans' }).click({ button: 'right' });
  await menuItem(page).click();
  await page.locator('[data-nav="vehicle-data"]').click();
  await page.getByRole('tab', { name: 'Van Affinity' }).click({ button: 'right' });
  await menuItem(page).click();
  expect(await callsTo(page, 'app:open-window')).toEqual([
    { page: 'load-out', tab: 'available-vans' },
    { page: 'vehicle-data', tab: 'affinity' },
  ]);
});

test('a page-only window shows just its page and tab, and says so in its title', async ({
  page,
}) => {
  await open(page, '/?page=load-out&tab=available-vans');
  await expect(page.locator('[data-shell]')).toHaveAttribute('data-own-window', 'true');
  await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Available Vans' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('grid', { name: 'Available vans' })).toBeVisible();
  await expect(page).toHaveTitle('Load Out · Available Vans');

  // The title follows the open tab.
  await page.getByRole('tab', { name: 'Roster', exact: true }).click();
  await expect(page).toHaveTitle('Load Out · Roster');

  // The main window's memory of the last page and tab is not touched.
  expect(
    await page.evaluate(() => [
      window.localStorage.getItem('loadout.page'),
      window.localStorage.getItem('loadout.load-out-tab'),
    ]),
  ).toEqual(['home', 'print']);
});

test('a page-only window hears a change made elsewhere and redraws', async ({ page }) => {
  await open(page, '/?page=load-out&tab=available-vans');
  await expect(page.getByTestId('available-count')).toHaveText('2 available');
  // Another window took van 51 off its driver: the main process says the data changed.
  await page.evaluate(() => {
    const snapshot = window.__fake!.snapshot as {
      revision: number;
      vehicles: Array<{ available: boolean }>;
    };
    snapshot.vehicles[0]!.available = true;
    snapshot.revision = 2;
  });
  await emit(page, 'state:changed', { revision: 2 });
  await expect(page.getByTestId('available-count')).toHaveText('3 available');
});

test('a page-only window takes on a setting changed in another window', async ({ page }) => {
  await open(page, '/?page=settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const settings = await page.evaluate(() => window.__fake!.settings);
  await emit(page, 'settings:changed', { ...settings, theme: 'light', fontScale: 1.2 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Put the text size back to normal' })).toHaveText(
    '120%',
  );
});

test('a page-only window sends another page to the main window instead of showing it', async ({
  page,
}) => {
  await open(page, '/?page=home');
  await page.getByRole('button', { name: 'How to use' }).first().click();
  expect(await callsTo(page, 'app:show-page')).toEqual([{ page: 'how-to-use' }]);
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(page).toHaveTitle('Home');
});

test('the main window shows the page a page-only window asked for', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await emit(page, 'app:go-to', { page: 'settings' });
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  await expect(page.locator('[data-nav="settings"]')).toHaveAttribute('aria-current', 'page');
});

test('a page-only window asks none of the start-up questions', async ({ page }) => {
  await installFakeBridge(page, { settings: { lastSeenVersion: '1.0.0' } });
  await page.goto('/?page=dashboard');
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await callsTo(page, 'migration:find')).toEqual([]);
  expect(await callsTo(page, 'performance:old-data-find')).toEqual([]);
});
