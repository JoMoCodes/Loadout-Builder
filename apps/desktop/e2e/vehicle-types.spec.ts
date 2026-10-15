// The Vehicle Types tab, driven in a real browser on the stand-in bridge: the Assign Vans order,
// the types and the vans flagged to look at, and each change (with its question first and its
// Undo after). The rules are proved by the core's tests; these prove the page.

import { expect, test, type Page } from '@playwright/test';
import { callsTo } from './support/fakeBridge';
import { VIN_A, VIN_B, VIN_C, commandChanges, openPage, van } from './support/pageData';
import { snapshotTypes } from './support/vanType';

const status = (page: Page) => page.getByTestId('vehicle-data-status');
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const row = (page: Page, text: string) => page.locator('[role="row"]', { hasText: text });

const COURTESY = {
  id: 'courtesy',
  name: 'Courtesy',
  drive: 'anyone',
  position: 5,
  words: ['COURTESY'],
  builtIn: false,
  vans: 0,
  place: 5,
};

const FLEET = () => [
  van(VIN_A, '101', { vehicle: { ownership: 'AMAZON_OWNED' } }),
  van(VIN_B, '655080 (LMR)', { inUse: true, vehicle: { ownership: 'AMAZON_OWNED' } }),
  van(VIN_C, 'XL-3', { vehicle: { ownership: 'LOANER' } }),
];

async function openTypes(page: Page) {
  await openPage(page, 'vehicle-data', {
    snapshot: {
      vehicles: FLEET() as never,
      vehicleTypes: [...snapshotTypes(), COURTESY] as never,
      unknownOwnership: [{ word: 'LOANER', vans: 1 }],
    } as never,
  });
  await page.getByTestId('vehicle-data-tab-types').click();
}

test('shows the Assign Vans order, the types, and the vans to look at', async ({ page }) => {
  await openTypes(page);
  const order = page.getByTestId('types-order').locator('li');
  await expect(order).toHaveText([
    /1Step vansAny owner\. Always first/,
    /2Branded Van/,
    /3Rental Van/,
    /4LMR Rental/,
    /5Courtesy/,
  ]);
  await expect(page.getByTestId('types-not-in-order')).toContainText('Self-Owned');
  await expect(page.locator('[data-type="lmr-rental"]')).toContainText('LMR approved only');
  await expect(page.locator('[data-type="lmr-rental"]')).toContainText('4 of 5');
  await expect(page.getByTestId('delete-type-lmr-rental')).toHaveCount(0);
  await expect(page.getByTestId('delete-type-courtesy')).toBeVisible();
  await expect(row(page, '655080 (LMR)')).toContainText('Name says LMR, type is Branded Van');
  await expect(row(page, 'XL-3')).toContainText('The app doesn\'t know "Loaner"');
  await expect(page.getByTestId('types-unknown')).toContainText('LOANER');
});

test("sets a van's type, asking first when a driver holds it, and Undo puts it back", async ({
  page,
}) => {
  await openTypes(page);
  await commandChanges(
    page,
    'vehicles:set-types',
    { vehicleTypeOverrides: { [VIN_B]: 'lmr-rental' } },
    { changed: 1 },
  );
  await commandChanges(page, 'vehicles:restore-types', { vehicleTypeOverrides: {} });
  await row(page, '655080 (LMR)').click();
  await page.getByTestId('set-type').click();
  await page.getByTestId('pick-type-lmr-rental').check();
  await page.getByTestId('pick-type-ok').click();
  const question = dialog(page, 'confirm');
  await expect(question).toContainText('This changes 1 van: 655080 (LMR).');
  await expect(question).toContainText("1 of them is with a driver on today's roster");
  await question.getByRole('button', { name: 'Yes, change them' }).click();
  await expect(status(page)).toHaveText('655080 (LMR) set to LMR Rental.');
  expect(await callsTo(page, 'vehicles:set-types')).toEqual([
    { changes: [{ vin: VIN_B, typeId: 'lmr-rental' }] },
  ]);
  await page.getByTestId('types-undo').click();
  await expect(status(page)).toHaveText('Put back as it was.');
  const [undo] = (await callsTo(page, 'vehicles:restore-types')) as Array<{
    types: Array<{ id: string }>;
    overrides: Record<string, string>;
  }>;
  expect(undo!.overrides).toEqual({});
  expect(undo!.types.map((type) => type.id)).toContain('courtesy');
});

test('creates a type: who may drive it, where it lands in the order, and its words', async ({
  page,
}) => {
  await openTypes(page);
  await commandChanges(page, 'vehicles:save-type', null, { id: 'loaner' });
  await page.getByTestId('create-type').click();
  const window = dialog(page, 'vehicle-type');
  await window.getByTestId('type-save').click();
  await expect(window.getByTestId('type-problem')).toHaveText('Give the type a name.');
  await window.getByTestId('type-name').fill('courtesy');
  await window.getByTestId('type-save').click();
  await expect(window.getByTestId('type-problem')).toHaveText(
    'There is already a type called Courtesy.',
  );
  await window.getByTestId('type-name').fill('Loaner');
  // A new type starts last; one step earlier puts it before Courtesy.
  await expect(window.locator('[data-mine="true"]')).toContainText('6');
  await window.getByTestId('type-earlier').click();
  await expect(window.locator('[data-mine="true"]')).toContainText('5');
  await window.getByTestId('type-suggest-LOANER').click();
  await window.getByTestId('type-save').click();
  const question = dialog(page, 'confirm');
  await expect(question).toContainText('This changes 1 van: XL-3.');
  await question.getByRole('button', { name: 'Yes, change them' }).click();
  await expect(status(page)).toHaveText('Loaner created.');
  expect(await callsTo(page, 'vehicles:save-type')).toEqual([
    { id: null, name: 'Loaner', drive: 'anyone', words: ['LOANER'], place: 4 },
  ]);
});

test('a hand-only type has no place in the order', async ({ page }) => {
  await openTypes(page);
  await page.getByTestId('create-type').click();
  const window = dialog(page, 'vehicle-type');
  await window.getByTestId('type-drive-hand').check();
  await expect(window.getByTestId('type-not-in-order')).toBeVisible();
  await expect(window.getByTestId('type-order')).toHaveCount(0);
});

test('moves a type in the order, deletes one, and adds a word nobody knew', async ({ page }) => {
  await openTypes(page);
  await commandChanges(page, 'vehicles:move-type', null);
  await commandChanges(page, 'vehicles:delete-type', null);
  await commandChanges(page, 'vehicles:add-ownership-word', null);

  // No van here is a Rental Van or an LMR Rental, so swapping them asks nothing.
  await page.getByTestId('type-down-rental').click();
  await expect(dialog(page, 'confirm')).toHaveCount(0);
  await expect(status(page)).toHaveText('Rental Van moved later in the Assign Vans order.');
  expect(await callsTo(page, 'vehicles:move-type')).toEqual([{ id: 'rental', direction: 'later' }]);

  await page.getByTestId('delete-type-courtesy').click();
  const remove = dialog(page, 'delete-type');
  await expect(remove).toContainText('No van is this type right now.');
  await remove.getByTestId('delete-type-move-to').selectOption('rental');
  await remove.getByTestId('delete-type-ok').click();
  await expect(status(page)).toHaveText('Courtesy deleted. Its vans are now Rental Van.');
  expect(await callsTo(page, 'vehicles:delete-type')).toEqual([
    { id: 'courtesy', moveTo: 'rental' },
  ]);

  await page.getByTestId('add-word-LOANER').click();
  await page.getByTestId('pick-type-rental').check();
  await page.getByTestId('pick-type-ok').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, change them' }).click();
  await expect(status(page)).toHaveText('LOANER now means Rental Van.');
  expect(await callsTo(page, 'vehicles:add-ownership-word')).toEqual([
    { typeId: 'rental', word: 'LOANER' },
  ]);
});
