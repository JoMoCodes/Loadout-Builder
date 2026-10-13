// The Weekly performance part of Settings, and the question about the old Weekly Performance
// App's data, on the stand-in bridge: auto-import, the rule numbers, and bringing the old data
// over on a first run or from Settings. The email setup is the Email part of Settings now
// (email-settings.spec.ts).

import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';
import { openPerformance } from './support/performance';

const section = (page: Page) => page.locator('[data-setting="performance"]');
const perfDialog = (page: Page) => page.locator('dialog[data-dialog="perf-old-data"]');

async function patches(page: Page) {
  return (await callsTo(page, 'settings:set')) as Array<Record<string, unknown>>;
}

test('auto-import and the rule numbers save as they change, and odd numbers are refused', async ({
  page,
}) => {
  await openPerformance(page, { page: 'settings' });
  await expect(section(page)).toContainText('Weekly performance');
  await section(page).getByTestId('perf-settings-auto-import').uncheck();
  expect(await patches(page)).toContainEqual({ performance: { autoImportOnStartup: false } });

  const window = page.getByTestId('perf-rule-complianceWindowDays');
  await expect(window).toHaveValue('30');
  await window.fill('45');
  await window.press('Enter');
  expect(await patches(page)).toContainEqual({ performance: { complianceWindowDays: 45 } });

  const weeks = page.getByTestId('perf-rule-atRiskDecliningWeeks');
  await weeks.fill('1');
  await weeks.blur();
  await expect(section(page).getByRole('alert')).toHaveText('Type a whole number from 2 to 26.');
  expect(await patches(page)).not.toContainEqual({ performance: { atRiskDecliningWeeks: 1 } });

  await page.getByTestId('perf-rule-topN').fill('8');
  await page.getByTestId('perf-rule-topN').blur();
  await page.getByTestId('perf-rule-recurringCategoryWeeks').fill('4');
  await page.getByTestId('perf-rule-recurringCategoryWeeks').blur();
  expect(await patches(page)).toContainEqual({ performance: { topN: 8 } });
  expect(await patches(page)).toContainEqual({ performance: { recurringCategoryWeeks: 4 } });
});

// ---------------------------------------------------------------- the old app's data

const FOUND = { found: true, empty: true, demo: false };

test('a first run offers to bring over the weekly performance data, and Yes counts it in words', async ({
  page,
}) => {
  await openPerformance(page, { page: 'home', answers: { 'performance:old-data-find': FOUND } });
  await expect(perfDialog(page)).toContainText(
    'We found your weekly performance data. Bring it over?',
  );
  await onCall(
    page,
    'performance:old-data-run',
    `() => ({ ok: true, value: { status: 'imported', counts: [
      { table: 'perf_drivers', imported: 76 },
      { table: 'perf_weekly_scorecards', imported: 650 },
      { table: 'perf_safety_events', imported: 1 },
      { table: 'perf_imported_files', imported: 90 },
    ] } })`,
  );
  await perfDialog(page).getByRole('button', { name: 'Yes' }).click();
  await expect(perfDialog(page).getByTestId('old-data-summary')).toHaveText(
    'Brought over 76 drivers, 650 weekly scorecards and 1 safety event.',
  );
  expect(await callsTo(page, 'performance:old-data-run')).toEqual([{ from: 'usual' }]);
  await perfDialog(page).getByRole('button', { name: 'Got it' }).click();
  await expect(perfDialog(page)).toHaveCount(0);
  // Answered, so it is not offered again at the next start.
  expect(await patches(page)).toContainEqual({ perfOldDataAsked: true });
});

test('once answered, the weekly performance question is not asked again', async ({ page }) => {
  await openPerformance(page, {
    page: 'home',
    settings: { perfOldDataAsked: true },
    answers: { 'performance:old-data-find': FOUND },
  });
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  expect(await callsTo(page, 'performance:old-data-find')).toEqual([]);
  await expect(perfDialog(page)).toHaveCount(0);
});

test('no question when this app already has weekly data', async ({ page }) => {
  await openPerformance(page, {
    page: 'home',
    answers: { 'performance:old-data-find': { ...FOUND, empty: false } },
  });
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  expect(await callsTo(page, 'performance:old-data-find')).toHaveLength(1);
  await expect(perfDialog(page)).toHaveCount(0);
});

test('no look for the old data in demo mode', async ({ page }) => {
  await installFakeBridge(page, { settings: { demoMode: true } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'home'));
  await page.goto('/');
  await expect(page.locator('[data-shell][data-ready="true"]')).toBeVisible();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  expect(await callsTo(page, 'performance:old-data-find')).toEqual([]);
  await expect(perfDialog(page)).toHaveCount(0);
});

test('the roster question comes first, then the weekly performance one', async ({ page }) => {
  await openPerformance(page, {
    page: 'home',
    answers: { 'performance:old-data-find': FOUND, 'migration:find': FOUND },
  });
  await expect(page.locator('dialog[data-dialog="old-data"]')).toBeVisible();
  await expect(perfDialog(page)).toHaveCount(0);
  await page
    .locator('dialog[data-dialog="old-data"]')
    .getByRole('button', { name: 'Not now' })
    .click();
  await expect(perfDialog(page)).toBeVisible();
  await perfDialog(page).getByRole('button', { name: 'Not now' }).click();
  await expect(perfDialog(page)).toHaveCount(0);
  expect(await callsTo(page, 'performance:old-data-run')).toEqual([]);
  // Each question is remembered on its own.
  expect(await patches(page)).toContainEqual({ oldDataAsked: true });
  expect(await patches(page)).toContainEqual({ perfOldDataAsked: true });
});

test('Settings can bring it over, choosing a different file', async ({ page }) => {
  await openPerformance(page, {
    page: 'settings',
    answers: { 'performance:old-data-find': { ...FOUND, found: false } },
  });
  await page.getByTestId('perf-bring-over-old-data').click();
  // The stand-in finds nothing in the usual place.
  await expect(perfDialog(page)).toContainText(
    'We could not find your weekly performance data in its usual place.',
  );
  await expect(perfDialog(page)).toContainText('app.db');
  await onCall(page, 'performance:old-data-pick', `() => ({ ok: true, value: { chosen: true } })`);
  await onCall(
    page,
    'performance:old-data-run',
    `() => ({ ok: true, value: { status: 'skipped', counts: [] } })`,
  );
  await perfDialog(page).getByRole('button', { name: 'Choose the file' }).click();
  await expect(perfDialog(page)).toContainText(
    'This app already has weekly performance data, so nothing was brought over.',
  );
  expect(await callsTo(page, 'performance:old-data-run')).toEqual([{ from: 'chosen' }]);
});
