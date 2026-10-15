// The page tours, on the stand-in bridge: a tour runs by itself the first time a page opens and
// not the second, Help > "Take the tour" runs it again, Esc skips, Enter goes on, and the tooltip
// is readable in all three themes and at the biggest text size.

import { expect, test, type Page } from '@playwright/test';
import { contrastProblems } from './support/contrast';
import { callsTo, installFakeBridge } from './support/fakeBridge';
import { ARCHER, CARMEN, DESMOND, WEEKS, openPerformance } from './support/performance';
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

test('each Scorecards tab has its own tour', async ({ page }) => {
  await openPerformance(page, {
    tab: 'performance',
    settings: { autoTours: true, toursSeen: ['home'] },
  });
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'scorecards-performance');
  await expect(tour(page)).toContainText('Step 1 of 6');
  await expect(tour(page)).toContainText('Three tabs');
  await page.keyboard.press('Enter');
  await expect(tour(page)).toContainText('Pick the weeks');
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);

  await page.getByTestId('scorecards-tab-imports').click();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'scorecards-imports');
  await expect(tour(page)).toContainText('One card for each file');
  await page.keyboard.press('Escape');

  await page.getByTestId('scorecards-tab-reports').click();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'scorecards-reports');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => seenSaved(page))
    .toEqual(['home', 'scorecards-performance', 'scorecards-imports', 'scorecards-reports']);

  // Help > Take the tour runs the one for the tab on screen.
  await page.getByTestId('help-menu').click();
  await page.getByTestId('take-tour').click();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'scorecards-reports');
  await page.keyboard.press('Escape');
});

test('a Scorecards tour seen when the page was called Performance does not run again', async ({
  page,
}) => {
  await openPerformance(page, {
    tab: 'performance',
    settings: { autoTours: true, toursSeen: ['home', 'performance-drivers'] },
  });
  await expect(page.getByTestId('perf-week-range')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
  // It still runs on request.
  await page.getByTestId('help-menu').click();
  await page.getByTestId('take-tour').click();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'scorecards-performance');
  await page.keyboard.press('Escape');
});

/** A small made-up Dashboard: names from the made-up people in packages/fixtures. */
const DASHBOARD = {
  range: null,
  hasData: true,
  latestWeek: '2026-W40',
  previousWeek: '2026-W39',
  fleetAverage: 90.28,
  fleetAverageBefore: 91.41,
  activeDrivers: 5,
  tiers: [
    { tier: 'Platinum', count: 2 },
    { tier: 'Gold', count: 1 },
    { tier: 'Silver', count: 1 },
    { tier: 'Bronze', count: 1 },
  ],
  tiersBefore: [],
  tierMoves: [],
  packagesDelivered: 4100,
  packagesDeliveredBefore: 3980,
  driversWithSafetyEvents: 1,
  coaching: [
    {
      transporterId: DESMOND.id,
      name: DESMOND.name,
      latestWeek: '2026-W40',
      latestTier: 'Bronze',
      latestScore: 76.36,
      reasons: ['Currently Bronze (2026-W40)'],
      severity: 'High',
      topDragMetric: 'DCR',
      topDragScore: 39.02,
      topDragWeight: 10.5,
      topDragTier: 'Silver',
    },
  ],
  compliance: [
    {
      transporterId: CARMEN.id,
      name: CARMEN.name,
      status: 'ACTIVE',
      qualifications: 'EDV',
      expiresOn: '2026-10-20',
      daysRemaining: 9,
      severity: 'Expiring soon',
      isAlert: true,
      statusDisplay: 'Expires in 9 day(s)',
    },
  ],
  topImproved: [
    {
      transporterId: ARCHER.id,
      name: ARCHER.name,
      firstWeek: '2026-W31',
      lastWeek: '2026-W40',
      firstScore: 80,
      lastScore: 93.58,
      delta: 13.58,
    },
  ],
  topDeclined: [],
  trend: WEEKS.map((week, index) => ({ week, avg: 90 + (index % 3) })),
  categories: [],
  rules: { atRiskDecliningWeeks: 3, recurringCategoryWeeks: 3, complianceWindowDays: 30, topN: 5 },
};

test('the Dashboard has a tour that runs by itself the first time', async ({ page }) => {
  await openPerformance(page, {
    page: 'dashboard',
    settings: { autoTours: true, toursSeen: ['home'] },
    answers: { 'performance:dashboard': DASHBOARD },
  });
  await expect(page.getByTestId('dashboard-body')).toBeVisible();
  // The "no scorecards yet" step is left out: there are scorecards.
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'dashboard', { timeout: 8000 });
  await expect(tour(page)).toContainText('Step 1 of 5');
  await expect(tour(page)).toContainText('Pick the weeks');
  await page.keyboard.press('Enter');
  await expect(tour(page)).toContainText('The week at a glance');
  await page.keyboard.press('Escape');
  await expect.poll(() => seenSaved(page)).toEqual(['home', 'dashboard']);

  // Away and back: it does not run again.
  await page.click('[data-nav="settings"]');
  await page.click('[data-nav="dashboard"]');
  await expect(page.getByTestId('dashboard-body')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
});

test('the Home tour points at the weekly checklist too', async ({ page }) => {
  await installFakeBridge(page, { settings: { autoTours: true } });
  await page.addInitScript(() => localStorage.setItem('loadout.page', 'home'));
  await page.goto('/');
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'home');
  await expect(tour(page)).toContainText('Step 1 of 6');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await expect(tour(page)).toContainText('Your weekly performance');
  await page.keyboard.press('Escape');
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
