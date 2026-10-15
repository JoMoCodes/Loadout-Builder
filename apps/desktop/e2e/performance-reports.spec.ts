// The Scorecards page, Reports tab, on the stand-in bridge: the thresholds table at the top (with
// "asks before replacing"), and the report colours with a live preview of the report of each
// driver shown on the Performance tab (buttons and arrow keys), or of a sample page when nobody is
// shown; saving and resetting the colours.

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_REPORT_COLOURS } from '../src/shared/performanceSettings';
import { callsTo, onCall } from './support/fakeBridge';
import { ARCHER, DESMOND, openPerformance, setPerf } from './support/performance';

const status = (page: Page) => page.getByTestId('scorecards-status');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const frame = (page: Page, testId: string) => page.frameLocator(`[data-testid="${testId}"]`);

type HtmlAsk = { transporterId: string | null; range: unknown; colours: Record<string, unknown> };
const htmlAsks = async (page: Page) =>
  (await callsTo(page, 'performance:report-html')) as HtmlAsk[];

test('Thresholds is at the top, and the preview is part of the colours card', async ({ page }) => {
  await openPerformance(page, { tab: 'reports' });
  const cards = page.locator('[data-testid="perf-reports"] section');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute('aria-labelledby', 'perf-thresholds-title');
  await expect(cards.nth(1)).toHaveAttribute('aria-labelledby', 'perf-colours-title');
  await expect(cards.nth(1).getByTestId('perf-driver-preview')).toBeVisible();
  await expect(page.getByText('Preview a driver')).toHaveCount(0);
  // The Settings button sits above the cards, on the right.
  const button = page.getByTestId('scorecards-settings');
  await expect(button).toHaveText('Settings');
  const buttonBox = (await button.boundingBox())!;
  const cardBox = (await cards.nth(0).boundingBox())!;
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBox.y + 1);
  expect(buttonBox.x + buttonBox.width).toBeGreaterThan(cardBox.x + cardBox.width / 2);
});

test('the driver’s page follows the colours being edited, and Save keeps them', async ({
  page,
}) => {
  await openPerformance(page, { tab: 'reports' });
  await expect(frame(page, 'perf-driver-frame').locator('h1')).toHaveText(`Report ${ARCHER.id}`);
  expect(await htmlAsks(page)).toContainEqual({
    transporterId: ARCHER.id,
    range: { from: '2026-W31', to: '2026-W40' },
    colours: DEFAULT_REPORT_COLOURS,
  });

  await page.getByTestId('perf-colour-goldBackground').fill('#123456');
  await expect(page.getByTestId('perf-colours-unsaved')).toBeVisible();
  await expect
    .poll(async () => (await htmlAsks(page)).at(-1)?.colours.goldBackground)
    .toBe('#123456');

  await page.getByTestId('perf-use-colour').uncheck();
  await expect(page.getByTestId('perf-colour-goldBackground')).toBeDisabled();
  await expect.poll(async () => (await htmlAsks(page)).at(-1)?.colours.useColor).toBe(false);

  await page.getByTestId('perf-save-colours').click();
  await expect(status(page)).toHaveText('Report colours saved.');
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: {
      colours: { ...DEFAULT_REPORT_COLOURS, goldBackground: '#123456', useColor: false },
    },
  });
  await expect(page.getByTestId('perf-colours-unsaved')).toHaveCount(0);
  await expect(page.getByTestId('perf-save-colours')).toBeDisabled();
});

test('Undo changes and Reset to the old colours', async ({ page }) => {
  await openPerformance(page, {
    tab: 'reports',
    performance: { colours: { ...DEFAULT_REPORT_COLOURS, bronzeBackground: '#000000' } },
  });
  await page.getByTestId('perf-colour-silverBackground').fill('#abcdef');
  await page.getByTestId('perf-undo-colours').click();
  await expect(page.getByTestId('perf-colour-silverBackground')).toHaveValue('#d1d1d1');

  await onCall(
    page,
    'performance:reset-colours',
    `() => ({ ok: true, value: ${JSON.stringify(DEFAULT_REPORT_COLOURS)} })`,
  );
  await page.getByTestId('perf-reset-colours').click();
  await expect(status(page)).toHaveText('Report colours are back to the old app’s colours.');
  await expect(page.getByTestId('perf-colour-bronzeBackground')).toHaveValue('#aa4918');
  expect(await callsTo(page, 'performance:reset-colours')).toHaveLength(1);
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    performance: { colours: DEFAULT_REPORT_COLOURS },
  });
});

test('the preview steps through the drivers shown on the Performance tab', async ({ page }) => {
  await openPerformance(page, { tab: 'reports' });
  const preview = page.getByTestId('perf-driver-preview');
  // Active drivers in the latest scorecard (the Performance tab's starting chips): two of the five.
  await expect(page.getByTestId('perf-preview-position')).toHaveText('Driver 1 of 2');
  await expect(page.getByTestId('perf-preview-name')).toHaveText(ARCHER.name);
  await expect(frame(page, 'perf-driver-frame').locator('h1')).toHaveText(`Report ${ARCHER.id}`);

  await page.getByTestId('perf-preview-next').click();
  await expect(page.getByTestId('perf-preview-name')).toHaveText(DESMOND.name);
  await expect
    .poll(async () => (await htmlAsks(page)).at(-1))
    .toMatchObject({ transporterId: DESMOND.id, range: { from: '2026-W31', to: '2026-W40' } });

  // The arrow keys move too; it goes round from the last to the first.
  await preview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('perf-preview-name')).toHaveText(ARCHER.name);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('perf-preview-name')).toHaveText(DESMOND.name);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('perf-preview-position')).toHaveText('Driver 1 of 2');

  await page.getByTestId('perf-preview-jump').selectOption(DESMOND.id);
  await expect(page.getByTestId('perf-preview-position')).toHaveText('Driver 2 of 2');
});

test('with no drivers shown, the preview says what to do and shows the sample page', async ({
  page,
}) => {
  await openPerformance(page, { tab: 'reports', performance: { filters: ['tier:Silver'] } });
  await expect(page.getByTestId('perf-driver-preview')).toContainText(
    'No drivers are shown on the Performance tab. Change its filters to preview a report.',
  );
  await expect(page.getByTestId('perf-preview-name')).toHaveCount(0);
  await expect(frame(page, 'perf-sample-frame').locator('h1')).toHaveText('Sample report');
  expect(await htmlAsks(page)).toContainEqual({
    transporterId: null,
    range: null,
    colours: DEFAULT_REPORT_COLOURS,
  });
  // The sample follows the colours too.
  await page.getByTestId('perf-colour-goldBackground').fill('#123456');
  await expect
    .poll(async () => (await htmlAsks(page)).at(-1))
    .toMatchObject({ transporterId: null, colours: { goldBackground: '#123456' } });
});

test('with no scorecards yet, the preview says so and shows the sample page', async ({ page }) => {
  await openPerformance(page, { tab: 'reports', brief: { weeks: [], hasData: false } });
  await expect(page.getByTestId('perf-driver-preview')).toContainText(
    'Bring in some scorecards first. The Imports tab does that.',
  );
  await expect(frame(page, 'perf-sample-frame').locator('h1')).toHaveText('Sample report');
});

test('the thresholds table, and bringing them in asks before replacing', async ({ page }) => {
  await openPerformance(page, { tab: 'reports' });
  await expect(page.getByText('No thresholds yet')).toBeVisible();
  // The table is as tall as a few rows, not a tall empty box.
  const table = page.locator('section[aria-labelledby="perf-thresholds-title"] [data-grid-view]');
  const emptyHeight = (await table.boundingBox())!.height;
  expect(emptyHeight).toBeLessThan(260);

  // None yet: nothing to replace, so no question.
  await onCall(
    page,
    'performance:choose-and-import',
    `() => {
      window.__perf.thresholds = [{ metricName: 'Overall', metricNameDisplay: 'Overall Score', direction: 'Higher is better', platinum: '93', gold: '85', silver: '75', bronze: '0', weight: '', sourceWeek: '2026-W40' }];
      window.__bump();
      return { ok: true, value: { kind: 'thresholds', filesRead: 1, rows: 12, driversAdded: 0, weeks: ['2026-W40'], problems: [] } };
    }`,
  );
  await page.getByTestId('perf-import-thresholds').click();
  await expect(status(page)).toHaveText('Brought in 1 file: 12 rows, week 2026-W40.');
  const overall = page.locator('[role="row"]', { hasText: 'Overall Score' });
  await expect(overall).toContainText('Higher is better');
  await expect(overall).toContainText('93');
  expect(await callsTo(page, 'performance:choose-and-import')).toEqual([{ kind: 'thresholds' }]);
  // Four thresholds take a little more room; a long list stops growing at twelve rows.
  const four = Array.from({ length: 4 }, (_, i) => ({
    metricName: `Metric ${i}`,
    metricNameDisplay: `Metric ${i}`,
    direction: 'Higher is better',
    platinum: '9',
    gold: '8',
    silver: '7',
    bronze: '0',
    weight: '',
    sourceWeek: '2026-W40',
  }));
  await setPerf(page, { thresholds: four });
  await page.evaluate(() => (window as unknown as { __bump: () => void }).__bump());
  await expect(page.locator('[role="rowgroup"] [role="row"]')).toHaveCount(4);
  const fourHeight = (await table.boundingBox())!.height;
  expect(fourHeight).toBeGreaterThan(emptyHeight);
  await setPerf(page, {
    thresholds: Array.from({ length: 30 }, (_, i) => ({ ...four[0]!, metricName: `M${i}` })),
  });
  await page.evaluate(() => (window as unknown as { __bump: () => void }).__bump());
  await expect.poll(async () => (await table.boundingBox())!.height).toBeGreaterThan(fourHeight);
  expect((await table.boundingBox())!.height).toBeLessThan(fourHeight * 4);
  await setPerf(page, { thresholds: four.slice(0, 1) });
  await page.evaluate(() => (window as unknown as { __bump: () => void }).__bump());
  await expect(page.locator('[role="rowgroup"] [role="row"]')).toHaveCount(1);

  // Now there are some: it asks first, and No keeps them.
  await page.getByTestId('perf-import-thresholds').click();
  await expect(dialog(page, 'confirm')).toContainText(
    'This replaces the thresholds you have. Go ahead?',
  );
  await dialog(page, 'confirm').getByRole('button', { name: 'No, keep them' }).click();
  expect(await callsTo(page, 'performance:choose-and-import')).toHaveLength(1);

  await setPerf(page, {});
  await page.getByTestId('perf-import-thresholds').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, choose a file' }).click();
  await expect
    .poll(async () => (await callsTo(page, 'performance:choose-and-import')).length)
    .toBe(2);
});

test('the preview zooms: Fit width, 100%, in and out, remembered in this window', async ({
  page,
}) => {
  await openPerformance(page, { tab: 'reports' });
  await expect(frame(page, 'perf-driver-frame').locator('h1')).toHaveText(`Report ${ARCHER.id}`);
  const level = page.getByTestId('perf-zoom-level');
  const pageBox = page.getByTestId('perf-zoom-page');
  const scale = async () => Number(await pageBox.getAttribute('data-scale'));
  const width = async () => (await pageBox.boundingBox())!.width;
  const boxWidth = async () =>
    page.getByTestId('perf-zoom-box').evaluate((el) => (el as HTMLElement).clientWidth);

  // It starts fitting the width: the page is as wide as the box. The box can still be settling
  // when the sample first draws (the preview measures it again as it changes), so wait for it.
  await expect(page.getByTestId('perf-zoom-fit')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Math.abs((await width()) - (await boxWidth()))).toBeLessThan(4);

  await page.getByTestId('perf-zoom-100').click();
  await expect(level).toHaveText('100%');
  await expect(page.getByTestId('perf-zoom-100')).toHaveAttribute('aria-pressed', 'true');
  expect(Math.round(await width())).toBe(816);

  await page.getByTestId('perf-zoom-in').click();
  await expect(level).toHaveText('125%');
  expect(await scale()).toBe(1.25);
  await page.getByTestId('perf-zoom-out').click();
  await page.getByTestId('perf-zoom-out').click();
  await expect(level).toHaveText('75%');
  expect(Math.round(await width())).toBe(612);
  // Too small to read is as far as it goes.
  for (let i = 0; i < 4; i++) {
    if (await page.getByTestId('perf-zoom-out').isEnabled())
      await page.getByTestId('perf-zoom-out').click();
  }
  await expect(level).toHaveText('25%');
  await expect(page.getByTestId('perf-zoom-out')).toBeDisabled();

  // Remembered in this window.
  await page.getByTestId('perf-zoom-in').click();
  await expect(level).toHaveText('50%');
  await page.reload();
  await expect(page.getByTestId('perf-zoom-level')).toHaveText('50%');
  await page.getByTestId('perf-zoom-fit').click();
  await page.reload();
  await expect(page.getByTestId('perf-zoom-fit')).toHaveAttribute('aria-pressed', 'true');
});
