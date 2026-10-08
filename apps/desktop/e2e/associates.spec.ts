// The Associates page, driven in a real browser on the stand-in bridge: the list and its colours,
// the filters, bringing the list in (and being asked before it is replaced), the Tenured Workforce
// file, Lifetime Routes, and clearing. The rules are proved by the core's tests.

import { expect, test, type Page } from '@playwright/test';
import {
  BARRETT,
  CARMEN,
  COLTON,
  ZANE,
  associate,
  choosesFile,
  commandChanges,
  commandRefuses,
  openPage,
} from './support/pageData';
import { callsTo, onCall } from './support/fakeBridge';

const status = (page: Page) => page.getByTestId('associates-status');
const rowsOf = (page: Page) => page.locator('[role="rowgroup"] [role="row"]');
const tab = (page: Page, id: string) => page.getByTestId(`associates-tab-${id}`);
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const row = (page: Page, text: string) => page.locator('[role="row"]', { hasText: text });

const PEOPLE = () => [
  associate(CARMEN, {
    associate: { idExpiration: '2026-09-30', qualifications: ['EDV', 'DOT'], tenure: 158 },
    idState: 'expiring',
    daysUntilIdExpiry: 19,
    onRoster: true,
    vanBadges: 'EDV DOT',
  }),
  associate(BARRETT, {
    associate: {
      idExpiration: '2026-08-01',
      status: 'INACTIVE',
      qualifications: ['Step Van'],
      tenure: 0,
    },
    idState: 'expired',
    daysUntilIdExpiry: -41,
    vanBadges: 'SV',
  }),
  associate(COLTON, { associate: { idExpiration: '2027-03-01', tenure: null } }),
  associate(ZANE, {
    associate: { qualifications: ['EDV', 'Step Van'], tenure: 12 },
    vanBadges: 'EDV SV',
  }),
];

const LOADED = () => ({
  associates: PEOPLE() as never,
  roster: {
    sourceFile: '',
    importedAt: null,
    routeSource: '',
    rows: [
      { index: 0, row: { routes: '' } },
      { index: 1, row: { routes: '' } },
    ],
  } as never,
  sources: {
    associates: { sourceFile: 'C:\\Downloads\\AssociateData.csv', importedAt: null },
    vehicles: { sourceFile: '', importedAt: null },
  },
  tenure: {
    records: 167,
    sourceFile: 'C:\\Downloads\\Tenured_Workforce_DA_1756900000.csv',
    importedAt: null,
    associatesWithCount: 3,
    weekLabel: 'Week 36, 2026',
  },
  counts: { associates: 4, activeAssociates: 3, matched: 1, needReview: 0, rosterRows: 2 },
});

async function openLoaded(page: Page) {
  await openPage(page, 'associates', { snapshot: LOADED() });
}

test('an empty list says what to import, and offers both files', async ({ page }) => {
  await openPage(page, 'associates');
  await expect(page.getByRole('tab')).toHaveText(['Associates', 'Lifetime Routes']);
  await expect(page.getByTestId('associates-title')).toHaveText('No associate data loaded');
  await expect(page.getByTestId('associates-metric')).toHaveText('0 associates');
  await expect(page.getByText('Import AssociateData.csv to match drivers')).toBeVisible();
  await expect(page.getByTestId('import-associates')).toBeVisible();
  await expect(page.getByTestId('import-tenure')).toBeVisible();
  await expect(page.getByTestId('clear-associates')).toBeVisible();
});

test('shows the old columns, the counts, and the ID state as a chip with words', async ({
  page,
}) => {
  await openLoaded(page);
  await expect(page.getByTestId('associates-title')).toHaveText('Associates');
  await expect(page.getByTestId('associates-sub')).toContainText('AssociateData.csv');
  await expect(page.getByTestId('associates-metric')).toHaveText('4 associates  -  3 active');
  await expect(page.getByTestId('associates-detail-0')).toHaveText('EDV: 3   Step Van: 2   DOT: 1');
  await expect(page.getByTestId('associates-detail-1')).toHaveText(
    'IDs expired: 1   expiring soon: 1   lifetime routes: 3/4   on load out: 1/2',
  );

  const headings = (await page.locator('[role="columnheader"]').allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(headings).toEqual([
    'Name',
    'Transporter ID',
    'Status',
    'Lifetime Routes',
    'Vans',
    'ID Expires',
    'On Load Out',
    'Qualifications',
    'Personal Phone',
    'Work Phone',
    'Email',
  ]);

  const carmen = row(page, CARMEN.name);
  // The colour is never alone: the chip says "expiring" in words.
  await expect(carmen.locator('[data-col-id="id_expiration"] [data-slot="chip"]')).toHaveText(
    '2026-09-30  (19d left)',
  );
  await expect(carmen.locator('[data-col-id="id_expiration"] [data-slot="chip"]')).toHaveAttribute(
    'data-tone',
    'warn',
  );
  await expect(carmen).toHaveAttribute('data-tone', 'warn');
  await expect(carmen.locator('[data-col-id="tenure"]')).toHaveText('158');
  await expect(carmen.locator('[data-col-id="on_loadout"]')).toHaveText('Yes');
  await expect(carmen.locator('[data-col-id="qualifications"]')).toHaveText('EDV, DOT');

  const barrett = row(page, BARRETT.name);
  await expect(barrett.locator('[data-col-id="id_expiration"] [data-slot="chip"]')).toHaveText(
    '2026-08-01  (expired)',
  );
  await expect(barrett).toHaveAttribute('data-tone', 'bad');
  await expect(barrett.locator('[data-col-id="tenure"]')).toHaveText('0');

  // A plain, current ID is plain text, and a missing count is a dash.
  const colton = row(page, COLTON.name);
  await expect(colton.locator('[data-col-id="id_expiration"] [data-slot="chip"]')).toHaveCount(0);
  await expect(colton.locator('[data-col-id="tenure"]')).toHaveText('-');
});

test('filters by status, one qualification, the load out, and the search box', async ({ page }) => {
  await openLoaded(page);
  await page.getByTestId('associate-status-filter').selectOption('INACTIVE');
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  await page.getByTestId('associate-status-filter').selectOption('All statuses');

  await page.getByTestId('associate-qualification-filter').selectOption('Step Van');
  await expect(page.getByText('Showing 2 of 4')).toBeVisible();
  await page.getByTestId('associate-qualification-filter').selectOption('DOT');
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  await page.getByTestId('associate-qualification-filter').selectOption('All qualifications');

  await page.getByTestId('associate-on-load-out').check();
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  await expect(rowsOf(page).first()).toContainText(CARMEN.name);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('associate-on-load-out')).not.toBeChecked();
  await expect(page.getByText('Showing 4 of 4')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search this table' }).fill('zane');
  await expect(page.getByText('Showing 1 of 4')).toBeVisible();
});

test('bringing the list in on an empty app does not ask, and says how many drivers were found', async ({
  page,
}) => {
  await openPage(page, 'associates', {
    snapshot: {
      roster: {
        sourceFile: '',
        importedAt: null,
        routeSource: '',
        rows: [
          { index: 0, row: { routes: '' } },
          { index: 1, row: { routes: '' } },
        ],
      } as never,
    },
  });
  await choosesFile(page, 'C:\\Downloads\\AssociateData.csv');
  await commandChanges(page, 'files:import', LOADED(), { kind: 'associates', rows: 4 });
  await page.getByTestId('import-associates').click();
  await expect(dialog(page, 'confirm')).toHaveCount(0);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'associates', path: 'C:\\Downloads\\AssociateData.csv' },
  ]);
  await expect(status(page)).toHaveText(
    'Imported 4 associates from AssociateData.csv. 1 of 2 drivers on the roster found.',
  );
  await expect(page.getByTestId('associates-metric')).toHaveText('4 associates  -  3 active');
});

test('with a list already there, it asks before replacing it, and No leaves everything alone', async ({
  page,
}) => {
  await openLoaded(page);
  await page.getByTestId('import-associates').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Replace the associate list?');
  await expect(ask).toContainText('The 4 associate records now in the app will be replaced');
  await expect(ask).toContainText('Lifetime route counts and the load-out roster are kept.');
  await ask.getByRole('button', { name: 'No, keep the list' }).click();
  expect(await callsTo(page, 'files:pick')).toEqual([]);

  await choosesFile(page, 'C:\\Downloads\\AssociateData.csv');
  await commandChanges(
    page,
    'files:import',
    { counts: { ...LOADED().counts, needReview: 2 } },
    { kind: 'associates', rows: 4 },
  );
  await page.getByTestId('import-associates').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, choose a file' }).click();
  await expect(status(page)).toHaveText(
    'Imported 4 associates from AssociateData.csv. 1 of 2 drivers on the roster found (2 need review).',
  );
});

test('a file that is not an associate list shows the reader’s words and keeps the list', async ({
  page,
}) => {
  await openLoaded(page);
  await choosesFile(page, 'C:\\Downloads\\other.csv');
  await commandRefuses(
    page,
    'files:import',
    'The selected file is not an associate export we can read.',
  );
  await page.getByTestId('import-associates').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, choose a file' }).click();
  await expect(page.getByTestId('associates-problem')).toContainText(
    'The selected file is not an associate export we can read.',
  );
  await expect(status(page)).toHaveText('Import failed.');
  await expect(page.getByTestId('associates-metric')).toHaveText('4 associates  -  3 active');
});

test('Import Tenure says how many drivers have a count, through which week, and how many associates are covered', async ({
  page,
}) => {
  await openLoaded(page);
  await choosesFile(page, 'C:\\Downloads\\Tenured_Workforce_DA_1756900000.csv');
  await onCall(
    page,
    'files:import',
    `(input) => {
      window.__tenureInput = input;
      return { ok: true, value: { kind: 'tenure', rows: 167, tenure: {
        fileName: 'Tenured_Workforce_DA_1756900000.csv', fileWeek: 'Week 36, 2026', kept: 167,
        keptWeek: 'Week 36, 2026', older: false, covered: 3, associates: 4 } } };
    }`,
  );
  await page.getByTestId('import-tenure').click();
  expect(await callsTo(page, 'files:pick')).toEqual([{ kind: 'tenure' }]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'tenure', path: 'C:\\Downloads\\Tenured_Workforce_DA_1756900000.csv' },
  ]);
  await expect(status(page)).toHaveText(
    'Imported Tenured_Workforce_DA_1756900000.csv. Lifetime routes for 167 drivers, through Week 36, 2026. 3/4 associates covered.',
  );
});

test('an older Tenured Workforce file says the newer counts were kept', async ({ page }) => {
  await openLoaded(page);
  await choosesFile(page, 'C:\\Downloads\\Tenured_Workforce_DA_1756800000.csv');
  await onCall(
    page,
    'files:import',
    `() => ({ ok: true, value: { kind: 'tenure', rows: 160, tenure: {
      fileName: 'Tenured_Workforce_DA_1756800000.csv', fileWeek: 'Week 34, 2026', kept: 167,
      keptWeek: 'Week 36, 2026', older: true, covered: 3, associates: 4 } } })`,
  );
  await page.getByTestId('import-tenure').click();
  await expect(status(page)).toHaveText(
    "Imported Tenured_Workforce_DA_1756800000.csv (Week 34, 2026) - older than what's on file, newer counts kept. Lifetime routes for 167 drivers, through Week 36, 2026. 3/4 associates covered.",
  );
});

test('a tenure file the reader refuses shows its words and changes nothing', async ({ page }) => {
  await openLoaded(page);
  await choosesFile(page, 'C:\\Downloads\\wrong.csv');
  await commandRefuses(
    page,
    'files:import',
    'The selected file is not a Tenured Workforce export we can read.',
  );
  await page.getByTestId('import-tenure').click();
  await expect(page.getByTestId('associates-problem')).toContainText(
    'The selected file is not a Tenured Workforce export we can read.',
  );
  await expect(status(page)).toHaveText('Import failed.');
});

test('Lifetime Routes shows the newest-week rule, what is kept, and who has no count yet', async ({
  page,
}) => {
  await openLoaded(page);
  await tab(page, 'lifetime-routes').click();
  await expect(page.getByTestId('tenure-title')).toHaveText('Lifetime Routes');
  await expect(page.getByTestId('tenure-sub')).toContainText('Tenured_Workforce_DA_1756900000.csv');
  await expect(page.getByTestId('tenure-metric')).toHaveText(
    '167 drivers with a count, through Week 36, 2026',
  );
  await expect(page.getByTestId('tenure-detail-0')).toHaveText('3/4 associates covered');
  await expect(page.getByTestId('tenure-rules')).toContainText(
    "Only each driver's newest week counts",
  );
  await expect(page.getByTestId('tenure-rules')).toContainText("never takes anyone's count back");
  await expect(page.getByTestId('tenure-rules')).toContainText(
    'kept apart from the associate list',
  );
  await expect(row(page, COLTON.name).locator('[data-slot="chip"]')).toHaveText('No count yet');
  await expect(row(page, CARMEN.name).locator('[data-col-id="tenure"]')).toHaveText('158');

  await choosesFile(page, 'C:\\Downloads\\Tenured_Workforce_DA_1756900000.csv');
  await onCall(
    page,
    'files:import',
    `() => ({ ok: true, value: { kind: 'tenure', rows: 167, tenure: { fileName: 'T.csv',
      fileWeek: 'Week 36, 2026', kept: 167, keptWeek: 'Week 36, 2026', older: false, covered: 4,
      associates: 4 } } })`,
  );
  await page.getByTestId('import-tenure-tab').click();
  await expect(status(page)).toContainText('Imported T.csv.');
});

test('Lifetime Routes with nothing imported says so', async ({ page }) => {
  await openPage(page, 'associates', {
    snapshot: { associates: PEOPLE() as never },
  });
  await tab(page, 'lifetime-routes').click();
  await expect(page.getByTestId('tenure-sub')).toHaveText(
    'No Tenured Workforce file has been imported yet.',
  );
  await expect(page.getByTestId('tenure-metric')).toHaveText('No Lifetime Routes counts kept yet');
});

test('Clear Associates asks first, says what is kept, and then empties the list', async ({
  page,
}) => {
  await openLoaded(page);
  await page.getByTestId('clear-associates').click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Clear associate data?');
  await expect(ask).toContainText('Remove all 4 associate records?');
  await expect(ask).toContainText(
    'Load-out drivers will lose their Transporter IDs and qualifications until you import again. The load-out roster itself is kept.',
  );
  // A red question starts on No, so Enter keeps the list.
  await expect(ask.getByRole('button', { name: 'No, keep them' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(ask).toHaveCount(0);
  expect(await callsTo(page, 'associates:clear')).toEqual([]);

  await commandChanges(page, 'associates:clear', {
    associates: [],
    counts: { associates: 0, activeAssociates: 0 },
  });
  await page.getByTestId('clear-associates').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, clear' }).click();
  expect(await callsTo(page, 'associates:clear')).toHaveLength(1);
  await expect(status(page)).toHaveText('Associate data cleared.');
  await expect(page.getByTestId('associates-title')).toHaveText('No associate data loaded');

  await page.getByTestId('clear-associates').click();
  await expect(status(page)).toHaveText('Nothing to clear - no associate data loaded.');
});
