// The left menu's Hide and Lock buttons. Hide shrinks the menu to its icons, and the page gets
// the room. Unlocked, the icons slide open while the pointer is on them and close when it leaves.
// Lock pins the menu open. The choice is kept for the next run.

import { expect, test, type Page } from '@playwright/test';
import { installFakeBridge } from './support/fakeBridge';

async function open(page: Page) {
  await installFakeBridge(page, {});
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'home');
  });
  await page.goto('/');
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  await page.addStyleTag({ content: '*, *::after { transition: none !important; }' });
}

const slot = (page: Page) => page.locator('.sidebar-slot');
const menuWidth = (page: Page) =>
  page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
const pageLeft = (page: Page) =>
  page.locator('#page-frame').evaluate((el) => el.getBoundingClientRect().left);

test('the menu starts wide and locked, with the page names showing', async ({ page }) => {
  await open(page);
  await expect(slot(page)).toHaveAttribute('data-menu', 'wide');
  await expect(page.getByRole('button', { name: 'Hide the menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Unlock the menu/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-nav="route-sheets"] .nav-label')).toBeVisible();
});

test('Hide shrinks the menu to icons, the page gets the room, and the pages still open', async ({
  page,
}) => {
  await open(page);
  const wideLeft = await pageLeft(page);
  await page.getByRole('button', { name: 'Hide the menu' }).click();
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
  expect(await menuWidth(page)).toBeLessThan(80);
  expect(await pageLeft(page)).toBeLessThan(wideLeft - 100);
  // The names are out of sight but still there to read out; pointing at an icon pops its name
  // out beside the menu at once, and it goes when the pointer leaves.
  await expect(page.locator('[data-nav="route-sheets"] .nav-label')).not.toBeInViewport();
  await page.locator('[data-nav="route-sheets"]').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Route Sheets');
  const tipBox = await page.getByRole('tooltip').boundingBox();
  expect(tipBox!.x).toBeGreaterThan(await menuWidth(page));
  await page.mouse.move(700, 400);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // The two buttons name themselves the same way.
  await page.getByRole('button', { name: 'Show the menu' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Show the menu');
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  // Locked, pointing at the icons changes nothing.
  await page.locator('[data-nav="home"]').hover();
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
  // Show opens it wide again.
  await page.getByRole('button', { name: 'Show the menu' }).click();
  await expect(slot(page)).toHaveAttribute('data-menu', 'wide');
});

test('unlocked, the icons slide open while pointed at and close when the pointer leaves', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Hide the menu' }).click();
  await page.getByRole('button', { name: /Unlock the menu/ }).click();
  // The pointer is on the menu (it just clicked a button there), so it opens at once.
  await expect(slot(page)).toHaveAttribute('data-menu', 'peek');
  // Open over the page: the page keeps the room it had.
  const peekLeft = await pageLeft(page);
  expect(await menuWidth(page)).toBeGreaterThan(200);
  await page.mouse.move(700, 400);
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
  expect(await pageLeft(page)).toBe(peekLeft);
  await page.locator('[data-nav="home"]').hover();
  await expect(slot(page)).toHaveAttribute('data-menu', 'peek');
  await expect(page.locator('[data-nav="route-sheets"] .nav-label')).toBeInViewport();
  // Lock pins it open: wide, and it stays wide when the pointer leaves.
  await page.getByRole('button', { name: 'Lock the menu open' }).click();
  await page.mouse.move(700, 400);
  await expect(slot(page)).toHaveAttribute('data-menu', 'wide');
});

test('the keyboard opens an unlocked menu too', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Hide the menu' }).click();
  await page.getByRole('button', { name: /Unlock the menu/ }).click();
  await page.mouse.move(700, 400);
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
  await page.locator('[data-nav="dashboard"]').focus();
  await expect(slot(page)).toHaveAttribute('data-menu', 'peek');
  // Open wide, the names are on show, so no label pops out.
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.locator('[data-action="font-bigger"]').focus();
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
});

test('the menu is remembered for the next run', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Hide the menu' }).click();
  await page.getByRole('button', { name: /Unlock the menu/ }).click();
  await page.mouse.move(700, 400);
  await page.reload();
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  await expect(slot(page)).toHaveAttribute('data-menu', 'icons');
  await expect(page.getByRole('button', { name: 'Lock the menu open' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
