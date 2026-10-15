// The Name and ID Links tab of the Load Out page, in a plain browser with the stand-in bridge
// holding a small made-up day (e2e/support/loadOutDay.ts): the list, the search, removing one
// link, clearing them all, and the empty state. The rules behind the commands are the core's.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';
import { IDS, loadOutDay, withMaps } from './support/loadOutDay';

/** A Transporter ID from the manifest that none of the day's associates has. */
const GONE_ID = 'A02V4L9HIELIDL';

async function open(page: Page, changes: Record<string, unknown> = {}) {
  await installFakeBridge(page, { snapshot: { ...loadOutDay(), ...changes } });
  await withMaps(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('loadout.page', 'load-out');
    window.localStorage.setItem('loadout.load-out-tab', 'links');
  });
  await page.goto('/');
  await expect(page.locator('[data-page="load-out"] [data-tab-panel="links"]')).toBeVisible();
}

const status = (page: Page) => page.getByTestId('load-out-status');
const grid = (page: Page) => page.getByRole('grid', { name: 'Name and ID links' });
const rows = (page: Page) => grid(page).locator('[role="rowgroup"] [role="row"]');
const rowOf = (page: Page, driver: string) =>
  grid(page).locator('[role="row"]', {
    has: page.locator('[data-col-id="driver"]', { hasText: driver }),
  });

/** What the app does when a link goes, in the stand-in: drop it, then say the data changed. */
const DROP_ONE = `(input) => {
  const snap = window.__fake.snapshot;
  snap.linkList = snap.linkList.filter((link) => link.driverKey !== input.driverKey);
  snap.counts.links = snap.linkList.length;
  snap.revision += 1;
  setTimeout(() => window.__fake.emit('state:changed', { revision: snap.revision }), 0);
  return { ok: true, value: null };
}`;
const DROP_ALL = `() => {
  const snap = window.__fake.snapshot;
  snap.linkList = [];
  snap.counts.links = 0;
  snap.revision += 1;
  setTimeout(() => window.__fake.emit('state:changed', { revision: snap.revision }), 0);
  return { ok: true, value: null };
}`;

test('lists every hand-made link, who it points at, and whether the driver is on today', async ({
  page,
}) => {
  const day = loadOutDay();
  await open(page, {
    linkList: [
      ...(day.linkList as object[]),
      { driverKey: 'orson applewhite', driverName: 'Orson Applewhite', transporterId: GONE_ID },
    ],
    counts: { ...(day.counts as object), links: 4 },
  });
  await expect(page.getByTestId('links-count')).toHaveText(
    "4 hand-made links · 2 on today's roster",
  );
  await expect(
    page.getByText(
      'Links you made by hand on the Roster tab. The app uses them before matching by name.',
    ),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  const colton = rowOf(page, 'Colton Alderman');
  await expect(colton.locator('[data-col-id="linked_to"]')).toHaveText('Colton Alderman');
  await expect(colton.locator('[data-col-id="transporter_id"]')).toHaveText(IDS.colton);
  await expect(colton.locator('[data-col-id="on_roster"]')).toHaveText('Yes');
  const zane = rowOf(page, 'Zane Applewhite');
  await expect(zane.locator('[data-col-id="linked_to"]')).toHaveText('Not an associate');
  // An empty cell is drawn as a dash.
  await expect(zane.locator('[data-col-id="transporter_id"]')).toHaveText('-');
  await expect(zane.locator('[data-col-id="on_roster"]')).toHaveText('No');
  // A driver who is not working today is greyed out.
  await expect(zane).toHaveAttribute('data-tone', 'ghost');
  // An associate who has left the list shows as their ID.
  await expect(rowOf(page, 'Orson Applewhite').locator('[data-col-id="linked_to"]')).toHaveText(
    GONE_ID,
  );
  // Nothing to act on until a row is picked.
  await expect(page.getByTestId('remove-link')).toBeDisabled();
  await expect(page.getByTestId('clear-all-links')).toBeEnabled();
});

test('the search box narrows the list', async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('zane');
  await expect(page.getByText('Showing 1 of 3')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('not an associate');
  await expect(rows(page)).toHaveCount(1);
});

test('Remove link asks first, then sends the driver key and the snapshot it came from', async ({
  page,
}) => {
  await open(page);
  await onCall(page, 'loadOut:remove-link', DROP_ONE);
  await rowOf(page, 'Zane Applewhite').locator('[data-col-id="driver"]').click();
  await expect(page.getByTestId('remove-link')).toBeEnabled();
  await page.getByTestId('remove-link').click();
  const ask = page.getByTestId('confirm-dialog');
  await expect(ask).toContainText('Zane Applewhite is linked to Not an associate.');
  await expect(page.getByTestId('confirm-no')).toBeFocused();
  await page.getByTestId('confirm-no').click();
  expect(await callsTo(page, 'loadOut:remove-link')).toEqual([]);

  // The right-click menu offers the same.
  await rowOf(page, 'Zane Applewhite')
    .locator('[data-col-id="linked_to"]')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove link...' }).click();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:remove-link')).toEqual([
    { revision: 7, driverKey: 'zane applewhite' },
  ]);
  await expect(status(page)).toHaveText('Link removed. Zane Applewhite is matched by name again.');
  // The page asked again; it did not guess the new list.
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('links-count')).toHaveText(
    "2 hand-made links · 2 on today's roster",
  );
  await expect(page.getByTestId('remove-link')).toBeDisabled();
});

test('Clear all links asks first, then empties the list', async ({ page }) => {
  await open(page);
  await onCall(page, 'loadOut:clear-links', DROP_ALL);
  await page.getByTestId('clear-all-links').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Remove all 3 hand-made links?');
  await page.getByTestId('confirm-no').click();
  expect(await callsTo(page, 'loadOut:clear-links')).toEqual([]);
  await page.getByTestId('clear-all-links').click();
  await page.getByTestId('confirm-yes').click();
  expect(await callsTo(page, 'loadOut:clear-links')).toHaveLength(1);
  await expect(status(page)).toHaveText('All hand-made links cleared.');
  await expect(page.getByTestId('links-count')).toHaveText('No hand-made links');
  await expect(page.getByText('No hand-made links.')).toBeVisible();
  await expect(page.getByTestId('clear-all-links')).toBeDisabled();
});

test('a failed command shows plain words, never a code', async ({ page }) => {
  await open(page);
  await onCall(page, 'loadOut:remove-link', `() => ({ ok: false, reason: 'failed' })`);
  await rowOf(page, 'Colton Alderman').locator('[data-col-id="driver"]').dblclick();
  await page.getByTestId('confirm-yes').click();
  const problem = page.getByTestId('links-action-problem');
  await expect(problem).toContainText('Something went wrong');
  await expect(problem).not.toContainText('failed');
});

test('with no links, the tab says how to make one', async ({ page }) => {
  const day = loadOutDay();
  await open(page, { linkList: [], counts: { ...(day.counts as object), links: 0 } });
  await expect(page.getByTestId('links-count')).toHaveText('No hand-made links');
  await expect(page.getByText('No hand-made links.')).toBeVisible();
  await expect(
    page.getByText('On the Roster tab, pick a driver and choose Pick associate to make one.'),
  ).toBeVisible();
  await expect(page.getByTestId('remove-link')).toBeDisabled();
  await expect(page.getByTestId('clear-all-links')).toBeDisabled();
});
