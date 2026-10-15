// The Scorecards page, Performance tab, on the stand-in bridge: the grid and its columns, the filter
// chips and week range (remembered in the settings), ticking drivers, making, exporting and
// emailing reports (a dry run first), the safety events list, the right-click items and the
// keys. The numbers themselves are proved by the performance package's tests.

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_EMAIL } from '../src/shared/performanceSettings';
import { callsTo, onCall } from './support/fakeBridge';
import {
  ARCHER,
  CARMEN,
  DESMOND,
  FABIAN,
  TOBIAS,
  WEEKS,
  copied,
  driverRow,
  openPerformance,
  setPerf,
} from './support/performance';

const rows = (page: Page) => page.locator('[role="rowgroup"] [role="row"]');
const row = (page: Page, text: string) => page.locator('[role="row"]', { hasText: text });
const status = (page: Page) => page.getByTestId('scorecards-status');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);

async function settingsPatches(page: Page): Promise<Array<Record<string, unknown>>> {
  return (await callsTo(page, 'settings:set')) as Array<Record<string, unknown>>;
}

test('sits after Associates in the menu, with three tabs, and says where to start when empty', async ({
  page,
}) => {
  await openPerformance(page, { brief: { hasData: false, weeks: [] }, data: { drivers: [] } });
  const menu = (await page
    .locator('[data-nav]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-nav')))) as string[];
  expect(menu.indexOf('scorecards')).toBe(menu.indexOf('associates') + 1);
  await expect(page.getByRole('tab')).toHaveText(['Performance', 'Reports', 'Imports']);
  await expect(page.getByText('No weekly performance data yet')).toBeVisible();
  await expect(page.getByTestId('perf-week-from')).toBeDisabled();
  await page.getByTestId('perf-go-imports').click();
  await expect(page.getByTestId('scorecards-tab-imports')).toHaveAttribute('aria-selected', 'true');
});

test('shows Lifetime Routes right after Status, with each driver’s count', async ({ page }) => {
  await openPerformance(page);
  const names = (await page.locator('[role="columnheader"]').allInnerTexts()) as string[];
  const at = names.findIndex((name) => name.trim() === 'Status');
  expect(names[at + 1]?.trim()).toBe('Lifetime Routes');
  await expect(row(page, ARCHER.name)).toContainText('412');
  await expect(row(page, DESMOND.name)).toContainText('57');
});

test('shows the drivers with the old columns, tier chips, trend words and red safety counts', async ({
  page,
}) => {
  await openPerformance(page);
  // Active and In latest scorecard are the starting chips: the inactive and offboarded drivers
  // are not shown, nor the active driver with no scorecard in these weeks.
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, CARMEN.name)).toHaveCount(0);
  await expect(row(page, TOBIAS.name)).toHaveCount(0);
  await expect(page.getByTestId('perf-activity-in-range')).toHaveText('In latest scorecard');
  await expect(page.getByTestId('perf-activity-in-range')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('perf-shown-line')).toHaveText(
    'Showing 2 drivers of 5. Weeks held: 2026-W31 to 2026-W40.',
  );
  await page.getByTestId('perf-activity-all').click();
  await expect(rows(page)).toHaveCount(3);
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Pick',
    'Driver',
    'Transporter ID',
    'Status',
    'Lifetime Routes',
    'Latest Week',
    'Latest Tier',
    'Latest Score',
    'Latest Rank',
    'Latest Packages',
    'Average Score',
    'Average Rank',
    'Average Packages',
    'Average CDF',
    'Average DSB',
    'Average DC DPMO',
    'Average POD',
    'Average PSB',
    'Average CED',
    'Δ Score',
    'Trend',
    'Program impact',
    'Speeding',
    'Sign/Signal',
    'Distraction',
    'Following distance',
    'Seatbelt',
  ]);
  const archer = row(page, ARCHER.name);
  await expect(archer.getByTestId('perf-tier')).toHaveText('Gold');
  await expect(archer).toContainText('32 / 61');
  await expect(archer).toContainText('93.6');
  await expect(archer.getByTestId('perf-safety-speeding')).toHaveText('2');
  await expect(archer.getByTestId('perf-safety-total')).toHaveText('2');
  await expect(row(page, DESMOND.name)).toContainText('Declining');
  // The trend word shows on hover too, and a safety count above zero is red.
  await expect(row(page, DESMOND.name).locator('[title="Declining"]')).toHaveCount(1);
  await expect(archer.getByTestId('perf-safety-speeding')).toHaveClass(/text-bad/);
  await expect(row(page, DESMOND.name)).toContainText('-4.2');
  await expect(page.getByTestId('perf-changes')).toContainText(
    '2026-W40 compared with 2026-W39: 3 drivers moved up a tier, 2 moved down, 1 new safety event.',
  );
  await expect(page.getByTestId('perf-shown-line')).toHaveText(
    'Showing 3 drivers of 5. Weeks held: 2026-W31 to 2026-W40.',
  );
});

test('every column sorts by its number, not its text', async ({ page }) => {
  await openPerformance(page, {
    data: {
      drivers: [
        driverRow(ARCHER, { latestPackages: 1200 }),
        driverRow(DESMOND, { latestPackages: 95 }),
        driverRow(TOBIAS, { latestPackages: 800 }),
      ],
    },
  });
  await page.getByRole('columnheader', { name: 'Latest Packages' }).click();
  // As text, "1200" would come before "800" and "95".
  await expect(rows(page).locator('[data-col-id="latest-packages"]')).toHaveText([
    '95',
    '800',
    '1200',
  ]);
});

test('the search box finds drivers by name or Transporter ID', async ({ page }) => {
  await openPerformance(page);
  const search = page.getByRole('searchbox', { name: 'Search this table' });
  await search.fill(DESMOND.id);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, DESMOND.name)).toHaveCount(1);
  await search.fill('archer');
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, ARCHER.name)).toHaveCount(1);
});

test('the status and tier chips narrow the list and are remembered; the activity chip is not', async ({
  page,
}) => {
  await openPerformance(page);
  await page.getByTestId('perf-status-inactive').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, CARMEN.name)).toHaveCount(1);
  expect(await settingsPatches(page)).toContainEqual({
    performance: { filters: ['status:INACTIVE'] },
  });

  // All statuses, still only the drivers in the latest scorecard; Everyone shows the fifth.
  await page.getByTestId('perf-status-all').click();
  await expect(rows(page)).toHaveCount(4);
  await page.getByTestId('perf-activity-all').click();
  await expect(rows(page)).toHaveCount(5);
  await page.getByTestId('perf-tier-platinum').click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByTestId('perf-activity-none').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, TOBIAS.name)).toHaveCount(1);
  // Only the tier is remembered: nothing about the activity chip is saved.
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { filters: ['tier:Platinum'] },
  });
  expect(JSON.stringify(await settingsPatches(page))).not.toContain('activity:');

  // Away and back: the tier chip is still on, and the activity chip starts afresh.
  await page.click('[data-nav="associates"]');
  await page.click('[data-nav="scorecards"]');
  await expect(page.getByTestId('perf-tier-platinum')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('perf-activity-in-range')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, TOBIAS.name)).toHaveCount(0);
});

test('opens with the filters, the weeks and the ticks it remembered', async ({ page }) => {
  await openPerformance(page, {
    performance: {
      filters: ['status:OFFBOARDED'],
      weekRange: { from: '2026-W35', to: '2026-W38' },
      selected: [FABIAN.id],
    },
  });
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, FABIAN.name).getByTestId('perf-pick')).toBeChecked();
  await expect(page.getByTestId('perf-status-offboarded')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('perf-week-from')).toHaveValue('2026-W35');
  await expect(page.getByTestId('perf-week-to')).toHaveValue('2026-W38');
  expect(await callsTo(page, 'performance:drivers')).toContainEqual({
    range: { from: '2026-W35', to: '2026-W38' },
  });
  await expect(page.getByTestId('perf-ticked-count')).toHaveText('1 driver ticked.');
});

test('the week range picker reads the drivers again and remembers the choice', async ({ page }) => {
  await openPerformance(page);
  await expect(page.getByTestId('perf-weeks-all')).toHaveAttribute('aria-pressed', 'true');
  // Both lists offer every week brought in.
  await expect(page.getByTestId('perf-week-from').locator('option')).toHaveText(WEEKS);
  await expect(page.getByTestId('perf-week-to').locator('option')).toHaveText(WEEKS);
  expect(await callsTo(page, 'performance:drivers')).toContainEqual({
    range: { from: '2026-W31', to: '2026-W40' },
  });

  await page.getByTestId('perf-weeks-last-4').click();
  await expect(page.getByTestId('perf-weeks-last-4')).toHaveAttribute('aria-pressed', 'true');
  expect(await settingsPatches(page)).toContainEqual({
    performance: { weekRange: { from: '2026-W37', to: '2026-W40' } },
  });
  await expect
    .poll(() => callsTo(page, 'performance:drivers'))
    .toContainEqual({ range: { from: '2026-W37', to: '2026-W40' } });

  await page.getByTestId('perf-week-from').selectOption('2026-W33');
  await expect(page.getByTestId('perf-week-from')).toHaveValue('2026-W33');
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { weekRange: { from: '2026-W33', to: '2026-W40' } },
  });

  // A first week after the last week is refused in plain words.
  await page.getByTestId('perf-week-to').selectOption('2026-W34');
  await page.getByTestId('perf-week-from').selectOption('2026-W36');
  await expect(status(page)).toHaveText(
    'The first week must be the same as the last week or before it.',
  );
  await expect(page.getByTestId('perf-week-from')).toHaveValue('2026-W33');

  await page.getByTestId('perf-weeks-all').click();
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { weekRange: { from: null, to: null } },
  });
});

test('ticking, Select all shown and Clear selection are remembered', async ({ page }) => {
  await openPerformance(page);
  // Everyone, not only the drivers in the latest scorecard (the starting chip).
  await page.getByTestId('perf-activity-all').click();
  await row(page, DESMOND.name).getByTestId('perf-pick').check();
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { selected: [DESMOND.id] },
  });
  await expect(page.getByTestId('perf-ticked-count')).toHaveText('1 driver ticked.');

  // The table's own search narrows what "shown" means.
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('Tobias');
  await expect(rows(page)).toHaveCount(1);
  await page.getByTestId('perf-select-visible').click();
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { selected: [DESMOND.id, TOBIAS.id] },
  });
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('');
  await page.getByTestId('perf-select-visible').click();
  expect((await settingsPatches(page)).at(-1)).toEqual({
    performance: { selected: [DESMOND.id, TOBIAS.id, ARCHER.id] },
  });
  await expect(page.getByTestId('perf-ticked-count')).toHaveText('3 drivers ticked.');

  await page.getByTestId('perf-clear-selection').click();
  expect((await settingsPatches(page)).at(-1)).toEqual({ performance: { selected: [] } });
  await expect(page.getByTestId('perf-pick').first()).not.toBeChecked();
});

test('Generate asks first, then makes the reports for the ticked or the shown drivers', async ({
  page,
}) => {
  await openPerformance(page);
  // Everyone, not only the drivers in the latest scorecard (the starting chip).
  await page.getByTestId('perf-activity-all').click();
  await page.getByTestId('perf-generate-selected').click();
  await expect(status(page)).toHaveText(
    'Tick drivers in the first column first, or use Generate all.',
  );

  await onCall(
    page,
    'performance:generate',
    `() => ({ ok: true, value: { status: 'written', folderName: 'Reports', written: 1, failed: 0, skipped: 0 } })`,
  );
  await row(page, ARCHER.name).getByTestId('perf-pick').check();
  await page.getByTestId('perf-generate-selected').click();
  await expect(dialog(page, 'confirm')).toContainText('Make 1 report?');
  await expect(dialog(page, 'confirm')).toContainText('weeks 2026-W31 to 2026-W40');
  await dialog(page, 'confirm').getByRole('button', { name: 'Make reports' }).click();
  await expect(status(page)).toHaveText('Made 1 report in the folder "Reports".');

  await page.getByTestId('perf-generate-all').click();
  await expect(dialog(page, 'confirm')).toContainText('Make 3 reports?');
  await dialog(page, 'confirm').getByRole('button', { name: 'Not now' }).click();
  expect(await callsTo(page, 'performance:generate')).toEqual([
    { transporterIds: [ARCHER.id], range: { from: '2026-W31', to: '2026-W40' } },
  ]);

  // Ctrl+G does the same as Generate for selected.
  await page.keyboard.press('Control+g');
  await expect(dialog(page, 'confirm')).toContainText('Make 1 report?');
  await dialog(page, 'confirm').getByRole('button', { name: 'Make reports' }).click();
  await expect.poll(async () => (await callsTo(page, 'performance:generate')).length).toBe(2);
});

test('Export writes the check file for the ticked or the shown drivers', async ({ page }) => {
  await openPerformance(page);
  // Everyone, not only the drivers in the latest scorecard (the starting chip).
  await page.getByTestId('perf-activity-all').click();
  await onCall(
    page,
    'performance:export-check-file',
    `(input) => ({ ok: true, value: { status: 'written', fileName: 'check.csv', drivers: input.transporterIds.length, weeks: 10, rows: input.transporterIds.length * 10 } })`,
  );
  await page.getByTestId('perf-export-visible').click();
  await expect(status(page)).toHaveText(
    'Saved the check file "check.csv": 3 drivers, 10 weeks, 30 rows.',
  );
  await row(page, TOBIAS.name).getByTestId('perf-pick').check();
  await page.getByTestId('perf-export-selected').click();
  await expect(status(page)).toHaveText(
    'Saved the check file "check.csv": 1 driver, 10 weeks, 10 rows.',
  );
  expect(await callsTo(page, 'performance:export-check-file')).toEqual([
    { transporterIds: [ARCHER.id, DESMOND.id, TOBIAS.id] },
    { transporterIds: [TOBIAS.id] },
  ]);
});

test('Email selected shows who would get what first, then sends and says what happened', async ({
  page,
}) => {
  await openPerformance(page, {
    performance: {
      selected: [ARCHER.id, DESMOND.id],
      email: { ...DEFAULT_EMAIL, bccAddress: 'office@example.com' },
    },
  });
  await onCall(
    page,
    'performance:email',
    `(input) => ({ ok: true, value: {
      dryRun: input.dryRun,
      sent: input.dryRun ? 0 : 1,
      notSent: [{ transporterId: '${DESMOND.id}', name: '${DESMOND.name}', reason: 'no address on file' }],
      wouldSend: input.dryRun ? [{ transporterId: '${ARCHER.id}', name: '${ARCHER.name}', to: 'driver034@example.com', subject: 'Your Weekly Performance Report (2026-W31 – 2026-W40)' }] : [],
    } })`,
  );
  await page.getByTestId('perf-email-selected').click();
  const dry = dialog(page, 'perf-email-dry-run');
  await expect(dry).toContainText('Email 1 report?');
  await expect(dry).toContainText('Nothing has been sent yet.');
  await expect(dry.getByTestId('perf-email-would-send')).toContainText('driver034@example.com');
  await expect(dry.getByTestId('perf-email-not-sent')).toContainText(
    `${DESMOND.name}: no address on file`,
  );
  await expect(dry).toContainText('A hidden copy of each email goes to office@example.com.');
  await dry.getByRole('button', { name: 'Send 1 email' }).click();
  await expect(page.getByTestId('perf-email-result')).toHaveText(
    'Sent 1, could not send 1: no address on file.',
  );
  await dialog(page, 'perf-email-result').getByRole('button', { name: 'OK' }).click();
  await expect(status(page)).toHaveText('Sent 1, could not send 1: no address on file.');
  const range = { from: '2026-W31', to: '2026-W40' };
  expect(await callsTo(page, 'performance:email')).toEqual([
    { transporterIds: [ARCHER.id, DESMOND.id], range, dryRun: true },
    { transporterIds: [ARCHER.id, DESMOND.id], range, dryRun: false },
  ]);

  // Ctrl+E starts the same, and Not now sends nothing.
  await page.keyboard.press('Control+e');
  await dry.getByRole('button', { name: 'Not now' }).click();
  expect(await callsTo(page, 'performance:email')).toHaveLength(3);
});

test('Email before email is set up offers to open Settings', async ({ page }) => {
  await openPerformance(page, {
    brief: { emailReady: false },
    performance: { selected: [ARCHER.id] },
  });
  await page.getByTestId('perf-email-selected').click();
  await expect(dialog(page, 'confirm')).toContainText('Email is not set up yet');
  await dialog(page, 'confirm').getByRole('button', { name: 'Open Settings' }).click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  expect(await callsTo(page, 'performance:email')).toEqual([]);
});

test('a red safety count opens that driver’s events, with the video link to copy', async ({
  page,
}) => {
  await openPerformance(page);
  await setPerf(page, {
    safety: [
      {
        id: 1,
        transporterId: ARCHER.id,
        week: '2026-W39',
        name: ARCHER.name,
        eventDate: '2026-09-22',
        programImpact: 'Scorecard',
        metricType: 'Speeding',
        metricSubtype: 'Over 10 mph',
        source: 'Camera',
        videoLink: 'https://video.example.com/event/1',
        reviewDetails: 'Reviewed',
        sourceFile: 'Safety_Dashboard_week39.csv',
      },
      {
        id: 2,
        transporterId: ARCHER.id,
        week: '2026-W40',
        name: ARCHER.name,
        eventDate: '2026-09-30',
        programImpact: 'Scorecard',
        metricType: 'Speeding',
        metricSubtype: 'Over 5 mph',
        source: 'Camera',
        videoLink: null,
        reviewDetails: '',
        sourceFile: 'Safety_Dashboard_week40.csv',
      },
    ],
  });
  await row(page, ARCHER.name).getByTestId('perf-safety-speeding').click();
  const box = dialog(page, 'perf-safety');
  await expect(box).toContainText(`Safety events: ${ARCHER.name}`);
  await expect(box.getByTestId('perf-safety-summary')).toHaveText(
    '2 events, 1 with a video. Events with no program impact are left out.',
  );
  // Newest first.
  await expect(box.locator('tbody tr').first()).toContainText('2026-09-30');
  await box.getByTestId('perf-copy-video').click();
  await expect(box.getByTestId('perf-copy-video')).toContainText('Copied');
  expect(await copied(page)).toEqual(['https://video.example.com/event/1']);
  // (The dev server draws the window twice on purpose, so it may ask twice.)
  expect(await callsTo(page, 'performance:safety-events')).toContainEqual({
    transporterId: ARCHER.id,
    range: { from: '2026-W31', to: '2026-W40' },
    metricType: 'Speeding',
  });
  await box.getByRole('button', { name: 'Close' }).click();

  // The Program impact total lists every kind.
  await row(page, ARCHER.name).getByTestId('perf-safety-total').click();
  await expect(box).toContainText('All kinds that count');
  expect((await callsTo(page, 'performance:safety-events')).at(-1)).toMatchObject({
    metricType: null,
  });
});

test('right-click offers Preview PDF, Email this report, Copy email address and Explain this score', async ({
  page,
}) => {
  await openPerformance(page);
  await onCall(page, 'performance:preview-pdf', `() => ({ ok: true, value: { opened: true } })`);
  const cell = row(page, ARCHER.name).locator('[role="gridcell"][data-col-id="name"]');
  await cell.click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveText([
    'Preview PDF',
    'Email this report',
    'Copy email address',
    'Explain this score',
  ]);
  await page.getByRole('menuitem', { name: 'Preview PDF' }).click();
  await expect(status(page)).toHaveText(`Opened the report for ${ARCHER.name}.`);
  expect(await callsTo(page, 'performance:preview-pdf')).toEqual([
    { transporterId: ARCHER.id, range: { from: '2026-W31', to: '2026-W40' } },
  ]);
  // Double-clicking a row opens the report the same way, without saving it anywhere.
  await row(page, DESMOND.name).locator('[role="gridcell"][data-col-id="name"]').dblclick();
  await expect(status(page)).toHaveText(`Opened the report for ${DESMOND.name}.`);
  expect((await callsTo(page, 'performance:preview-pdf')).at(-1)).toEqual({
    transporterId: DESMOND.id,
    range: { from: '2026-W31', to: '2026-W40' },
  });

  await cell.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy email address' }).click();
  await expect(status(page)).toHaveText(`Copied the email address for ${ARCHER.name}.`);
  expect(await copied(page)).toEqual(['driver034@example.com']);

  await onCall(
    page,
    'performance:email',
    `() => ({ ok: true, value: { dryRun: true, sent: 0, notSent: [], wouldSend: [] } })`,
  );
  await cell.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Email this report' }).click();
  await expect(dialog(page, 'perf-email-dry-run')).toContainText('No reports to email');
  await expect(dialog(page, 'perf-email-dry-run')).toContainText(
    'Email addresses come from the driver list.',
  );
  expect(await callsTo(page, 'performance:email')).toEqual([
    { transporterIds: [ARCHER.id], range: { from: '2026-W31', to: '2026-W40' }, dryRun: true },
  ]);
});
