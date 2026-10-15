// The weekly checklist on Home, on the stand-in bridge: it sits beside the first-day one, ticks
// itself off as the weekly data changes, its buttons open the right page and tab (and press the
// page's own button), its "?" says where to get each file, it hides once done, and Home and How
// to use bring it back. The weekly data here is made up (counts only, no names).

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, installFakeBridge, onCall } from './support/fakeBridge';

const list = (page: Page) => page.getByTestId('weekly-checklist');
const step = (page: Page, id: string) => list(page).locator(`[data-step="${id}"]`);
const count = (page: Page) => page.getByTestId('weekly-checklist-count');

/** Changes the stand-in's weekly data the way the app does: change it, then say so. */
async function changePerf(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((given) => {
    const fake = window.__fake!;
    Object.assign(fake.snapshot.performance as object, given);
    (fake.snapshot as { revision: number }).revision += 1;
  }, patch);
  await emit(page, 'state:changed', { revision: 99 });
}

/** The driver list step watches the Associates list, not the weekly data. */
async function changeAssociates(page: Page, associates: number) {
  await page.evaluate((n) => {
    const fake = window.__fake!;
    (fake.snapshot.counts as { associates: number }).associates = n;
    (fake.snapshot as { revision: number }).revision += 1;
  }, associates);
  await emit(page, 'state:changed', { revision: 99 });
}

const SYNC = {
  at: '2026-10-05T08:00:00Z',
  newFiles: 12,
  rows: 400,
  weeksUpdated: 1,
  missingFolders: [],
  problems: [],
};

test.beforeEach(async ({ page }) => {
  await installFakeBridge(page);
  await page.addInitScript(() => {
    localStorage.setItem('loadout.page', 'home');
    // The Dashboard's own answer is not what these tests look at: an empty one will do.
    window.__fake!.hooks['performance:dashboard'] = () => ({ ok: true, value: { hasData: false } });
  });
});

test('sits beside the first-day list, with nothing done, pointing at the driver list', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('first-run-checklist')).toBeVisible();
  await expect(list(page)).toBeVisible();
  await expect(list(page)).toContainText('Your weekly performance');
  await expect(count(page)).toHaveText('0 of 5 done');
  await expect(list(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(step(page, 'perf-roster')).toHaveAttribute('data-step-current', 'true');
  for (const id of ['perf-roster', 'perf-folders', 'perf-sync', 'perf-dashboard', 'perf-reports'])
    await expect(step(page, id)).toHaveAttribute('data-step-done', 'false');
  // The two lists keep their own counts.
  await expect(page.getByTestId('checklist-count')).toHaveText('0 of 6 done');
});

test('ticks itself off as the weekly data changes', async ({ page }) => {
  await page.goto('/');
  await expect(count(page)).toHaveText('0 of 5 done');

  await changePerf(page, { drivers: 61, withEmail: 58 });
  // The weekly data alone does not tick it: the Associates list does.
  await expect(step(page, 'perf-roster')).toHaveAttribute('data-step-done', 'false');
  await changeAssociates(page, 61);
  await expect(step(page, 'perf-roster')).toHaveAttribute('data-step-done', 'true');
  await expect(step(page, 'perf-folders')).toHaveAttribute('data-step-current', 'true');
  await expect(step(page, 'perf-folders').locator('[data-step-do]')).toHaveText(
    'Open the Imports tab',
  );
  // Before any folder is chosen, the sync step brings in the scorecards by hand.
  await expect(step(page, 'perf-sync').locator('[data-step-do]')).toHaveText(
    'Bring in the scorecards',
  );

  await changePerf(page, { foldersChosen: 10 });
  await expect(count(page)).toHaveText('2 of 5 done');
  await expect(step(page, 'perf-sync').locator('[data-step-do]')).toHaveText('Sync now');

  await changePerf(page, { lastSync: SYNC, hasData: true, weeks: ['2026-W39', '2026-W40'] });
  await expect(count(page)).toHaveText('3 of 5 done');
  await expect(step(page, 'perf-dashboard')).toHaveAttribute('data-step-current', 'true');

  // Opening the Dashboard ticks its step.
  await page.click('[data-nav="dashboard"]');
  await expect(page.locator('[data-page="dashboard"]')).toBeVisible();
  await page.click('[data-nav="home"]');
  await expect(count(page)).toHaveText('4 of 5 done');

  // Email not set up yet: the last button sets it up first.
  await expect(step(page, 'perf-reports').locator('[data-step-do]')).toHaveText('Set up email');
  await changePerf(page, { emailReady: true });
  await expect(step(page, 'perf-reports').locator('[data-step-do]')).toHaveText(
    'Open the Performance tab',
  );
});

test('hides itself once every step is done, and How to use brings it back', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-nav="dashboard"]');
  await page.click('[data-nav="home"]');
  await changePerf(page, {
    drivers: 61,
    foldersChosen: 10,
    lastSync: SYNC,
    hasData: true,
    weeks: ['2026-W40'],
    emailReady: true,
  });
  await changeAssociates(page, 61);
  await expect(count(page)).toHaveText('4 of 5 done');
  await changePerf(page, { reportsEmailed: true });
  await expect(count(page)).toHaveText('5 of 5 done');
  await expect(page.getByTestId('weekly-checklist-finished')).toContainText(
    'All five steps are done',
  );

  // Gone next time Home opens; the first-day list is not touched.
  await page.click('[data-nav="settings"]');
  await page.click('[data-nav="home"]');
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByTestId('first-run-checklist')).toBeVisible();
  expect(
    (await callsTo(page, 'settings:set')).filter(
      (p) => (p as { checklistHidden?: boolean }).checklistHidden !== undefined,
    ),
  ).toEqual([]);

  await page.click('[data-nav="how-to-use"]');
  await page.getByTestId('show-weekly-checklist-again').click();
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(list(page)).toBeVisible();
});

test('"Hide this list" puts it away in the settings file, and Home brings it back', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('weekly-checklist-hide').click();
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByTestId('first-run-checklist')).toBeVisible();
  // Kept in the settings file, so it stays away after the app closes.
  expect(await callsTo(page, 'settings:set')).toContainEqual({ weeklyChecklistHidden: true });

  await page.getByTestId('show-weekly-checklist').click();
  await expect(list(page)).toBeVisible();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ weeklyChecklistHidden: false });
});

test('stays away when the settings say so, and the Help menu brings it back', async ({ page }) => {
  await installFakeBridge(page, { settings: { weeklyChecklistHidden: true } });
  await page.goto('/');
  await expect(page.getByTestId('first-run-checklist')).toBeVisible();
  await expect(list(page)).toHaveCount(0);

  // Go somewhere else first: the Help menu brings it back and opens Home.
  await page.click('[data-nav="settings"]');
  await page.getByTestId('help-menu').click();
  await page.getByTestId('help-show-weekly-checklist').click();
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(list(page)).toBeVisible();
  expect(await callsTo(page, 'settings:set')).toContainEqual({ weeklyChecklistHidden: false });

  // Showing now, so the Help menu no longer offers it.
  await page.getByTestId('help-menu').click();
  await expect(page.getByTestId('help-show-weekly-checklist')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('opening the Dashboard is kept in the settings file, once', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-nav="dashboard"]');
  await expect(page.locator('[data-page="dashboard"]')).toBeVisible();
  await expect
    .poll(() => callsTo(page, 'settings:set'))
    .toContainEqual({ dashboardSeenOnce: true });
  await page.click('[data-nav="home"]');
  await page.click('[data-nav="dashboard"]');
  await page.click('[data-nav="home"]');
  const seen = (await callsTo(page, 'settings:set')).filter(
    (p) => (p as { dashboardSeenOnce?: boolean }).dashboardSeenOnce !== undefined,
  );
  expect(seen).toHaveLength(1);
});

test('starts with the Dashboard step ticked when the settings say it was opened', async ({
  page,
}) => {
  await installFakeBridge(page, {
    settings: { dashboardSeenOnce: true },
    snapshot: { performance: { hasData: true, weeks: ['2026-W40'] } as never },
  });
  await page.goto('/');
  await expect(step(page, 'perf-dashboard')).toHaveAttribute('data-step-done', 'true');
});

test('the driver list button opens Associates and presses Import Associates', async ({ page }) => {
  await page.goto('/');
  await expect(step(page, 'perf-roster').locator('[data-step-do]')).toHaveText(
    'Import driver list',
  );
  // The person closes the file window.
  await onCall(page, 'files:pick', '() => ({ ok: true, value: { path: null } })');
  await step(page, 'perf-roster').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await expect.poll(() => callsTo(page, 'files:pick')).toEqual([{ kind: 'associates' }]);
  expect(await callsTo(page, 'performance:choose-and-import')).toEqual([]);
});

test('the Dashboard button opens the Dashboard, and the email button opens Settings', async ({
  page,
}) => {
  await page.goto('/');
  await step(page, 'perf-dashboard').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="dashboard"]')).toBeVisible();

  await page.click('[data-nav="home"]');
  await step(page, 'perf-reports').locator('[data-step-do]').click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
  await expect(page.locator('[data-setting="performance"]')).toBeInViewport();
});

test('the ? on a step says where to get the files', async ({ page }) => {
  await page.goto('/');
  await step(page, 'perf-folders').locator('[data-step-help]').click();
  const note = page.locator('dialog[data-dialog="where-to-get"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Where to keep the weekly exports');
  // All nine kinds of weekly export, each with where it comes from (the driver list is not one).
  await expect(note.locator('[data-export]')).toHaveCount(9);
  await expect(note.locator('[data-export="scorecards"]')).toContainText(
    'weekly overview dashboard export',
  );
  await expect(note.locator('img').first()).toBeVisible();
  await note.getByRole('button', { name: 'Close' }).click();
  await expect(note).toHaveCount(0);

  await step(page, 'perf-reports').locator('[data-step-help]').click();
  await expect(note).toContainText('App password');
});

test('demo mode keeps its own weekly list', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('weekly-checklist-hide').click();
  await expect(list(page)).toHaveCount(0);
  // Practising with made-up data starts the weekly list afresh.
  await page.getByTestId('checklist-try-demo').click();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  await expect(list(page)).toBeVisible();

  // In demo mode, hiding it and opening the Dashboard last for this run only: nothing is saved.
  const before = (await callsTo(page, 'settings:set')).length;
  await page.getByTestId('weekly-checklist-hide').click();
  await expect(list(page)).toHaveCount(0);
  await page.click('[data-nav="dashboard"]');
  await page.click('[data-nav="home"]');
  const after = (await callsTo(page, 'settings:set')).slice(before);
  expect(
    after.filter(
      (p) =>
        (p as Record<string, unknown>).weeklyChecklistHidden !== undefined ||
        (p as Record<string, unknown>).dashboardSeenOnce !== undefined,
    ),
  ).toEqual([]);
  // Turning demo mode off goes back to the real data's own choice.
  await page.getByRole('button', { name: 'Turn off demo mode' }).click();
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
});
