// Bringing over the old app's data, on the stand-in bridge: the question on a first run, the three
// answers, the counts in words, the plain-words problems, and the Settings button that asks again.
// The real file reading is proved in src/main/oldData.test.ts and in the Electron smoke check.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge } from './support/fakeBridge';

const dialog = (page: Page) => page.locator('dialog[data-dialog="old-data"]');

/** Makes the stand-in say the old app's file is in its usual place, from the first look. */
async function oldFileFound(page: Page) {
  await page.addInitScript(() => {
    window.__fake!.hooks['migration:find'] = () => ({
      ok: true,
      value: { found: true, empty: true, demo: false },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installFakeBridge(page);
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'home'));
});

test('asks on a first run, and Yes shows the counts in words', async ({ page }) => {
  await oldFileFound(page);
  await page.goto('/');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('We found your old roster data. Bring it over?');
  await page.evaluate(() => {
    window.__fake!.hooks['migration:run'] = () => ({
      ok: true,
      value: {
        status: 'imported',
        counts: [
          { table: 'associates', imported: 76 },
          { table: 'vehicles', imported: 41 },
          { table: 'driver_links', imported: 13 },
        ],
      },
    });
  });
  await dialog(page).getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByTestId('old-data-summary')).toHaveText(
    'Brought over 76 drivers, 41 vans and 13 links.',
  );
  expect(await callsTo(page, 'migration:run')).toEqual([{ from: 'usual' }]);
  await dialog(page).getByRole('button', { name: 'Got it' }).click();
  await expect(dialog(page)).toHaveCount(0);
  // Answered: the question is not asked again.
  expect(await callsTo(page, 'settings:set')).toContainEqual({ oldDataAsked: true });
});

test('Not now closes it, remembers the answer, and Settings can ask again', async ({ page }) => {
  await oldFileFound(page);
  await page.goto('/');
  await dialog(page).getByRole('button', { name: 'Not now' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await callsTo(page, 'migration:run')).toEqual([]);
  expect(await callsTo(page, 'settings:set')).toContainEqual({ oldDataAsked: true });

  await page.locator('[data-nav="settings"]').click();
  await page.getByRole('button', { name: 'Bring over data from the old app' }).click();
  await expect(dialog(page)).toContainText('We found your old roster data. Bring it over?');
});

test('Choose a different file picks first, then brings that file over', async ({ page }) => {
  await oldFileFound(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.__fake!.hooks['migration:pick'] = () => ({ ok: true, value: { chosen: true } });
    window.__fake!.hooks['migration:run'] = () => ({
      ok: true,
      value: { status: 'imported', counts: [{ table: 'associates', imported: 1 }] },
    });
  });
  await dialog(page).getByRole('button', { name: 'Choose a different file' }).click();
  await expect(page.getByTestId('old-data-summary')).toHaveText('Brought over 1 driver.');
  expect(await callsTo(page, 'migration:run')).toEqual([{ from: 'chosen' }]);
});

test('says why in plain words when the file cannot be read', async ({ page }) => {
  await oldFileFound(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.__fake!.hooks['migration:run'] = () => ({
      ok: false,
      reason: 'refused',
      message: "That file could not be read as the old app's data.",
    });
  });
  await dialog(page).getByRole('button', { name: 'Yes' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText(
    "That file could not be read as the old app's data.",
  );
});

test('says so in words when the app already has saved data', async ({ page }) => {
  await oldFileFound(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.__fake!.hooks['migration:run'] = () => ({
      ok: true,
      value: { status: 'skipped', counts: [] },
    });
  });
  await dialog(page).getByRole('button', { name: 'Yes' }).click();
  await expect(dialog(page)).toContainText('already has saved data');
  await expect(dialog(page)).toContainText('Your saved data was not changed');
});

test('is not asked when the old file is not found, but Settings explains', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.locator('[data-nav="settings"]').click();
  await page.getByRole('button', { name: 'Bring over data from the old app' }).click();
  await expect(dialog(page)).toContainText('could not find your old roster data');
  await expect(dialog(page).getByRole('button', { name: 'Choose the file' })).toBeVisible();
});
