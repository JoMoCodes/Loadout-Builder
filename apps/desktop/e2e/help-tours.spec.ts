// The page tours, on the stand-in bridge: a tour runs by itself the first time a page opens and
// not the second, Help > "Take the tour" runs it again, Esc skips, Enter goes on, and the tooltip
// is readable in all three themes and at the biggest text size.

import { expect, test, type Page } from '@playwright/test';
import { contrastProblems } from './support/contrast';
import { callsTo, installFakeBridge } from './support/fakeBridge';
import { demoRosterSnapshot } from './support/rosterRows';

const tour = (page: Page) => page.getByTestId('tour');

/** The names saved as "seen" by the last settings change that carried them. */
async function seenSaved(page: Page): Promise<string[]> {
  const patches = (await callsTo(page, 'settings:set')) as Array<{ toursSeen?: string[] }>;
  return patches.filter((p) => p.toursSeen).at(-1)?.toursSeen ?? [];
}

test('a page tour runs by itself the first time, and not the second', async ({ page }) => {
  await installFakeBridge(page, { settings: { autoTours: true } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'settings'));
  await page.goto('/');

  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'settings');
  await expect(tour(page)).toContainText('Step 1 of 4');
  await expect(tour(page)).toContainText('Colours');

  // Next, Back and Skip are there; Enter goes on.
  await expect(tour(page).getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(tour(page).getByRole('button', { name: 'Skip' })).toBeVisible();
  await tour(page).getByRole('button', { name: 'Next' }).click();
  await expect(tour(page)).toContainText('Step 2 of 4');
  await page.keyboard.press('Enter');
  await expect(tour(page)).toContainText('Step 3 of 4');
  await tour(page).getByRole('button', { name: 'Back' }).click();
  await expect(tour(page)).toContainText('Step 2 of 4');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(tour(page)).toContainText('Step 4 of 4');
  await tour(page).getByRole('button', { name: 'Done' }).click();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => seenSaved(page)).toEqual(['settings']);

  // Away and back: it does not run again.
  await page.click('[data-nav="features-log"]');
  await page.click('[data-nav="settings"]');
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
});

test('Esc skips a tour, and it counts as seen', async ({ page }) => {
  await installFakeBridge(page, { settings: { autoTours: true } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'settings'));
  await page.goto('/');
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => seenSaved(page)).toEqual(['settings']);
});

test('Help > Take the tour runs the tour again', async ({ page }) => {
  await installFakeBridge(page, { settings: { autoTours: true, toursSeen: ['settings'] } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'settings'));
  await page.goto('/');
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);

  await page.getByTestId('help-menu').click();
  await page.getByTestId('take-tour').click();
  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toContainText('Step 1 of 4');
  await tour(page).getByRole('button', { name: 'Skip' }).click();
  await expect(tour(page)).toHaveCount(0);
});

test('each Load Out tab has its own tour', async ({ page }) => {
  await installFakeBridge(page, {
    settings: { autoTours: true, toursSeen: ['home'] },
    snapshot: demoRosterSnapshot(20),
  });
  await page.addInitScript(() => {
    localStorage.setItem('loadout.page', 'load-out');
    localStorage.setItem('loadout.load-out-tab', 'roster');
  });
  await page.goto('/');
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'load-out-roster');
  await expect(tour(page)).toContainText('Step 1 of 6');
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);

  await page.click('[data-tab-button="available-vans"]');
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'load-out-available-vans');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => seenSaved(page))
    .toEqual(['home', 'load-out-roster', 'load-out-available-vans']);
});

test('the tours can be turned off in Settings', async ({ page }) => {
  await installFakeBridge(page, { settings: { autoTours: true, toursSeen: ['settings'] } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'settings'));
  await page.goto('/');
  await page.getByTestId('auto-tours').uncheck();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ autoTours: false });
  await page.click('[data-nav="associates"]');
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
});

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  for (const fontScale of [1, 1.5]) {
    test(`the tour tooltip is readable in the ${theme} theme at ${fontScale * 100}% text`, async ({
      page,
    }) => {
      await installFakeBridge(page, { settings: { theme, fontScale } });
      await page.addInitScript(() => localStorage.setItem('loadout.page', 'settings'));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.addStyleTag({
        content: '*, *::after { transition: none !important; animation: none !important; }',
      });
      await page.getByTestId('help-menu').click();
      await page.getByTestId('take-tour').click();
      await expect(tour(page)).toBeVisible();
      await page.keyboard.press('Enter'); // step 2, so Back is live as well
      await expect(tour(page)).toContainText('Step 2 of 4');
      await page.waitForTimeout(150);
      expect(await contrastProblems(page, '.driver-popover')).toEqual([]);
      // The tooltip fits in the window, even with big text.
      const box = await tour(page).boundingBox();
      const view = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(view.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(view.height);
    });
  }
}
