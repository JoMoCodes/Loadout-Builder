// The teaching for the Route Sheets page, on the stand-in bridge: its tour, and the "?" on the
// Bring in the route sheet PDF box that says where to get the file. A short stand-in day stands
// in for the app's answers (the page's own tests are in route-sheets.spec.ts). Every name and ID
// comes from packages/fixtures/manifest.json; the email addresses are at example.com.

import { expect, test, type Page } from '@playwright/test';
import { callsTo, installFakeBridge } from './support/fakeBridge';
import { BARRETT, COLTON, ZANE, associate, emptyRouteSets } from './support/pageData';

type Json = Record<string, unknown>;

const RUN_ID = 'XXX1_2026-09-01_CYCLE1';
const tour = (page: Page) => page.getByTestId('tour');

function sheet(staging: string): Json {
  return {
    pageNumber: 1,
    pageNumbers: [1],
    staging,
    waveTime: '10:20 AM',
    pad: '1',
    serviceType: 'Standard Parcel',
    dsp: 'XXXX',
    station: 'XXX1',
    date: '2026-09-01',
    dateLabel: 'Tue, Sep 1, 2026',
    cycle: 'CYCLE_1',
    bagCount: 20,
    overflowCount: 10,
    totalPackages: 210,
    commercialPackages: 0,
    checkOk: true,
    checkProblems: [],
    notes: [],
  };
}

function listed(who: { name: string; id: string }, email: string): Json {
  return {
    transporterId: who.id,
    routesName: who.name,
    found: true,
    rosterName: who.name,
    status: 'ACTIVE',
    email,
    otherRoutes: [],
    nameMismatch: false,
    problem: null,
    valid: true,
  };
}

/** One route that is ready, and one that waits for a choice (with a suggestion). */
function distribution(): Json {
  const base = {
    hasSheet: true,
    onRoutesFile: true,
    listed: [],
    kind: 'single',
    source: 'auto',
    suggestion: null,
    suggestionReason: null,
    issues: [],
  };
  return {
    routes: [
      {
        ...base,
        routeCode: 'CX101',
        sheet: sheet('STG.A1'),
        state: 'ready',
        recipients: [
          {
            transporterId: BARRETT.id,
            name: BARRETT.name,
            email: 'driver001@example.com',
            status: 'ACTIVE',
          },
        ],
        listed: [listed(BARRETT, 'driver001@example.com')],
        headline: 'Exact Transporter ID match',
      },
      {
        ...base,
        routeCode: 'CX102',
        sheet: sheet('STG.B2'),
        state: 'needs-decision',
        kind: 'duplicate',
        recipients: [],
        listed: [listed(COLTON, 'driver002@example.com'), listed(ZANE, 'driver003@example.com')],
        suggestion: COLTON.id,
        suggestionReason: 'Only driver on this route who is not also listed on another route',
        headline: '2 Transporter IDs are listed on this route',
      },
    ],
    people: { notReceiving: [], multiple: [] },
    counts: {
      total: 2,
      missingEmail: 0,
      ready: 1,
      'needs-decision': 1,
      exception: 0,
      skipped: 0,
      'no-sheet': 0,
    },
    waves: [{ waveTime: '10:20 AM', routes: 2, pad: '1' }],
    unsent: ['CX101'],
    typedPadWaves: [],
  };
}

function stateView(): Json {
  return {
    run: {
      id: RUN_ID,
      label: 'XXX1 · Tue, Sep 1, 2026 · CYCLE_1',
      saved: true,
      station: 'XXX1',
      date: '2026-09-01',
      dateLabel: 'Tue, Sep 1, 2026',
      cycle: 'CYCLE_1',
      pdfFileName: '2026-09-01.pdf',
      importedAt: '2026-09-01T12:00:00.000Z',
      pageCount: 2,
      warnings: [],
      routesFileName: 'Routes_XXX1_2026-09-01.xlsx',
      sheetCount: 2,
      checkFailures: [],
      sent: {},
      decisions: {},
      typedPads: {},
      pdfMissing: false,
    },
    runs: [],
    routeData: { kind: 'routes', label: 'Routes', fileName: 'Routes_XXX1_2026-09-01.xlsx' },
    driverList: {
      count: 3,
      fileName: 'AssociateData.csv',
      importedAt: new Date().toISOString(),
      refreshDueAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    },
    oldAppFolder: false,
    emailProblem: null,
    sending: false,
    unsent: 1,
  };
}

async function openRouteSheets(page: Page, settings: Json = {}) {
  await installFakeBridge(page, {
    settings: { demoMode: false, ...settings },
    snapshot: {
      routeSets: emptyRouteSets() as never,
      associates: [
        associate(BARRETT, { associate: { email: 'driver001@example.com' } }),
        associate(COLTON, { associate: { email: 'driver002@example.com' } }),
        associate(ZANE, { associate: { email: 'driver003@example.com' } }),
      ] as never,
    },
  });
  await page.addInitScript(
    ({ state, dist }) => {
      const w = window as unknown as { __fake: { hooks: Record<string, () => unknown> } };
      const ok = (value: unknown) => ({ ok: true, value });
      w.__fake.hooks['routeSheets:state'] = () => ok(structuredClone(state));
      w.__fake.hooks['routeSheets:distribution'] = () => ok(structuredClone(dist));
      w.__fake.hooks['routeSheets:runs'] = () => ok([]);
    },
    { state: stateView(), dist: distribution() },
  );
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'route-sheets'));
  await page.goto('/');
  await page.locator('[data-page="route-sheets"]').waitFor();
}

/** The names saved as "seen" by the last settings change that carried them. */
async function seenSaved(page: Page): Promise<string[]> {
  const patches = (await callsTo(page, 'settings:set')) as Array<{ toursSeen?: string[] }>;
  return patches.filter((p) => p.toursSeen).at(-1)?.toursSeen ?? [];
}

test('the Route Sheets tour runs by itself the first time and walks through the page', async ({
  page,
}) => {
  await openRouteSheets(page, { autoTours: true, toursSeen: ['home'] });
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'route-sheets', { timeout: 8000 });
  await expect(tour(page)).toContainText('Step 1 of 6');
  await expect(tour(page)).toContainText('What the app reads');
  const titles = [
    'Bring in the PDF',
    'The counts',
    'Choose who gets a route sheet',
    'Check it, then send it',
    "Yesterday's work",
  ];
  for (const title of titles) {
    await page.keyboard.press('Enter');
    await expect(tour(page)).toContainText(title);
  }
  await expect(tour(page)).toContainText('Step 6 of 6');
  await tour(page).getByRole('button', { name: 'Done' }).click();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => seenSaved(page)).toEqual(['home', 'route-sheets']);

  // Away and back: it does not run again.
  await page.click('[data-nav="settings"]');
  await page.click('[data-nav="route-sheets"]');
  await expect(page.locator('[data-page="route-sheets"]')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
});

test('Help > Take the tour runs the Route Sheets tour again', async ({ page }) => {
  await openRouteSheets(page, { autoTours: true, toursSeen: ['home', 'route-sheets'] });
  await page.waitForTimeout(800);
  await expect(tour(page)).toHaveCount(0);
  await page.getByTestId('help-menu').click();
  await page.getByTestId('take-tour').click();
  await expect(tour(page)).toHaveAttribute('data-tour-name', 'route-sheets');
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
});

test('the ? on the Bring in box says where to get the PDF, with the picture', async ({ page }) => {
  await openRouteSheets(page);
  await page.getByTestId('route-sheets-bring-in-help').click();
  const note = page.locator('dialog[data-dialog="where-to-get"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Where to get the route sheet PDF');
  await expect(note).toContainText('escalations');
  await expect(note).toContainText('Settings');
  const pictures = note.locator('figure.help-shot img');
  await expect(pictures).toHaveCount(2);
  for (const img of await pictures.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(img).toHaveAttribute('alt', /.+/);
  }
  await note.getByRole('button', { name: 'Close' }).click();
  await expect(note).toHaveCount(0);
});
