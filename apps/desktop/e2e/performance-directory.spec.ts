// The Performance page, Directory tab, on the stand-in bridge: everyone on the driver list, the
// search and status chips, and copying an email address or phone number.

import { expect, test, type Page } from '@playwright/test';
import { ARCHER, CARMEN, DESMOND, FABIAN, copied, openPerformance } from './support/performance';

const rows = (page: Page) => page.locator('[role="rowgroup"] [role="row"]');
const row = (page: Page, text: string) => page.locator('[role="row"]', { hasText: text });
const status = (page: Page) => page.getByTestId('performance-status');

test('lists everyone with how to reach them', async ({ page }) => {
  await openPerformance(page, { tab: 'directory' });
  await expect(rows(page)).toHaveCount(4);
  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Driver',
    'Transporter ID',
    'Status',
    'Position',
    'Qualifications',
    'Email',
    'Personal Phone',
    'Work Phone',
    'ID Expires',
  ]);
  await expect(row(page, ARCHER.name)).toContainText('driver034@example.com');
  // A blank status counts as offboarded.
  await expect(row(page, FABIAN.name)).toContainText('OFFBOARDED');
});

test('an empty directory points to the Imports tab', async ({ page }) => {
  await openPerformance(page, { tab: 'directory', data: { directory: [] } });
  await expect(page.getByText('No driver list yet')).toBeVisible();
});

test('search and the status chips narrow the list', async ({ page }) => {
  await openPerformance(page, { tab: 'directory' });
  await expect(page.getByText('Showing 4 of 4')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('driver035');
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, DESMOND.name)).toHaveCount(1);
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  // Phones, position and qualifications are searched too.
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('4885550141');
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, ARCHER.name)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('EDV');
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole('searchbox', { name: 'Search this table' }).fill('');
  await page.getByRole('button', { name: /^Inactive/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, CARMEN.name)).toHaveCount(1);
});

test('Copy email and Copy phone copy the picked driver’s details', async ({ page }) => {
  await openPerformance(page, { tab: 'directory' });
  await page.getByTestId('perf-copy-email').click();
  await expect(status(page)).toHaveText('Pick a driver in the table first.');

  await row(page, ARCHER.name).locator('[role="gridcell"][data-col-id="name"]').click();
  await expect(page.getByTestId('perf-directory-current')).toHaveText(`${ARCHER.name} is picked.`);
  await page.getByTestId('perf-copy-email').click();
  await expect(status(page)).toHaveText(`Copied the email address for ${ARCHER.name}.`);
  await page.getByTestId('perf-copy-phone').click();
  await expect(status(page)).toHaveText(`Copied the phone number for ${ARCHER.name}.`);
  expect(await copied(page)).toEqual(['driver034@example.com', '4885550141']);

  // No phone on file: it says so, and copies nothing.
  await row(page, CARMEN.name).locator('[role="gridcell"][data-col-id="name"]').click();
  await page.getByTestId('perf-copy-phone').click();
  await expect(status(page)).toHaveText(`There is no phone number on file for ${CARMEN.name}.`);
  expect(await copied(page)).toHaveLength(2);
});

test('right-click copies too, and a missing address is greyed out', async ({ page }) => {
  await openPerformance(page, { tab: 'directory' });
  await row(page, DESMOND.name)
    .locator('[role="gridcell"][data-col-id="name"]')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy phone number' }).click();
  expect(await copied(page)).toEqual(['+17535550146']);

  await row(page, FABIAN.name)
    .locator('[role="gridcell"][data-col-id="name"]')
    .click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Copy email address' })).toHaveAttribute(
    'data-disabled',
    '',
  );
});
