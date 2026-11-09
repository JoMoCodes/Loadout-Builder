// The left menu, top to bottom: the everyday pages, then (pinned to the bottom) a small box with
// what is saved, the pages about the app itself, and the text size and Help. The main window has
// no bar across its top; a page-only window, which has no left menu, keeps one.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, installFakeBridge, onCall } from './support/fakeBridge';

async function open(page: Page, address = '/', settings = {}) {
  await installFakeBridge(page, { settings });
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'home');
  });
  await page.goto(address);
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
}

/** Answers "what is saved?" with these counts, and tells the page to ask again. */
async function saved(page: Page, value: Record<string, unknown>) {
  await onCall(
    page,
    'data:get-source-info',
    `() => ({ ok: true, value: ${JSON.stringify(value)} })`,
  );
  await emit(page, 'state:changed', { revision: 2 });
}

const menu = (page: Page) => page.locator('.sidebar');
const top = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().top);
const bottom = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().bottom);

test('the everyday pages are at the top, and the pages about the app are pinned to the bottom', async ({
  page,
}) => {
  await open(page);
  // Still every page, in the same order.
  const ids = await page
    .getByRole('navigation', { name: 'Pages' })
    .locator('[data-nav]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-nav')));
  expect(ids).toEqual([
    'home',
    'dashboard',
    'load-out',
    'route-sheets',
    'vehicle-data',
    'associates',
    'scorecards',
    'how-to-use',
    'features-log',
    'settings',
  ]);
  // The room left over in a tall window is in the middle, between Scorecards and the small box.
  // Under that, everything sits tight against the bottom of the window: the box, the pages
  // about the app, then the text size and Help, with no room left under Settings.
  const gap =
    (await top(page, '[data-testid="menu-saved"]')) -
    (await bottom(page, '[data-nav="scorecards"]'));
  expect(gap).toBeGreaterThan(100);
  expect(
    (await top(page, '[data-nav="how-to-use"]')) -
      (await bottom(page, '[data-testid="menu-saved"]')),
  ).toBeLessThan(40);
  expect(
    (await top(page, '[data-testid="menu-tools"]')) - (await bottom(page, '[data-nav="settings"]')),
  ).toBeLessThan(20);
  const windowHeight = page.viewportSize()!.height;
  expect(windowHeight - (await bottom(page, '[data-testid="menu-tools"]'))).toBeLessThan(20);
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
});

test('Help and the text size are at the bottom of the left menu, and there is no bar across the top', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.topbar')).toHaveCount(0);
  // With the bar gone, the page starts at the top of the window.
  expect(await top(page, '#page-frame')).toBe(0);
  await expect(menu(page).getByRole('group', { name: 'Text size' })).toBeVisible();
  await expect(menu(page).getByTestId('help-menu')).toBeVisible();
  expect(await top(page, '.text-size')).toBeGreaterThan(
    await bottom(page, '[data-nav="settings"]'),
  );

  await page.getByRole('button', { name: 'Make the text bigger' }).click();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ fontScale: 1.1 });
  await expect(page.locator('[data-action="font-reset"]')).toHaveText('110%');
  await page.getByRole('button', { name: 'Put the text size back to normal' }).click();

  // The Help list opens upwards, fully on screen.
  await page.getByTestId('help-menu').click();
  const list = page.getByRole('menu', { name: 'Help' });
  await expect(list).toBeVisible();
  await expect(page.getByTestId('help-ask')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('take-tour')).toBeInViewport({ ratio: 1 });
  await page.getByTestId('help-how-to-use').click();
  await expect(page.locator('[data-page="how-to-use"]')).toBeVisible();
});

test('a small box in the menu says what is saved, in counts', async ({ page }) => {
  await open(page);
  const box = page.getByTestId('menu-saved');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Saved on this computer');
  await saved(page, {
    mode: 'real',
    ok: true,
    reason: null,
    counts: { driver_rows: 41, associates: 63, vehicles: 38 },
  });
  await expect(box.locator('dl > div')).toHaveText([
    'Drivers on the roster41',
    'Drivers in your list63',
    'Vans in your list38',
  ]);
  // It sits between the everyday pages and the pages about the app.
  expect(await top(page, '[data-testid="menu-saved"]')).toBeGreaterThan(
    await bottom(page, '[data-nav="scorecards"]'),
  );
  expect(await bottom(page, '[data-testid="menu-saved"]')).toBeLessThan(
    await top(page, '[data-nav="how-to-use"]'),
  );

  // Saved data that would not open is said in plain words, with no counts.
  await saved(page, { mode: 'real', ok: false, reason: 'open-failed', counts: {} });
  await expect(box).toContainText('The saved data could not be opened.');
  await expect(box.locator('dl')).toHaveCount(0);
});

test('in demo mode the box says the counts are of the demo data', async ({ page }) => {
  await open(page, '/', { demoMode: true });
  await expect(page.getByTestId('menu-saved')).toContainText('In the demo data');
  await expect(page.getByTestId('menu-saved')).not.toContainText('Saved on this computer');
});

test('in a short window with big text, the text size and Help stay put and the pages scroll', async ({
  page,
}) => {
  // The smallest the window goes, at the biggest text size.
  await page.setViewportSize({ width: 800, height: 600 });
  await open(page, '/', { fontScale: 1.5 });
  // The box steps aside first. The text size and Help never move, so the text can be made
  // smaller again; the everyday pages are the ones in view.
  await expect(page.getByTestId('menu-saved')).toBeHidden();
  for (const selector of [
    '[data-nav="home"]',
    '[data-nav="load-out"]',
    '[data-action="font-smaller"]',
    '[data-action="font-bigger"]',
    '[data-testid="help-menu"]',
  ]) {
    await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
  }
  // The pages scroll, with no scrollbar drawn.
  const pages = page.locator('.menu-pages');
  expect(await pages.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await pages.evaluate((el) => (el as HTMLElement).offsetWidth - el.clientWidth)).toBe(0);
  // A page that has scrolled out of sight is still one click away.
  await expect(page.locator('[data-nav="settings"]')).not.toBeInViewport();
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  // Nothing in the menu is wider than the menu.
  expect(await menu(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('the note about an update is in the menu, and fits it', async ({ page }) => {
  await open(page);
  await emit(page, 'updates:status-changed', {
    state: 'ready',
    version: '9.9.9',
    percent: null,
    message: null,
  });
  await expect(menu(page).getByRole('status')).toHaveText('Update ready');
  await expect(menu(page).getByRole('button', { name: 'Restart to update' })).toBeInViewport({
    ratio: 1,
  });
  await emit(page, 'updates:status-changed', {
    state: 'downloading',
    version: '9.9.9',
    percent: 40,
    message: null,
  });
  await expect(menu(page).getByRole('status')).toHaveText('Getting the new version (40%)');
  // A note longer than the menu is wide runs onto a second line; none of it is cut off.
  const words = menu(page).getByRole('status').locator('span').last();
  expect(await words.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await menu(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const right = await page
    .locator('.update-area')
    .evaluate((el) => el.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(await menu(page).evaluate((el) => el.clientWidth));
});

test('a page-only window, with no left menu, keeps Help and the text size across its top', async ({
  page,
}) => {
  await open(page, '/?page=settings');
  await expect(menu(page)).toHaveCount(0);
  const bar = page.locator('.topbar');
  await expect(bar.getByTestId('help-menu')).toBeVisible();
  await expect(bar.getByRole('group', { name: 'Text size' })).toBeVisible();
});
