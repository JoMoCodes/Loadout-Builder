// From the Dashboard to a driver's row on the Scorecards page, and "Explain this score" on the
// Drivers tab and the Dashboard, on the stand-in bridge. Every name and ID comes from the
// made-up people in packages/fixtures (scripts/parity/wpa/expected).

import { expect, test, type Page } from '@playwright/test';
import { callsTo } from './support/fakeBridge';
import { ARCHER, DESMOND, explanation, openPerformance, WEEKS } from './support/performance';

const status = (page: Page) => page.getByTestId('scorecards-status');
const explainDialog = (page: Page) => page.locator('dialog[data-dialog="perf-explain-score"]');
const gridRow = (page: Page, id: string) =>
  page.locator(`[role="grid"] [role="row"][data-row-id="${id}"]`);

/** A small made-up Dashboard: Desmond needs a word. */
const DASHBOARD = {
  range: { from: '2026-W31', to: '2026-W40' },
  hasData: true,
  latestWeek: '2026-W40',
  previousWeek: '2026-W39',
  fleetAverage: 90.28,
  fleetAverageBefore: 91.4,
  activeDrivers: 61,
  tiers: [
    { tier: 'Platinum', count: 28 },
    { tier: 'Gold', count: 14 },
    { tier: 'Silver', count: 11 },
    { tier: 'Bronze', count: 8 },
  ],
  tiersBefore: [],
  tierMoves: [],
  packagesDelivered: 12480,
  packagesDeliveredBefore: 12168,
  driversWithSafetyEvents: 7,
  coaching: [
    {
      transporterId: DESMOND.id,
      name: DESMOND.name,
      latestWeek: '2026-W40',
      latestTier: 'Bronze',
      latestScore: 76.36,
      reasons: ['Currently Bronze (2026-W40)', 'Dropped from Platinum to Bronze'],
      severity: 'High',
      topDragMetric: 'Speeding Event Rate',
      topDragScore: 0,
      topDragWeight: 11.6,
      topDragTier: 'Bronze',
    },
  ],
  compliance: [],
  topImproved: [],
  topDeclined: [],
  trend: WEEKS.map((week) => ({ week, avg: 90 })),
  categories: [],
  rules: { atRiskDecliningWeeks: 3, recurringCategoryWeeks: 3, complianceWindowDays: 30, topN: 5 },
};

test('"Open on the Scorecards page" lands on that driver\'s row, switching off a filter that hid them', async ({
  page,
}) => {
  // Only Platinum drivers are showing, so Desmond (Bronze) would be hidden.
  await openPerformance(page, {
    page: 'dashboard',
    tab: 'imports',
    performance: { filters: ['tier:Platinum'] },
    answers: { 'performance:dashboard': DASHBOARD },
  });
  await page.getByTestId('coaching-row').first().click();
  await page.getByTestId('driver-menu-open').click();

  await expect(page.locator('[data-page="scorecards"]')).toBeVisible();
  await expect(page.getByTestId('scorecards-tab-performance')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const desmond = gridRow(page, DESMOND.id);
  await expect(desmond).toBeVisible();
  await expect(desmond).toHaveAttribute('aria-selected', 'true');
  // The keyboard focus is on the driver's name, so arrows and Enter work from there.
  await expect(desmond.locator('[data-col-id="name"]')).toBeFocused();
  await expect(status(page)).toHaveText(
    `The filters were hiding ${DESMOND.name}, so they are switched off now.`,
  );
  await expect(page.getByTestId('perf-tier-platinum')).toHaveAttribute('aria-pressed', 'false');
  expect(await callsTo(page, 'settings:set')).toContainEqual({ performance: { filters: [] } });
  // Read once: the hand-over is gone.
  expect(await page.evaluate(() => sessionStorage.getItem('loadout.performance.driver'))).toBe(
    null,
  );
});

test('"Explain this score" on the Drivers tab lists each metric, the most points lost first', async ({
  page,
}) => {
  await openPerformance(page, {
    answers: { 'performance:explain-score': explanation(DESMOND) },
  });
  // The button works on the driver clicked in the table.
  await expect(page.getByTestId('perf-explain-selected')).toBeDisabled();
  await gridRow(page, DESMOND.id).locator('[data-col-id="name"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this score' }).click();

  const dialog = explainDialog(page);
  await expect(dialog).toContainText(`Explain this score: ${DESMOND.name}`);
  await expect(dialog).toContainText('Week 2026-W40. Overall Score 76.36 (Bronze).');
  await expect(dialog.getByTestId('perf-explain-summary')).toHaveText(
    "Each metric's score counts for its weight. Speeding Event Rate lost the most: 11.6 of 25.1 points.",
  );
  const rows = dialog.getByTestId('perf-explain-row');
  await expect(rows).toHaveCount(4);
  expect(
    await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-metric'))),
  ).toEqual(['Speeding Event Rate', 'DCR', 'POD', 'FICO']);
  await expect(rows.nth(1)).toContainText('39.02');
  await expect(rows.nth(1).getByTestId('perf-explain-lost')).toHaveText('6.4');
  await expect(rows.nth(3)).toContainText('No score, not counted');
  expect(
    new Set((await callsTo(page, 'performance:explain-score')).map((c) => JSON.stringify(c))),
  ).toEqual(
    new Set([
      JSON.stringify({ transporterId: DESMOND.id, range: { from: '2026-W31', to: '2026-W40' } }),
    ]),
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  // The button in the strip explains the driver that is selected.
  await gridRow(page, ARCHER.id).locator('[data-col-id="name"]').click();
  await expect(page.getByTestId('perf-explain-selected')).toBeEnabled();
  await page.getByTestId('perf-explain-selected').click();
  await expect(explainDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(explainDialog(page)).toHaveCount(0);
  expect((await callsTo(page, 'performance:explain-score')).at(-1)).toEqual({
    transporterId: ARCHER.id,
    range: { from: '2026-W31', to: '2026-W40' },
  });
});

test('"Explain this score" from the Dashboard\'s driver menu', async ({ page }) => {
  await openPerformance(page, {
    page: 'dashboard',
    answers: {
      'performance:dashboard': DASHBOARD,
      'performance:explain-score': explanation(DESMOND),
    },
  });
  await page.getByTestId('coaching-row').first().click();
  await page.getByTestId('driver-menu-explain').click();
  const dialog = explainDialog(page);
  await expect(dialog).toContainText(`Explain this score: ${DESMOND.name}`);
  await expect(dialog.getByTestId('perf-explain-summary')).toContainText(
    'Speeding Event Rate lost the most: 11.6 of 25.1 points.',
  );
  // The same metric the "Who needs a word" line names.
  await expect(page.getByTestId('coaching-row').first()).toContainText('Speeding Event Rate');
  expect(
    new Set((await callsTo(page, 'performance:explain-score')).map((c) => JSON.stringify(c))),
  ).toEqual(
    new Set([
      JSON.stringify({ transporterId: DESMOND.id, range: { from: '2026-W31', to: '2026-W40' } }),
    ]),
  );
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-page="dashboard"]')).toBeVisible();
});

test('a driver with no scorecard in the weeks is said so in plain words', async ({ page }) => {
  await openPerformance(page, { answers: { 'performance:explain-score': null } });
  await gridRow(page, DESMOND.id).locator('[data-col-id="name"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this score' }).click();
  await expect(explainDialog(page).getByTestId('perf-explain-summary')).toHaveText(
    `${DESMOND.name} has no scorecard in 2026-W31 to 2026-W40, so there is no score to explain.`,
  );
});

test('a week picker shows any scored week, newest first, with a chart of the points lost', async ({
  page,
}) => {
  const newest = explanation(DESMOND);
  // The week before: only DCR lost points (3 of its 10.5), so it comes first.
  const items = (newest.items as Array<Record<string, unknown>>).map((item) =>
    item.metric === 'DCR'
      ? { ...item, score: 71.43, earned: 7.5, lost: 3 }
      : item.counted
        ? { ...item, score: 100, earned: item.weight, lost: 0 }
        : item,
  );
  const dcr = items.find((item) => item.metric === 'DCR')!;
  const before = {
    ...newest,
    week: '2026-W39',
    overallScore: 97.5,
    overallTier: 'Platinum',
    items: [dcr, ...items.filter((item) => item !== dcr)],
    totalEarned: 22.1,
    totalLost: 3,
    topDrag: dcr,
  };
  await openPerformance(page, {
    answers: { 'performance:explain-score': { ...newest, weeks: [before, newest] } },
  });
  await gridRow(page, DESMOND.id).locator('[data-col-id="name"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this score' }).click();
  const dialog = explainDialog(page);

  const picker = dialog.getByTestId('perf-explain-week');
  await expect(picker).toHaveValue('2026-W40');
  await expect(picker.locator('option')).toHaveText(['2026-W40 (newest)', '2026-W39']);

  const chart = dialog.getByRole('img', { name: /Points lost each week/ });
  await expect(chart).toHaveAttribute(
    'aria-label',
    'Points lost each week. 2026-W39: 3 points lost (DCR 3). ' +
      '2026-W40: 18 points lost (Speeding Event Rate 11.6, DCR 6.4).',
  );
  await expect(dialog.getByTestId('perf-explain-legend')).toHaveText([
    'Speeding Event Rate',
    'DCR',
  ]);
  await expect(dialog.getByTestId('perf-explain-bar')).toHaveCount(2);

  await picker.selectOption('2026-W39');
  await expect(dialog).toContainText('Week 2026-W39. Overall Score 97.5 (Platinum).');
  await expect(dialog.getByTestId('perf-explain-summary')).toHaveText(
    "Each metric's score counts for its weight. DCR lost the most: 3 of 25.1 points.",
  );
  await expect(dialog.getByTestId('perf-explain-earned-total')).toHaveText('22.1');

  // A click on a bar picks that week too.
  await dialog.locator('[data-testid="perf-explain-bar"][data-week="2026-W40"]').click();
  await expect(picker).toHaveValue('2026-W40');
  await expect(dialog).toContainText('Week 2026-W40. Overall Score 76.36 (Bronze).');
});

test('with only one scored week there is no picker, but the chart still shows', async ({
  page,
}) => {
  const newest = explanation(DESMOND);
  await openPerformance(page, {
    answers: { 'performance:explain-score': { ...newest, weeks: [newest] } },
  });
  await gridRow(page, DESMOND.id).locator('[data-col-id="name"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this score' }).click();
  const dialog = explainDialog(page);
  await expect(dialog.getByTestId('perf-explain-summary')).toBeVisible();
  await expect(dialog.getByTestId('perf-explain-week')).toHaveCount(0);
  await expect(dialog.getByTestId('perf-explain-bar')).toHaveCount(1);
});
