// The Scorecards page, Imports tab, on the stand-in bridge: one card per kind of export with its
// folder, last import and warnings; Choose folder, Bring in again and Forget folder; asking before
// bringing in weeks that are already there; Sync now and the auto-import switch; and files or
// folders dropped on a card or on the tab. The real reading is proved by the main process's
// tests and the Electron smoke check.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { callsTo, onCall } from './support/fakeBridge';
import { importCard, openPerformance } from './support/performance';

const card = (page: Page, kind: string) => page.getByTestId(`perf-card-${kind}`);
const result = (page: Page) => page.getByTestId('perf-import-result');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);

const SUMMARY = (kind: string, values: Record<string, unknown> = {}) => ({
  kind,
  filesRead: 10,
  rows: 647,
  driversAdded: 16,
  weeks: ['2026-W31', '2026-W35', '2026-W40'],
  problems: [],
  ...values,
});

const CARDS = () => [
  importCard('thresholds', {
    folderName: 'DSP_Thresholds_Scoring_Metadata_2026-W32.csv',
    lastImportAt: '2026-10-05T14:30:00',
  }),
  importCard('scorecards', {
    folderName: 'Scorecards',
    lastImportAt: '2026-10-05T14:30:00',
    newestWeek: '2026-W40',
  }),
  importCard('dsb', {
    folderName: 'DSB',
    folderMissing: true,
    lastImportAt: '2026-10-05T14:30:00',
    newestWeek: '2026-W40',
    missingWeeks: ['2026-W33'],
  }),
];

/** Drags a made-up file over a place and lets go, the way a file from the computer arrives. */
async function dropFile(page: Page, target: Locator, name: string) {
  const data = await page.evaluateHandle((fileName) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['made-up'], fileName));
    return transfer;
  }, name);
  await target.dispatchEvent('dragenter', { dataTransfer: data });
  await target.dispatchEvent('dragover', { dataTransfer: data });
  await target.dispatchEvent('drop', { dataTransfer: data });
}

test('one card per kind, with its folder, last import and plain warnings', async ({ page }) => {
  await openPerformance(page, { tab: 'imports', data: { cards: CARDS() } });
  // One card per kind, each taking files dropped on it, inside the tab that takes them too.
  // The driver list has no card: it is brought in on Associates, and the tab says so.
  await expect(page.locator('article[data-testid^="perf-card-"]')).toHaveCount(9);
  await expect(page.locator('[data-drop-kind]')).toHaveCount(10);
  await expect(page.getByTestId('perf-card-roster')).toHaveCount(0);
  await expect(page.getByTestId('perf-driver-list-hint')).toHaveText(
    'The driver list is not brought in here. Bring in the driver list on Associates; this page uses the same list.',
  );
  await expect(card(page, 'thresholds')).toContainText('Thresholds');
  await expect(card(page, 'thresholds').getByTestId('perf-card-folder')).toHaveText(
    'File: DSP_Thresholds_Scoring_Metadata_2026-W32.csv',
  );
  await expect(card(page, 'thresholds')).toContainText('Choose file…');
  await expect(card(page, 'scorecards').getByTestId('perf-card-folder')).toHaveText(
    'Folder: Scorecards',
  );
  await expect(card(page, 'scorecards').getByTestId('perf-card-last')).toHaveText(
    'Last brought in Oct 05, 2026 at 02:30 PM. Newest week: 2026-W40.',
  );
  await expect(card(page, 'dsb').getByTestId('perf-card-missing-folder')).toContainText(
    'That folder is not there now. If it is on a USB stick, plug it in.',
  );
  await expect(card(page, 'dsb').getByTestId('perf-card-missing-weeks')).toHaveText(
    'No DSB file for 2026-W33.',
  );
  await expect(card(page, 'safety').getByTestId('perf-card-folder')).toHaveText(
    'No folder chosen yet',
  );
  await expect(card(page, 'safety').getByTestId('perf-card-last')).toHaveText('Not brought in yet');
  await expect(card(page, 'safety').getByTestId('perf-again-safety')).toBeDisabled();
  await expect(page.getByTestId('perf-last-sync')).toHaveText(
    'The app has not looked for new files yet.',
  );
});

test('Choose folder brings the kind in and sums it up in plain words', async ({ page }) => {
  await openPerformance(page, { tab: 'imports', data: { cards: CARDS() } });
  await onCall(
    page,
    'performance:choose-and-import',
    `(input) => ({ ok: true, value: ${JSON.stringify(
      SUMMARY('safety', {
        problems: ['Safety_Dashboard_week33.csv: row 4 has no Transporter ID.'],
      }),
    )} })`,
  );
  // Nothing brought in yet for this kind: no question first.
  await card(page, 'safety').getByTestId('perf-choose-safety').click();
  await expect(result(page)).toContainText(
    'Brought in 10 files: 647 rows, 16 new drivers, weeks 2026-W31 to 2026-W40.',
  );
  await expect(page.getByTestId('perf-import-problems')).toHaveText(
    'Safety_Dashboard_week33.csv: row 4 has no Transporter ID.',
  );
  await expect(page.getByTestId('scorecards-status')).toHaveText('Brought in, with some problems.');
  expect(await callsTo(page, 'performance:choose-and-import')).toEqual([{ kind: 'safety' }]);
});

test('bringing in a kind that has weeks asks first, and the buttons wait while it runs', async ({
  page,
}) => {
  await openPerformance(page, { tab: 'imports', data: { cards: CARDS() } });
  await card(page, 'scorecards').getByTestId('perf-again-scorecards').click();
  await expect(dialog(page, 'confirm')).toContainText(
    'This replaces the weeks already brought in from these files. Go ahead?',
  );
  await dialog(page, 'confirm').getByRole('button', { name: 'No, keep what I have' }).click();
  expect(await callsTo(page, 'performance:import')).toEqual([]);

  // A slow import: every import button waits.
  await onCall(
    page,
    'performance:import',
    `() => new Promise((done) => { window.__finish = () => done({ ok: true, value: ${JSON.stringify(
      SUMMARY('scorecards', { filesRead: 1, rows: 64, driversAdded: 0, weeks: ['2026-W40'] }),
    )} }); })`,
  );
  await card(page, 'scorecards').getByTestId('perf-again-scorecards').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, bring them in' }).click();
  await expect(page.getByTestId('perf-sync-now')).toBeDisabled();
  await expect(card(page, 'thresholds').getByTestId('perf-choose-thresholds')).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
  await expect(result(page)).toHaveText('Brought in 1 file: 64 rows, week 2026-W40.');
  await expect(page.getByTestId('perf-sync-now')).toBeEnabled();
  expect(await callsTo(page, 'performance:import')).toEqual([{ kind: 'scorecards' }]);
});

test('Forget folder forgets it, and a refusal is shown in plain words', async ({ page }) => {
  await openPerformance(page, { tab: 'imports', data: { cards: CARDS() } });
  await card(page, 'dsb').getByTestId('perf-forget-dsb').click();
  await expect(page.getByTestId('scorecards-status')).toHaveText(
    'The app no longer looks for the delivery concessions files there.',
  );
  expect(await callsTo(page, 'performance:forget-folder')).toEqual([{ kind: 'dsb' }]);

  await onCall(
    page,
    'performance:choose-and-import',
    `() => ({ ok: false, reason: 'refused', message: 'That folder has no DSB files in it.' })`,
  );
  await card(page, 'cdf').getByTestId('perf-choose-cdf').click();
  await expect(page.getByTestId('perf-import-problems')).toHaveText(
    'Customer feedback (CDF): That folder has no DSB files in it.',
  );
});

test('Sync now sums up what was new, and the switch turns auto-import off', async ({ page }) => {
  await openPerformance(page, {
    tab: 'imports',
    data: { cards: CARDS() },
    brief: {
      lastSync: {
        at: '2026-10-11T08:00:00',
        newFiles: 3,
        rows: 120,
        weeksUpdated: 2,
        missingFolders: [],
        problems: [],
      },
    },
  });
  await expect(page.getByTestId('perf-last-sync')).toHaveText(
    'Last looked Oct 11, 2026 at 08:00 AM: 3 new files, 120 rows, 2 weeks updated.',
  );
  await onCall(
    page,
    'performance:sync-now',
    `() => ({ ok: true, value: { at: '2026-10-11T09:00:00', newFiles: 0, rows: 0, weeksUpdated: 0, missingFolders: ['dsb'], problems: [] } })`,
  );
  await page.getByTestId('perf-sync-now').click();
  await expect(result(page)).toHaveText(
    'Everything is already up to date. One folder is not there now, so Delivery scans (DSB) was skipped.',
  );
  expect(await callsTo(page, 'performance:sync-now')).toHaveLength(1);

  // Problems are listed, each saying which kind of export it is about.
  await onCall(
    page,
    'performance:sync-now',
    `() => ({ ok: true, value: { at: '2026-10-11T09:30:00', newFiles: 1, rows: 40, weeksUpdated: 1, missingFolders: [], problems: ['Customer feedback (CDF): week33.csv could not be read.', 'Safety events: week34.csv could not be read.'] } })`,
  );
  await page.getByTestId('perf-sync-now').click();
  await expect(result(page)).toContainText(
    '1 new file, 40 rows, 1 week updated. 2 problems found.',
  );
  await expect(page.getByTestId('perf-import-problems').locator('li')).toHaveText([
    'Customer feedback (CDF): week33.csv could not be read.',
    'Safety events: week34.csv could not be read.',
  ]);

  await expect(page.getByTestId('perf-auto-import')).toBeChecked();
  await page.getByTestId('perf-auto-import').uncheck();
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: { autoImportOnStartup: false },
  });
  await expect(page.getByTestId('perf-auto-import')).not.toBeChecked();
});

test('a file dropped on a card is brought in as that kind', async ({ page }) => {
  await openPerformance(page, { tab: 'imports' });
  await onCall(
    page,
    'performance:dropped',
    `(input) => ({ ok: true, value: [{ kind: input.kind, token: 'dropped-1/' + input.file.name, files: 1 }] })`,
  );
  await onCall(
    page,
    'performance:import',
    `(input) => ({ ok: true, value: ${JSON.stringify(
      SUMMARY('psb', { filesRead: 1, rows: 40, driversAdded: 0, weeks: ['2026-W38'] }),
    )} })`,
  );
  await dropFile(page, page.locator('[data-drop-kind="psb"]'), 'DSP_Pickup_Failures_week38.csv');
  await expect(result(page)).toHaveText('Brought in 1 file: 40 rows, week 2026-W38.');
  expect(await callsTo(page, 'performance:dropped')).toEqual([
    { kind: 'psb', file: 'DSP_Pickup_Failures_week38.csv' },
  ]);
  expect(await callsTo(page, 'performance:import')).toEqual([
    { kind: 'psb', token: 'dropped-1/DSP_Pickup_Failures_week38.csv' },
  ]);
});

test('a folder dropped on the tab is sorted by name, one import per kind found', async ({
  page,
}) => {
  await openPerformance(page, { tab: 'imports' });
  await onCall(
    page,
    'performance:dropped',
    `() => ({ ok: true, value: [
      { kind: 'cdf', token: 'dropped-2/cdf', files: 10 },
      { kind: 'safety', token: 'dropped-2/safety', files: 10 },
    ] })`,
  );
  await onCall(
    page,
    'performance:import',
    `(input) => ({ ok: true, value: { kind: input.kind, filesRead: 10, rows: 100, driversAdded: 0, weeks: ['2026-W31', '2026-W40'], problems: [] } })`,
  );
  await dropFile(page, page.locator('[data-drop-kind="any"]'), 'Weekly exports');
  await expect(result(page)).toContainText(
    'Customer feedback (CDF): Brought in 10 files: 100 rows, weeks 2026-W31 to 2026-W40.',
  );
  await expect(result(page)).toContainText('Safety events: Brought in 10 files');
  expect(await callsTo(page, 'performance:dropped')).toEqual([
    { kind: null, file: 'Weekly exports' },
  ]);
  expect(await callsTo(page, 'performance:import')).toEqual([
    { kind: 'cdf', token: 'dropped-2/cdf' },
    { kind: 'safety', token: 'dropped-2/safety' },
  ]);

  // Nothing recognised: plain words, and nothing is brought in.
  await onCall(page, 'performance:dropped', `() => ({ ok: true, value: [] })`);
  await dropFile(page, page.locator('[data-drop-kind="any"]'), 'notes.txt');
  await expect(page.getByTestId('scorecards-problem')).toContainText(
    'None of those files looked like a weekly export.',
  );
  expect(await callsTo(page, 'performance:import')).toHaveLength(2);
});
