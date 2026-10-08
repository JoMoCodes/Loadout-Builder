// The Print tab and the two export buttons, in a plain browser with the stand-in bridge. The rows
// are the made-up fixture day's own print rows; the writing itself is covered by the writers'
// tests and the Electron smoke check.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge, onCall } from './support/fakeBridge';

// The tests run from apps/desktop (npm run test:ui -w @loadout/desktop).
const printingJson = JSON.parse(
  readFileSync(
    path.resolve('..', '..', 'scripts', 'parity', 'expected', '2026-09-11', 'printing.json'),
    'utf8',
  ),
) as { date_label: string; print_rows: Array<{ key: string; values: Record<string, string> }> };

const ROWS = printingJson.print_rows;
const DATE = printingJson.date_label;

function shiftCounts(): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of ROWS) {
    const shift = row.values.shift_type || '(none)';
    counts.set(shift, (counts.get(shift) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) =>
    a[0].toLowerCase() < b[0].toLowerCase() ? -1 : a[0].toLowerCase() > b[0].toLowerCase() ? 1 : 0,
  );
}

const column = (values: Record<string, unknown>) => ({
  kind: 'field',
  field: '',
  heading: '',
  weight: 0,
  alignOverride: '',
  ...values,
});

const DEFAULT_SPEC = {
  columns: [
    column({ kind: 'blank' }),
    column({ field: 'driver' }),
    column({ field: 'vehicle' }),
    column({ field: 'shift_type' }),
    column({ field: 'routes' }),
    column({ field: 'pad' }),
    column({ kind: 'blank' }),
  ],
  paper: 'letter',
  orientation: 'portrait',
  scale: 100,
  fitOnePage: true,
  stretch: false,
  centerH: true,
  centerV: false,
  showTitle: true,
  title: '',
  note: '',
  showPageNumbers: true,
  grid: true,
  stripes: false,
  repeatHeader: true,
  sortBy: 'driver',
  sortReverse: false,
  groupBreak: '',
  excludedShifts: [] as string[],
  excludedDrivers: [] as string[],
  vansOnly: false,
};

const VIEW = {
  rows: ROWS,
  dateLabel: DATE,
  rosterEmpty: false,
  shiftCounts: shiftCounts(),
  carryingDwp: 0,
  dwpLoaded: false,
};

/** The fixture day's drivers as whole roster rows, so the Roster tab can draw them too. */
const ROSTER_ROWS = ROWS.map((r, index) => ({
  index,
  key: r.key,
  row: {
    driver: r.values.driver ?? '',
    shiftType: r.values.shift_type ?? '',
    status: '',
    routes: r.values.routes ?? '',
    vehicle: r.values.vehicle ?? '',
    vin: '',
    device: '',
    stagingLocation: '',
    bag: '',
    waveTime: '',
    pad: '',
    serviceType: '',
    bags: '',
    ovs: '',
    assignMethod: '',
  },
  match: { method: 'exact', ambiguous: false, candidates: [] },
  associateId: '',
  associateName: '',
  vanBadges: '',
  tenure: null,
  check: '',
  assignMethodLabel: '',
  issues: [],
}));

/** The real Load Out page, opened on the Print tab (or the Roster tab, for the exports). */
async function openTab(page: Page, presets: string[] = [], tab = 'print') {
  await installFakeBridge(page, {
    snapshot: {
      print: { spec: DEFAULT_SPEC as never, presets },
      roster: {
        sourceFile: '',
        importedAt: null,
        routeSource: '',
        rows: ROSTER_ROWS as never,
      },
    },
  });
  await page.addInitScript((view) => {
    window.__fake!.hooks['print:rows'] = () => ({ ok: true, value: view });
    window.__fake!.hooks['print:set-spec'] = (input) => ({
      ok: true,
      value: (input as { spec: unknown }).spec,
    });
  }, VIEW);
  await page.addInitScript((which) => {
    window.localStorage.setItem('loadout.page', 'load-out');
    window.localStorage.setItem('loadout.load-out-tab', which);
  }, tab);
  await page.goto('/');
  if (tab === 'print') await expect(page.getByTestId('print-title')).toBeVisible();
  else await expect(page.getByTestId('export-roster')).toBeVisible();
}

/** The last layout the tab saved, in its saved form. */
async function lastSaved(page: Page): Promise<Record<string, unknown>> {
  const saves = (await callsTo(page, 'print:set-spec')) as Array<{ spec: Record<string, unknown> }>;
  expect(saves.length).toBeGreaterThan(0);
  return saves[saves.length - 1]!.spec;
}

test('opens on the handout people know, with the read-out and the page as it will print', async ({
  page,
}) => {
  await openTab(page);
  await expect(page.getByTestId('print-title')).toHaveText(`Load Out  -  ${DATE}`);
  await expect(page.getByTestId('print-subtitle')).toHaveText(
    `${ROWS.length} of ${ROWS.length} drivers, everybody on it  -  ordered by driver name`,
  );
  await expect(page.getByTestId('print-page-count')).toHaveText('2 pages');
  await expect(page.getByTestId('print-shape')).toHaveText('7 columns  -  Letter portrait at 100%');
  await expect(page.getByTestId('print-column-row')).toHaveCount(7);
  await expect(page.getByTestId('print-column-row').nth(0)).toContainText('(blank)');
  await expect(page.getByTestId('print-column-width').nth(1)).toContainText('auto');

  // The preview is the writer's own page: headings, the first driver by name, page 1 of 2.
  await expect(page.getByTestId('print-preview-page')).toHaveText('Page 1 of 2');
  const sheet = page.getByTestId('print-preview-sheet');
  await expect(sheet).toHaveAttribute('data-width', '612');
  const words = await sheet.locator('text').allTextContents();
  expect(words[0]).toBe(`Load Out  -  ${DATE}`);
  expect(words).toContain('Page 1 of 2');
  expect(words).toContain('Driver');
  const first = [...ROWS].sort((a, b) =>
    a.values.driver!.toLowerCase() < b.values.driver!.toLowerCase() ? -1 : 1,
  )[0]!;
  expect(words).toContain(first.values.driver);
  await page.getByTestId('print-preview-next').click();
  await expect(page.getByTestId('print-preview-page')).toHaveText('Page 2 of 2');
});

test('who prints: a shift type off greys its drivers, and a greyed name says why', async ({
  page,
}) => {
  await openTab(page);
  const [shift, count] = shiftCounts().find(([, n]) => n > 1)!;
  await page.getByTestId('print-list-shifts').locator(`tr[data-key="${shift}"]`).click();
  expect((await lastSaved(page)).excluded_shifts).toEqual([shift]);
  await expect(page.getByTestId('print-subtitle')).toContainText(
    `${ROWS.length - count} of ${ROWS.length} drivers, ${count} left off`,
  );

  const greyed = ROWS.find((r) => (r.values.shift_type || '(none)') === shift)!;
  const row = page.getByTestId('print-list-drivers').locator(`tr[data-key="${greyed.key}"]`);
  await expect(row).toHaveAttribute('data-on', 'no');
  await row.click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    `${greyed.values.driver} is off because the shift type '${shift}' is. Switch that back on first.`,
  );
  // The driver's own switch was not touched.
  expect((await lastSaved(page)).excluded_drivers).toEqual([]);

  // Back on: everybody is back, with their old settings.
  await page.getByTestId('print-shifts-all').click();
  await expect(row).toHaveAttribute('data-on', 'yes');
  await expect(page.getByTestId('print-subtitle')).toContainText('everybody on it');
});

test('the search only narrows the list; None and All mean every driver', async ({ page }) => {
  await openTab(page);
  const someone = ROWS[0]!;
  await page.getByTestId('print-driver-search').fill(someone.values.driver!);
  await expect(page.getByTestId('print-list-drivers').locator('tbody tr')).toHaveCount(
    ROWS.filter((r) =>
      Object.values({
        a: r.values.driver,
        b: r.values.shift_type || '-',
        c: r.values.vehicle || '-',
      }).some((v) => v!.toLowerCase().includes(someone.values.driver!.toLowerCase())),
    ).length,
  );
  await expect(page.getByTestId('print-subtitle')).toContainText('everybody on it');
  await page.getByTestId('print-drivers-none').click();
  expect((await lastSaved(page)).excluded_drivers).toHaveLength(
    new Set(ROWS.map((r) => r.key)).size,
  );
  await expect(page.getByTestId('print-warning')).toHaveText('nobody is left on the sheet');
  await page.getByTestId('print-drivers-all').click();
  expect((await lastSaved(page)).excluded_drivers).toEqual([]);

  await page.getByTestId('print-vans-only').check();
  expect((await lastSaved(page)).vans_only).toBe(true);
  const vanless = ROWS.filter((r) => !r.values.vehicle).length;
  await expect(page.getByTestId('print-subtitle')).toContainText(`${vanless} left off`);
});

test('columns: add a tick box, rename, move, set a width, and take one off', async ({ page }) => {
  await openTab(page);
  // Select Driver, then add a tick box after it.
  await page.getByTestId('print-column-row').nth(1).click();
  await page.getByTestId('print-add-column').click();
  // Every column the Roster has (18), the ones already on the sheet greyed, then the two others.
  await expect(page.getByRole('menuitem')).toHaveCount(20);
  await expect(page.getByRole('menuitem', { name: 'Driver' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Check' })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Tick box column...' }).click();
  await page.getByTestId('print-ask-input').fill('Keys');
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Added Keys to the printed sheet.');
  const columns = (await lastSaved(page)).columns as Array<Record<string, unknown>>;
  expect(columns[2]).toMatchObject({ kind: 'checkbox', heading: 'Keys' });
  await expect(page.getByTestId('print-column-row').nth(2)).toContainText('Tick box');

  // Rename Driver by double-clicking; the original name puts the heading back.
  await page.getByTestId('print-column-row').nth(1).dblclick();
  await page.getByTestId('print-ask-input').fill('Who');
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('print-column-row').nth(1)).toContainText('Who');
  await page.getByTestId('print-column-row').nth(1).dblclick();
  await expect(page.getByTestId('print-ask-input')).toHaveValue('Who');
  await page.getByTestId('print-ask-input').fill('Driver');
  await page.getByTestId('print-ask-ok').click();
  expect(((await lastSaved(page)).columns as Array<{ heading: string }>)[1]!.heading).toBe('');

  // Empty also puts the original heading back.
  await page.getByTestId('print-column-row').nth(1).dblclick();
  await page.getByTestId('print-ask-input').fill('Who');
  await page.getByTestId('print-ask-ok').click();
  await page.getByTestId('print-column-row').nth(1).dblclick();
  await page.getByTestId('print-ask-input').fill('');
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('print-column-row').nth(1)).toContainText('Driver');

  // Move it down, past the tick box, and back up again, and down once more.
  await page.getByTestId('print-move-down').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Moved Driver right.');
  await expect(page.getByTestId('print-column-row').nth(2)).toContainText('Driver');
  await page.getByTestId('print-move-up').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Moved Driver left.');
  await expect(page.getByTestId('print-column-row').nth(1)).toContainText('Driver');
  await page.getByTestId('print-move-down').click();

  // Typing back the width shown moves nothing; a new number pins it; Auto hands it back.
  const before = (await callsTo(page, 'print:set-spec')).length;
  const width = page.getByTestId('print-width');
  const shown = await width.inputValue();
  await width.fill(shown);
  await width.press('Enter');
  expect((await callsTo(page, 'print:set-spec')).length).toBe(before);
  await width.fill('150');
  await width.press('Enter');
  expect(((await lastSaved(page)).columns as Array<{ weight: number }>)[2]!.weight).toBe(150);
  // Pinned, so no longer "auto"; the figure is what it really prints at once the page has its say.
  await expect(page.getByTestId('print-column-width').nth(2)).not.toContainText('auto');
  await page.getByTestId('print-width-auto').click();
  await expect(page.getByTestId('print-column-width').nth(2)).toContainText('auto');

  await page.getByTestId('print-align').selectOption('Right');
  expect(
    ((await lastSaved(page)).columns as Array<{ align_override: string }>)[2]!.align_override,
  ).toBe('R');

  await page.getByTestId('print-remove-column').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Took Driver off the printed sheet.',
  );
  await expect(page.getByTestId('print-column-row')).toHaveCount(7);

  // A write-in column is an empty box with no heading.
  await page.getByTestId('print-add-column').click();
  await page.getByRole('menuitem', { name: 'Write-in column (blank, to fill in by hand)' }).click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Added write-in to the printed sheet.',
  );
  const added = (await lastSaved(page)).columns as Array<Record<string, unknown>>;
  expect(added.filter((c) => c.kind === 'blank')).toHaveLength(3);
});

test('page setup changes the read-out, and a scale out of range is put right', async ({ page }) => {
  await openTab(page);
  await page.getByLabel('Orientation').selectOption('Landscape');
  await expect(page.getByTestId('print-shape')).toHaveText(
    '7 columns  -  Letter landscape at 100%',
  );
  await page.getByLabel('Paper').selectOption({ label: 'A4' });
  await page.getByLabel('Scale').fill('500');
  await page.getByLabel('Scale').press('Enter');
  await expect(page.getByLabel('Scale')).toHaveValue('200');
  await expect(page.getByTestId('print-shape')).toHaveText('7 columns  -  A4 landscape at 200%');
  expect(await lastSaved(page)).toMatchObject({
    paper: 'a4',
    orientation: 'landscape',
    scale: 200,
  });
  await expect(page.getByTestId('print-preview-sheet')).toHaveAttribute('data-width', '841.89');

  await page.getByLabel('Page breaks').selectOption({ label: 'New page for each PAD' });
  await page.getByRole('textbox', { name: 'Title' }).fill('Yard Sheet');
  await expect(page.getByTestId('print-title')).toHaveText(`Yard Sheet  -  ${DATE}`);
  // The title is saved once the typing stops.
  await expect.poll(async () => (await lastSaved(page)).title).toBe('Yard Sheet');
  expect((await lastSaved(page)).group_break).toBe('pad');
  const words = await page.getByTestId('print-preview-sheet').locator('text').allTextContents();
  expect(words.some((w) => w.startsWith('   -   PAD '))).toBe(true);

  await page.getByTestId('print-switch-fitOnePage').uncheck();
  expect((await lastSaved(page)).fit_one_page).toBe(false);
});

test('Print Page, Print Vans and Preview ask the app and say what happened', async ({ page }) => {
  await openTab(page);
  await onCall(
    page,
    'print:print',
    `(input) => ({ ok: true, value: input.vans
      ? { status: 'written', fileName: 'Vans.pdf', drivers: 20, pages: 1, leftOff: 4, openFailed: false }
      : { status: 'written', fileName: 'Load Out.pdf', drivers: 24, pages: 2, leftOff: 0, openFailed: false } })`,
  );
  await page.getByTestId('print-page').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Wrote 24 drivers over 2 pages to Load Out.pdf.',
  );
  await page.getByTestId('print-vans').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Wrote 20 drivers over 1 page to Vans.pdf. 4 left off - without a van.',
  );
  const calls = (await callsTo(page, 'print:print')) as Array<Record<string, unknown>>;
  expect(calls.map((c) => c.vans)).toEqual([false, true]);
  expect(calls[0]!.openAfter).toBe(true);
  expect((calls[0]!.spec as { columns: unknown[] }).columns).toHaveLength(7);

  await onCall(page, 'print:print', `() => ({ ok: true, value: { status: 'cancelled' } })`);
  await page.getByTestId('print-open-after').uncheck();
  await page.getByTestId('print-page').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Printing cancelled.');
  expect(
    ((await callsTo(page, 'print:print')) as Array<{ openAfter: boolean }>)[2]!.openAfter,
  ).toBe(false);

  await onCall(
    page,
    'print:print',
    `() => ({ ok: false, reason: 'refused', message: 'Nobody is left to print.' })`,
  );
  await page.getByTestId('print-page').click();
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText("Couldn't print that");
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText('Nobody is left to print.');
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Nothing written.');

  await onCall(
    page,
    'print:preview',
    `() => ({ ok: true, value: { drivers: 24, pages: 2, openFailed: false } })`,
  );
  await page.getByTestId('print-preview-file').click();
  await expect(page.getByTestId('load-out-status')).toHaveText('Preview: 24 drivers on 2 pages.');
});

test('saved layouts: save as, load, delete, and reset keeps them', async ({ page }) => {
  await openTab(page, ['Yard Sheet']);
  await onCall(
    page,
    'print:save-preset',
    `(input) => ({ ok: true, value: ['Yard Sheet', input.name] })`,
  );
  await page.getByTestId('print-save-preset').click();
  await page.getByTestId('print-ask-input').fill('  Check-in Sheet ');
  await page.getByTestId('print-ask-ok').click();
  expect(((await callsTo(page, 'print:save-preset')) as Array<{ name: string }>)[0]!.name).toBe(
    'Check-in Sheet',
  );
  await expect(page.getByTestId('load-out-status')).toHaveText(
    "Saved this layout as 'Check-in Sheet'.",
  );

  // Saving over a name asks first.
  await page.getByTestId('print-save-preset').click();
  await page.getByTestId('print-ask-input').fill('Yard Sheet');
  await page.getByTestId('print-ask-ok').click();
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText(
    "'Yard Sheet' already exists.",
  );
  await page.getByTestId('print-ask-cancel').click();
  expect(await callsTo(page, 'print:save-preset')).toHaveLength(1);

  const yard = { ...DEFAULT_SPEC, title: 'Yard Sheet', columns: DEFAULT_SPEC.columns.slice(1, 3) };
  await onCall(page, 'print:load-preset', `() => ({ ok: true, value: ${JSON.stringify(yard)} })`);
  await page.getByTestId('print-preset').selectOption('Yard Sheet');
  await expect(page.getByTestId('load-out-status')).toHaveText("Loaded the 'Yard Sheet' layout.");
  await expect(page.getByTestId('print-column-row')).toHaveCount(2);
  await expect(page.getByTestId('print-title')).toHaveText(`Yard Sheet  -  ${DATE}`);

  await onCall(page, 'print:delete-preset', `() => ({ ok: true, value: [] })`);
  await page.getByTestId('print-delete-preset').click();
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText(
    "Remove the saved layout 'Yard Sheet'?",
  );
  await page.getByTestId('print-ask-ok').click();
  expect(await callsTo(page, 'print:delete-preset')).toEqual([{ name: 'Yard Sheet' }]);

  await onCall(page, 'print:reset', `() => ({ ok: true, value: ${JSON.stringify(DEFAULT_SPEC)} })`);
  await page.getByTestId('print-reset').click();
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Print layout back to how it started.',
  );
  await expect(page.getByTestId('print-column-row')).toHaveCount(7);
});

test('Export Roster and Export with DWP say what they wrote, or why not', async ({ page }) => {
  // The two buttons sit on the Roster tab's toolbar and speak on the page's status line.
  await openTab(page, [], 'roster');
  await onCall(
    page,
    'print:export',
    `(input) => input.withDwp
      ? ({ ok: true, value: { status: 'nothing', reason: 'no-dwp-sheet' } })
      : ({ ok: true, value: { status: 'written', fileName: 'Load Out.xlsx', drivers: 24, carryingDwp: 0 } })`,
  );
  await page.getByTestId('export-roster').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Exported 24 drivers to Load Out.xlsx.',
  );
  await page.getByTestId('export-with-dwp').click();
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText(
    'Nothing to put in those columns',
  );
  await expect(page.locator('[data-dialog="print-ask"]')).toContainText(
    'There is no DWP sheet loaded either',
  );
  await page.getByTestId('print-ask-ok').click();
  await expect(page.getByTestId('load-out-status')).toHaveText(
    "Nothing to export - the DWP data isn't on the roster yet.",
  );
  expect(await callsTo(page, 'print:export')).toEqual([{ withDwp: false }, { withDwp: true }]);
});

test('Ctrl+P on the Load Out page runs Print Page from any tab, and says so on the one status line', async ({
  page,
}) => {
  await openTab(page, [], 'roster');
  await onCall(
    page,
    'print:print',
    `() => ({ ok: true, value: { status: 'written', fileName: 'Load Out.pdf', drivers: 24, pages: 1, leftOff: 0, openFailed: false } })`,
  );
  await page.locator('body').press('Control+p');
  await expect(page.getByRole('tab', { name: 'Print' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('load-out-status')).toHaveText(
    'Wrote 24 drivers over 1 page to Load Out.pdf.',
  );
  const calls = (await callsTo(page, 'print:print')) as Array<Record<string, unknown>>;
  expect(calls.map((c) => c.vans)).toEqual([false]);
  // The tab has no status line of its own: the page's bottom line is the only one.
  await expect(page.getByTestId('print-status')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(1);

  // Switching tabs clears it: what the Print tab said is not news on the Roster tab.
  await page.getByRole('tab', { name: 'Roster', exact: true }).click();
  await expect(page.getByTestId('load-out-status')).toHaveText('');

  // Not while a question is open.
  await page.getByRole('button', { name: 'Clear Roster' }).click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.keyboard.press('Control+p');
  await expect(page.getByRole('tab', { name: 'Roster', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await callsTo(page, 'print:print')).toHaveLength(1);
});
