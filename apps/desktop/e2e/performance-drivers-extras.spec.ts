// The Drivers tab's newer helpers, on the stand-in bridge: "Show in folder" after making reports
// and saving the check file, counting up while reports are made and emailed, the "What changed
// since last week" lists, and "Email everyone shown". Every name and ID comes from the made-up
// people in packages/fixtures (scripts/parity/wpa/expected).

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, onCall } from './support/fakeBridge';
import { ARCHER, CARMEN, DESMOND, TOBIAS, openPerformance } from './support/performance';

const status = (page: Page) => page.getByTestId('performance-status');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const gridRow = (page: Page, id: string) =>
  page.locator(`[role="grid"] [role="row"][data-row-id="${id}"]`);
const range = { from: '2026-W31', to: '2026-W40' };

/** Makes the stand-in hold its answer to `name` until the test calls `window.__finish()`. */
async function holdAnswer(page: Page, name: string, value: string) {
  await onCall(
    page,
    name,
    `() => new Promise((resolve) => { window.__finish = () => resolve({ ok: true, value: ${value} }); })`,
  );
}
async function finish(page: Page) {
  await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
}

test('after making reports, "Show in folder" opens the folder they went to', async ({ page }) => {
  await openPerformance(page);
  await onCall(
    page,
    'performance:generate',
    `() => ({ ok: true, value: { status: 'written', folderName: 'Reports', written: 3, failed: 0, skipped: 0 } })`,
  );
  await onCall(
    page,
    'performance:show-last-output',
    `() => ({ ok: true, value: { opened: true } })`,
  );
  // Nothing made yet: no button.
  await expect(page.getByTestId('perf-show-in-folder')).toHaveCount(0);
  await page.getByTestId('perf-generate-all').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Make reports' }).click();
  await expect(status(page)).toHaveText('Made 3 reports in the folder "Reports".');
  await page.getByTestId('perf-show-in-folder').click();
  expect(await callsTo(page, 'performance:show-last-output')).toEqual([{ what: 'reports' }]);

  // The next thing said takes the button away.
  await page.getByTestId('perf-generate-selected').click();
  await expect(status(page)).toHaveText(
    'Tick drivers in the first column first, or use Generate all.',
  );
  await expect(page.getByTestId('perf-show-in-folder')).toHaveCount(0);
});

test('after saving the check file, "Show in folder" shows it, and a refusal is said plainly', async ({
  page,
}) => {
  await openPerformance(page);
  await onCall(
    page,
    'performance:export-check-file',
    `() => ({ ok: true, value: { status: 'written', fileName: 'check.csv', drivers: 3, weeks: 10, rows: 30 } })`,
  );
  await onCall(
    page,
    'performance:show-last-output',
    `() => ({ ok: false, reason: 'refused', message: 'That file is not there now. It may have been moved or deleted.' })`,
  );
  await page.getByTestId('perf-export-visible').click();
  await expect(status(page)).toHaveText(
    'Saved the check file "check.csv": 3 drivers, 10 weeks, 30 rows.',
  );
  await page.getByTestId('perf-show-in-folder').click();
  await expect(page.getByTestId('performance-problem')).toContainText(
    'That file is not there now. It may have been moved or deleted.',
  );
  expect(await callsTo(page, 'performance:show-last-output')).toEqual([{ what: 'check-file' }]);
});

test('no "Show in folder" when no report was written', async ({ page }) => {
  await openPerformance(page);
  await onCall(
    page,
    'performance:generate',
    `() => ({ ok: true, value: { status: 'written', folderName: 'Reports', written: 0, failed: 3, skipped: 0 } })`,
  );
  await page.getByTestId('perf-generate-all').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Make reports' }).click();
  await expect(status(page)).toContainText('3 reports could not be made.');
  await expect(page.getByTestId('perf-show-in-folder')).toHaveCount(0);
});

test('counts up while the reports are made, with a progress bar', async ({ page }) => {
  await openPerformance(page);
  await holdAnswer(
    page,
    'performance:generate',
    `{ status: 'written', folderName: 'Reports', written: 3, failed: 0, skipped: 0 }`,
  );
  await page.getByTestId('perf-generate-all').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Make reports' }).click();
  await expect(status(page)).toHaveText('Making 3 reports...');

  await emit(page, 'performance:progress', { job: 'generate', done: 0, total: 3 });
  await expect(page.getByTestId('perf-progress-words')).toHaveText('Making report 1 of 3...');
  await emit(page, 'performance:progress', { job: 'generate', done: 2, total: 3 });
  await expect(page.getByTestId('perf-progress-words')).toHaveText('Making report 3 of 3...');
  const bar = page.getByRole('progressbar', { name: 'Reports made' });
  await expect(bar).toHaveAttribute('aria-valuenow', '2');
  await expect(bar).toHaveAttribute('aria-valuemax', '3');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Making report 3 of 3...');

  await finish(page);
  await expect(status(page)).toHaveText('Made 3 reports in the folder "Reports".');
  await expect(page.getByTestId('perf-progress')).toHaveCount(0);
  // A stray count after the work is done shows nothing.
  await emit(page, 'performance:progress', { job: 'generate', done: 3, total: 3 });
  await expect(page.getByTestId('perf-progress')).toHaveCount(0);
});

test('counts up while emailing: "Emailing 2 of 2..."', async ({ page }) => {
  await openPerformance(page, { performance: { selected: [ARCHER.id, DESMOND.id] } });
  await onCall(
    page,
    'performance:email',
    `(input) => input.dryRun
      ? ({ ok: true, value: { dryRun: true, sent: 0, notSent: [], wouldSend: [
          { transporterId: '${ARCHER.id}', name: '${ARCHER.name}', to: 'driver034@example.com', subject: 'Report' },
          { transporterId: '${DESMOND.id}', name: '${DESMOND.name}', to: 'driver035@example.com', subject: 'Report' },
        ] } })
      : new Promise((resolve) => { window.__finish = () => resolve({ ok: true, value: { dryRun: false, sent: 2, notSent: [], wouldSend: [] } }); })`,
  );
  await page.getByTestId('perf-email-selected').click();
  await dialog(page, 'perf-email-dry-run').getByRole('button', { name: 'Send 2 emails' }).click();
  await emit(page, 'performance:progress', { job: 'generate', done: 1, total: 2 });
  await expect(page.getByTestId('perf-progress-words')).toHaveText('Making report 2 of 2...');
  await emit(page, 'performance:progress', { job: 'email', done: 1, total: 2 });
  await expect(page.getByTestId('perf-progress-words')).toHaveText('Emailing 2 of 2...');
  await expect(page.getByRole('progressbar', { name: 'Emails sent' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await finish(page);
  await expect(page.getByTestId('perf-email-result')).toHaveText('Sent 2.');
  await expect(page.getByTestId('perf-progress')).toHaveCount(0);
});

const CHANGES = {
  newestWeek: '2026-W40',
  previousWeek: '2026-W39',
  tierUp: 1,
  tierDown: 2,
  newSafetyEvents: 3,
  tierMoves: [
    { transporterId: CARMEN.id, name: CARMEN.name, from: 'Gold', to: 'Platinum' },
    { transporterId: DESMOND.id, name: DESMOND.name, from: 'Platinum', to: 'Bronze' },
    { transporterId: TOBIAS.id, name: TOBIAS.name, from: 'Platinum', to: 'Gold' },
  ],
  safetyDrivers: [{ transporterId: ARCHER.id, name: ARCHER.name, count: 3 }],
};

test('"What changed" counts open the list of drivers, and a name shows their row', async ({
  page,
}) => {
  await openPerformance(page, { data: { changes: CHANGES } });
  const strip = page.getByTestId('perf-changes');
  await expect(strip).toHaveText(
    'What changed since last week: 2026-W40 compared with 2026-W39: 1 driver moved up a tier, ' +
      '2 moved down, 3 new safety events.',
  );

  await page.getByTestId('perf-changes-down').click();
  const list = dialog(page, 'perf-changes-list');
  await expect(list).toContainText('Moved down a tier');
  await expect(list).toContainText('Since 2026-W39.');
  const names = list.getByTestId('perf-changes-name');
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toContainText(DESMOND.name);
  await expect(names.nth(0)).toContainText('Platinum to Bronze');
  await names.nth(0).click();
  await expect(list).toHaveCount(0);
  await expect(gridRow(page, DESMOND.id)).toHaveAttribute('aria-selected', 'true');
  await expect(gridRow(page, DESMOND.id).locator('[data-col-id="name"]')).toBeFocused();

  await page.getByTestId('perf-changes-safety').click();
  await expect(list).toContainText('Drivers with safety events in 2026-W40.');
  await expect(list.getByTestId('perf-changes-name')).toHaveText([`${ARCHER.name}3 safety events`]);
  await list.getByRole('button', { name: 'Close' }).click();
  await expect(list).toHaveCount(0);
});

test('a name hidden by the filter chips switches them off, and says so', async ({ page }) => {
  // Carmen is inactive, and only active drivers show to start with.
  await openPerformance(page, { data: { changes: CHANGES } });
  await expect(gridRow(page, CARMEN.id)).toHaveCount(0);
  await page.getByTestId('perf-changes-up').click();
  await dialog(page, 'perf-changes-list').getByTestId('perf-changes-name').click();
  await expect(status(page)).toHaveText(
    `The filters were hiding ${CARMEN.name}, so they are switched off now.`,
  );
  await expect(gridRow(page, CARMEN.id)).toHaveAttribute('aria-selected', 'true');
});

test('counts of zero, or without a list, stay plain words', async ({ page }) => {
  const { tierMoves: _moves, safetyDrivers: _safety, ...countsOnly } = CHANGES;
  void _moves;
  void _safety;
  await openPerformance(page, { data: { changes: { ...countsOnly, tierUp: 0 } } });
  await expect(page.getByTestId('perf-changes-up')).toHaveText('0 drivers moved up a tier');
  for (const which of ['up', 'down', 'safety'])
    await expect(page.locator(`button[data-testid="perf-changes-${which}"]`)).toHaveCount(0);
});

test('"Email everyone shown" uses the drivers shown, with the same list first', async ({
  page,
}) => {
  await openPerformance(page);
  await onCall(
    page,
    'performance:email',
    `(input) => ({ ok: true, value: {
      dryRun: input.dryRun,
      sent: input.dryRun ? 0 : 3,
      notSent: [],
      wouldSend: input.dryRun ? input.transporterIds.map((id) => ({ transporterId: id, name: id, to: 'office@example.com', subject: 'Report' })) : [],
    } })`,
  );
  await page.getByTestId('perf-email-visible').click();
  const dry = dialog(page, 'perf-email-dry-run');
  await expect(dry).toContainText('Email 3 reports?');
  await expect(dry).toContainText('Nothing has been sent yet.');
  await dry.getByRole('button', { name: 'Send 3 emails' }).click();
  await expect(page.getByTestId('perf-email-result')).toHaveText('Sent 3.');
  await dialog(page, 'perf-email-result').getByRole('button', { name: 'OK' }).click();
  await expect(status(page)).toHaveText('Sent 3.');
  const shown = [ARCHER.id, DESMOND.id, TOBIAS.id];
  expect(await callsTo(page, 'performance:email')).toEqual([
    { transporterIds: shown, range, dryRun: true },
    { transporterIds: shown, range, dryRun: false },
  ]);

  // With nobody shown it says what to do and sends nothing.
  await page.getByTestId('perf-tier-silver').click();
  await page.getByTestId('perf-email-visible').click();
  await expect(status(page)).toHaveText(
    'There are no drivers shown. Change the filters or the search.',
  );
  expect(await callsTo(page, 'performance:email')).toHaveLength(2);
});
