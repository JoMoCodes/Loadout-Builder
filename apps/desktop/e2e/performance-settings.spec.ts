// The report emails' wording behind the Settings button on the Scorecards page, and the question
// about the old Weekly Performance App's data, on the stand-in bridge: the subject and message of
// the report emails, and bringing the old data over on a first run (the only time it is offered).
// The email setup is the Email part of Settings (email-settings.spec.ts); the rule numbers behind
// the Dashboard's lists are in its own window (dashboard.spec.ts); auto-import is on the Imports
// tab (performance-imports.spec.ts).

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_EMAIL } from '../src/shared/performanceSettings';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';
import { openPerformance } from './support/performance';

const perfDialog = (page: Page) => page.locator('dialog[data-dialog="perf-old-data"]');
const wording = (page: Page) => page.locator('dialog[data-dialog="perf-email-wording"]');

async function patches(page: Page) {
  return (await callsTo(page, 'settings:set')) as Array<Record<string, unknown>>;
}

test('Settings has no Weekly performance part any more', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  await expect(page.locator('[data-setting="performance"]')).toHaveCount(0);
  await expect(page.getByTestId('perf-settings-auto-import')).toHaveCount(0);
  await expect(page.getByTestId('perf-rule-topN')).toHaveCount(0);
  await expect(page.getByTestId('perf-bring-over-old-data')).toHaveCount(0);
});

// ------------------------------------------------------------ the report emails' wording

test('Settings on the Performance tab opens the report emails’ wording; Save keeps it', async ({
  page,
}) => {
  await openPerformance(page);
  const button = page.getByTestId('scorecards-settings');
  await expect(button).toHaveText('Settings');
  // At the right end of the button row.
  const strip = page.getByRole('toolbar', { name: 'Driver actions' });
  await expect(strip.locator('button').last()).toHaveAttribute(
    'data-testid',
    'scorecards-settings',
  );
  await button.click();
  await expect(wording(page).getByRole('heading')).toHaveText('Email wording');
  await expect(wording(page)).toContainText(
    'What each driver gets with their report. The address and server come from Settings.',
  );
  await expect(wording(page)).toContainText('Placeholders: {name} {from} {to}');
  const subject = page.getByTestId('perf-email-subject');
  await expect(subject).toHaveValue(DEFAULT_EMAIL.subjectTemplate);
  await expect(page.getByTestId('perf-email-body')).toHaveValue(DEFAULT_EMAIL.bodyTemplate);
  await expect(page.getByTestId('perf-email-save')).toBeDisabled();
  await expect(page.getByTestId('perf-email-undo')).toBeDisabled();

  // Undo throws the changes away.
  await subject.fill('Your report ({from} to {to})');
  await expect(page.getByTestId('perf-email-save')).toBeEnabled();
  await page.getByTestId('perf-email-undo').click();
  await expect(subject).toHaveValue(DEFAULT_EMAIL.subjectTemplate);

  await subject.fill('Your report ({from} to {to})');
  await page.getByTestId('perf-email-body').fill('Hi {name}, your report is attached.');
  await page.getByTestId('perf-email-save').click();
  await expect(page.getByTestId('perf-email-note')).toHaveText('Email wording saved.');
  expect(await patches(page)).toContainEqual({
    email: {
      subjectTemplate: 'Your report ({from} to {to})',
      bodyTemplate: 'Hi {name}, your report is attached.',
    },
  });
  // Nothing else about the email setup is touched.
  expect(JSON.stringify(await patches(page))).not.toContain('smtpHost');
  await expect(page.getByTestId('perf-email-save')).toBeDisabled();
  await wording(page).getByRole('button', { name: 'Close' }).click();
  await expect(wording(page)).toHaveCount(0);

  // The Reports tab opens the same window, with the saved wording; Esc closes it.
  await page.getByTestId('scorecards-tab-reports').click();
  await page.getByTestId('scorecards-settings').click();
  await expect(page.getByTestId('perf-email-subject')).toHaveValue('Your report ({from} to {to})');
  await expect(page.getByTestId('perf-email-body')).toHaveValue(
    'Hi {name}, your report is attached.',
  );
  await page.keyboard.press('Escape');
  await expect(wording(page)).toHaveCount(0);
});

test('a subject or message that is too long is refused in plain words', async ({ page }) => {
  await openPerformance(page, { tab: 'reports' });
  await page.getByTestId('scorecards-settings').click();
  await page.getByTestId('perf-email-subject').fill('x'.repeat(301));
  await page.getByTestId('perf-email-save').click();
  await expect(page.getByTestId('perf-email-note')).toHaveText(
    'The subject can be up to 300 letters long.',
  );
  await page.getByTestId('perf-email-subject').fill('Your report');
  await page.getByTestId('perf-email-body').fill('y'.repeat(5001));
  await page.getByTestId('perf-email-save').click();
  await expect(page.getByTestId('perf-email-note')).toHaveText(
    'The message can be up to 5000 letters long.',
  );
  expect((await patches(page)).some((patch) => 'email' in patch)).toBe(false);
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
      { table: 'associates', imported: 76 },
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

test('Choose a different file on the first-run question picks first, then brings it over', async ({
  page,
}) => {
  await openPerformance(page, { page: 'home', answers: { 'performance:old-data-find': FOUND } });
  await expect(perfDialog(page)).toContainText('Bring it over?');
  await onCall(page, 'performance:old-data-pick', `() => ({ ok: true, value: { chosen: true } })`);
  await onCall(
    page,
    'performance:old-data-run',
    `() => ({ ok: true, value: { status: 'skipped', counts: [] } })`,
  );
  await perfDialog(page).getByRole('button', { name: 'Choose a different file' }).click();
  await expect(perfDialog(page)).toContainText(
    'This app already has weekly performance data, so nothing was brought over.',
  );
  expect(await callsTo(page, 'performance:old-data-run')).toEqual([{ from: 'chosen' }]);
});
