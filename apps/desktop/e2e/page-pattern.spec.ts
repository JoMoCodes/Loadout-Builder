// The shared way a page gets its data and runs actions (docs/PAGE-PATTERN.md), driven in a plain
// browser with the stand-in bridge. The real thing is covered by the Electron smoke check.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, emit, installFakeBridge, onCall } from './support/fakeBridge';
import { demoRosterRows } from './support/rosterRows';

/** A previous roster of `rows` made-up drivers, as the snapshot holds it. */
function previousRoster(rows: number) {
  return {
    rows: demoRosterRows(rows).map((view) => view.row),
    loadOutDate: '2026-09-01',
    sourceFile: '',
    importedAt: null,
    routeSource: '',
  };
}

async function openPreviousRoster(page: Page, rows: number) {
  await installFakeBridge(page, {
    settings: { demoMode: false },
    snapshot: { previousRoster: previousRoster(rows), counts: { previousRosterRows: rows } },
  });
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'previous-roster'));
  await page.goto('/');
  await expect(page.locator('[data-page="previous-roster"]')).toBeVisible();
}

test('Load Out with nothing loaded says how to start, in plain words', async ({ page }) => {
  await installFakeBridge(page, { settings: { demoMode: false } });
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'load-out'));
  await page.goto('/');
  await expect(page.getByText('No roster yet.')).toBeVisible();
  await expect(page.getByText("Import today's load-out sheet to start.")).toBeVisible();
  await expect(page.getByTestId('roster-title')).toHaveText('No roster loaded');
});

test('a page reads the snapshot and shows what it holds', async ({ page }) => {
  await openPreviousRoster(page, 12);
  await expect(page.getByTestId('previous-roster-count')).toHaveText(
    /^12 drivers {2}- {2}\d+ had a van$/,
  );
  expect((await callsTo(page, 'state:snapshot')).length).toBeGreaterThanOrEqual(1);
});

test('a command runs, and the page follows when the app says the data changed', async ({
  page,
}) => {
  await openPreviousRoster(page, 12);
  // The stand-in does what the app does: change the data, then say so.
  await onCall(
    page,
    'loadOut:clear-previous-roster',
    `() => {
      window.__fake.snapshot.counts.previousRosterRows = 0;
      window.__fake.snapshot.previousRoster = { ...window.__fake.snapshot.previousRoster, rows: [] };
      setTimeout(() => window.__fake.emit('state:changed', { revision: 2 }), 0);
      return { ok: true, value: null };
    }`,
  );
  await page.getByTestId('clear-previous-roster').click();
  // It asks first, as the old app did.
  await expect(page.getByTestId('confirm-dialog')).toContainText('Remove all 12 rows?');
  // A red question starts on No.
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('previous-roster-count')).toHaveText('No previous roster kept');
  expect(await callsTo(page, 'loadOut:clear-previous-roster')).toHaveLength(1);
  // The page asked again; it did not guess the new numbers.
  expect((await callsTo(page, 'state:snapshot')).length).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('clear-previous-roster')).toBeDisabled();
});

test('a change announced from outside refreshes every page that is looking', async ({ page }) => {
  await openPreviousRoster(page, 3);
  await expect(page.getByTestId('previous-roster-count')).toContainText('3 drivers');
  await page.evaluate((roster) => {
    window.__fake!.snapshot.previousRoster = roster;
  }, previousRoster(7));
  await emit(page, 'state:changed', { revision: 5 });
  await expect(page.getByTestId('previous-roster-count')).toContainText('7 drivers');
});

test('a failed command shows plain words, never a code', async ({ page }) => {
  await openPreviousRoster(page, 2);
  await onCall(page, 'loadOut:clear-previous-roster', `() => ({ ok: false, reason: 'failed' })`);
  await page.getByTestId('clear-previous-roster').click();
  await page.getByTestId('confirm-yes').click();
  const problem = page.getByTestId('previous-roster-action-problem');
  await expect(problem).toContainText('Something went wrong');
  await expect(problem).not.toContainText('failed');
});

test('the app’s own words are shown when it refuses, and a missing database is explained', async ({
  page,
}) => {
  await openPreviousRoster(page, 2);
  await onCall(
    page,
    'loadOut:clear-previous-roster',
    `() => ({ ok: false, reason: 'refused', message: 'That cannot be done right now.' })`,
  );
  await page.getByTestId('clear-previous-roster').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('previous-roster-action-problem')).toHaveText(
    'That cannot be done right now.',
  );

  await onCall(page, 'state:snapshot', `() => ({ ok: false, reason: 'no-data' })`);
  await emit(page, 'state:changed', { revision: 9 });
  await expect(page.getByTestId('previous-roster-problem')).toContainText(
    'saved data could not be opened',
  );
});

test('outside the app there is no bridge, and pages say so instead of breaking', async ({
  page,
}) => {
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'previous-roster'));
  await page.goto('/');
  await expect(page.getByTestId('previous-roster-problem')).toContainText(
    'only works inside the Loadout Builder app',
  );
});
