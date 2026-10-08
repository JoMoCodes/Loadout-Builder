// The How to use page, on the stand-in bridge: the jump-to buttons, the folded-up problems, the
// pictures, and "Ask a question", which opens the help forum through the one allowed channel.

import { expect, test } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';

const FORUM = 'https://github.com/JoMoCodes/Loadout-Builder/discussions';

test.beforeEach(async ({ page }) => {
  await installFakeBridge(page);
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'how-to-use'));
  await page.goto('/');
  await expect(page.locator('[data-page="how-to-use"]')).toBeVisible();
});

test('has a jump-to button for every part, and each one scrolls to its part', async ({ page }) => {
  const parts = ['see', 'first', 'daily', 'colors', 'keys', 'problems', 'guides', 'stuck'];
  await expect(page.locator('[data-jump]')).toHaveCount(parts.length);
  for (const id of ['stuck', 'colors', 'problems']) {
    await page.click(`[data-jump="${id}"]`);
    await expect(page.locator(`#help-${id}`)).toBeInViewport();
  }
});

test('the problems are folded up and open one at a time', async ({ page }) => {
  const problems = page.getByTestId('help-problems').locator('details');
  for (const id of [
    'wrong-day-dwp',
    'driver-not-found',
    'no-van',
    'file-will-not-open',
    'id-expiry',
  ]) {
    await expect(page.locator(`details[data-problem="${id}"]`)).toHaveCount(1);
  }
  expect(await problems.count()).toBeGreaterThanOrEqual(5);
  const noVan = page.locator('details[data-problem="no-van"]');
  await expect(noVan).not.toHaveAttribute('open', '');
  await noVan.locator('summary').click();
  await expect(noVan).toHaveAttribute('open', '');
  await expect(noVan).toContainText('Only LMR vans left, and not on the approved list');
  await noVan.locator('summary').click();
  await expect(noVan).not.toHaveAttribute('open', '');
});

test('a link inside a problem opens that page', async ({ page }) => {
  const dwp = page.locator('details[data-problem="wrong-day-dwp"]');
  await dwp.locator('summary').click();
  await dwp.getByRole('button', { name: 'Route Data' }).click();
  await expect(page.locator('[data-page="route-data"]')).toBeVisible();
});

test('the colours part shows the chips with their words', async ({ page }) => {
  const colours = page.locator('#help-colors');
  await expect(colours).toContainText('OK');
  await expect(colours).toContainText('No associate found');
  await expect(colours).toContainText('ID expires in 12d');
});

test('the pictures are in place and load', async ({ page }) => {
  const pictures = page.locator('[data-page="how-to-use"] figure.help-shot img');
  expect(await pictures.count()).toBeGreaterThanOrEqual(2);
  for (const img of await pictures.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(img).toHaveAttribute('alt', /.+/);
  }
});

test('Ask a question warns about the public forum, then opens it', async ({ page }) => {
  await expect(page.getByTestId('forum-warning')).toContainText(
    'Anyone on the internet can read the forum',
  );
  await expect(page.getByTestId('forum-warning')).toContainText('Never post a roster');
  await page.getByTestId('ask-a-question').click();
  expect(await callsTo(page, 'app:open-link')).toEqual([FORUM]);
  await expect(page.getByTestId('ask-problem')).toHaveCount(0);
});

test('says so in plain words when the forum does not open', async ({ page }) => {
  await onCall(
    page,
    'app:open-link',
    `() => ({ ok: false, reason: 'refused', message: 'The web page could not be opened. Check the computer is online, then try again.' })`,
  );
  await page.getByTestId('ask-a-question').click();
  await expect(page.getByTestId('ask-problem')).toContainText('could not be opened');
});

test('Help > Ask a question brings you to the forum part of this page', async ({ page }) => {
  await page.click('[data-nav="home"]');
  await page.getByTestId('help-menu').click();
  await page.getByTestId('help-ask').click();
  await expect(page.locator('#help-stuck')).toBeInViewport();
  // It does not open the forum by itself: the warning comes first.
  expect(await callsTo(page, 'app:open-link')).toEqual([]);
});
