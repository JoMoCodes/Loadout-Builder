// The Weekly performance part of Settings, and the question about the old Weekly Performance
// App's data, on the stand-in bridge: auto-import, the rule numbers, the email setup (saved
// through settings:set), the app password (kept by the main process, never shown), the test
// email, and bringing the old data over on a first run or from Settings.

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_EMAIL } from '../src/shared/performanceSettings';
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

test('the email fields save together, and a bad port is refused in plain words', async ({
  page,
}) => {
  await openPerformance(page, { page: 'settings' });
  await expect(page.getByTestId('perf-email-host')).toHaveValue('smtp.gmail.com');
  await expect(page.getByTestId('perf-email-save')).toBeDisabled();
  await expect(section(page)).toContainText('{name} becomes the driver’s name');
  await expect(section(page)).toContainText('search for App passwords');

  // Undo changes throws the changes away.
  await page.getByTestId('perf-email-from').fill('someone@example.com');
  await page.getByTestId('perf-email-undo').click();
  await expect(page.getByTestId('perf-email-from')).toHaveValue('');
  await expect(page.getByTestId('perf-email-save')).toBeDisabled();

  await page.getByTestId('perf-email-from').fill('dispatch@example.com');
  await page.getByTestId('perf-email-from-name').fill('Example Delivery Team');
  await page.getByTestId('perf-email-bcc').fill('office@example.com');
  await page.getByTestId('perf-email-subject').fill('Your report ({from} to {to})');
  await page.getByTestId('perf-email-port').fill('abc');
  await page.getByTestId('perf-email-save').click();
  await expect(page.getByTestId('perf-email-note')).toHaveText(
    'The port must be a whole number, like 587.',
  );
  expect((await patches(page)).some((patch) => 'performance' in patch)).toBe(false);

  await page.getByTestId('perf-email-port').fill('465');
  await page.getByTestId('perf-email-save').click();
  await expect(page.getByTestId('perf-email-note')).toHaveText('Email settings saved.');
  expect(await patches(page)).toContainEqual({
    performance: {
      email: {
        ...DEFAULT_EMAIL,
        fromAddress: 'dispatch@example.com',
        fromName: 'Example Delivery Team',
        bccAddress: 'office@example.com',
        subjectTemplate: 'Your report ({from} to {to})',
        smtpPort: 465,
      },
    },
  });
  await expect(page.getByTestId('perf-email-save')).toBeDisabled();
});

test('the app password is saved without its spaces and never shown again', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await expect(page.getByTestId('perf-password-status')).toHaveText('Not saved.');
  await onCall(
    page,
    'performance:set-email-password',
    `(input) => ({ ok: true, value: { passwordSaved: input.password !== '', canSeal: true } })`,
  );
  const box = page.getByTestId('perf-password');
  await expect(box).toHaveAttribute('type', 'password');
  await box.fill('abcd efgh ijkl mnop');
  await page.getByTestId('perf-password-save').click();
  await expect(page.getByTestId('perf-password-note')).toHaveText('App password saved.');
  await expect(page.getByTestId('perf-password-status')).toContainText('Saved.');
  await expect(box).toHaveValue('');
  expect(await callsTo(page, 'performance:set-email-password')).toEqual([
    { password: 'abcdefghijklmnop' },
  ]);
  // It never goes into the settings file.
  expect(JSON.stringify(await patches(page))).not.toContain('abcd');

  await page.getByTestId('perf-password-forget').click();
  await expect(page.getByTestId('perf-password-status')).toHaveText('Not saved.');
  expect((await callsTo(page, 'performance:set-email-password')).at(-1)).toEqual({
    password: '',
  });
});

test('Send test email saves first, then says whether it went', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await onCall(
    page,
    'performance:email-test',
    `() => ({ ok: true, value: { sent: false, problem: 'Gmail did not accept the app password. Check it and save it again.' } })`,
  );
  await page.getByTestId('perf-email-from').fill('dispatch@example.com');
  await page.getByTestId('perf-test-to').fill('me@example.com');
  await page.getByTestId('perf-email-test').click();
  await expect(page.getByTestId('perf-test-note')).toHaveText(
    'Gmail did not accept the app password. Check it and save it again.',
  );
  expect(await patches(page)).toContainEqual({
    performance: { email: { ...DEFAULT_EMAIL, fromAddress: 'dispatch@example.com' } },
  });
  expect(await callsTo(page, 'performance:email-test')).toEqual([{ to: 'me@example.com' }]);

  await onCall(
    page,
    'performance:email-test',
    `() => ({ ok: true, value: { sent: true, problem: null } })`,
  );
  await page.getByTestId('perf-email-test').click();
  await expect(page.getByTestId('perf-test-note')).toHaveText('Test email sent. Check the inbox.');
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
