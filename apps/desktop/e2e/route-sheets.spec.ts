// The Route Sheets page on the stand-in bridge: the cards at the top, the Distribute tab with one
// route in each of the five states, the Sheets tab and every way to send, the History tab, a
// dropped PDF, a refusal and the keys. The stand-in does not run the matcher, so these prove the
// page; the rules are proved by the route sheets package's tests, the handler tests and the
// Electron smoke check. Every name and ID comes from packages/fixtures/manifest.json; the email
// addresses are at example.com.

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_ROUTE_SHEETS_EMAIL } from '../src/shared/settings';
import { callsTo, emit, installFakeBridge, onCall } from './support/fakeBridge';
import { BARRETT, CARMEN, COLTON, ZANE, associate, emptyRouteSets } from './support/pageData';

type Json = Record<string, unknown>;

const ARCHER = { name: 'Archer Gresham', id: 'A02V4L9HIELIDL' };
const mail = (n: number) => `driver${String(n).padStart(3, '0')}@example.com`;
const RUN_ID = 'XXX1_2026-09-01_CYCLE1';
const OLDER_RUN = 'XXX1_2026-08-31_CYCLE1';

function person(who: { name: string; id: string }, email: string, status = 'ACTIVE'): Json {
  return { transporterId: who.id, name: who.name, email, status };
}

function listed(who: { name: string; id: string }, values: Json = {}): Json {
  return {
    transporterId: who.id,
    routesName: who.name,
    found: true,
    rosterName: who.name,
    status: 'ACTIVE',
    email: mail(1),
    otherRoutes: [],
    nameMismatch: false,
    problem: null,
    valid: true,
    ...values,
  };
}

function sheet(staging: string, waveTime: string, pad: string | null, values: Json = {}): Json {
  return {
    pageNumber: 1,
    pageNumbers: [1],
    staging,
    waveTime,
    pad,
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
    ...values,
  };
}

function route(routeCode: string, values: Json): Json {
  return {
    routeCode,
    hasSheet: true,
    onRoutesFile: true,
    sheet: sheet('STG.A1', '10:20 AM', '1'),
    listed: [],
    kind: 'single',
    state: 'ready',
    source: 'auto',
    recipients: [],
    suggestion: null,
    suggestionReason: null,
    headline: 'Exact Transporter ID match',
    issues: [],
    ...values,
  };
}

/** One route in each of the five states, and one chosen by hand (for Change). */
function routes(): Json[] {
  return [
    route('CX102', {
      kind: 'duplicate',
      state: 'needs-decision',
      sheet: sheet('STG.B2', '10:20 AM', '1'),
      listed: [
        listed(COLTON, { email: mail(2) }),
        listed(ZANE, { email: mail(3), otherRoutes: ['CX105'] }),
      ],
      suggestion: COLTON.id,
      suggestionReason: 'Only driver on this route who is not also listed on another route',
      headline: '2 Transporter IDs are listed on this route',
    }),
    route('CX103', {
      kind: 'unassigned',
      state: 'exception',
      onRoutesFile: false,
      sheet: sheet('STG.C3', '02:30 PM', null),
      headline: 'Route is in the PDF but not on the routes file',
      issues: [
        {
          level: 'error',
          text: 'CX103 has a route sheet page but is not on the routes file, so no driver is assigned.',
        },
        { level: 'info', text: 'Bag 4 has no Sort Zone on the route sheet' },
      ],
    }),
    route('CX104', {
      hasSheet: false,
      kind: 'no-sheet',
      state: 'no-sheet',
      sheet: null,
      listed: [listed(BARRETT, { email: mail(4) })],
      headline: 'No page for this route in the route sheet PDF',
    }),
    route('CX101', {
      recipients: [person(CARMEN, mail(1))],
      listed: [listed(CARMEN)],
    }),
    route('CX106', {
      source: 'decision',
      headline: 'Resolved by you',
      sheet: sheet('STG.D4', '10:20 AM', '1'),
      recipients: [person(ARCHER, mail(5))],
      listed: [listed(ARCHER, { email: mail(5) })],
    }),
    route('CX105', {
      state: 'skipped',
      source: 'decision',
      headline: 'You chose not to send this route sheet',
      sheet: sheet('STG.E5', '10:20 AM', '1'),
      listed: [listed(ZANE, { email: mail(3), otherRoutes: ['CX102'] })],
    }),
  ];
}

function distribution(): Json {
  return {
    routes: routes(),
    people: {
      notReceiving: [
        {
          transporterId: ZANE.id,
          name: ZANE.name,
          inRoster: true,
          status: 'ACTIVE',
          routes: [
            {
              routeCode: 'CX102',
              reason: `Waiting on your decision — CX102 also lists ${COLTON.name}`,
            },
            { routeCode: 'CX105', reason: 'You chose not to send CX105' },
          ],
        },
      ],
      multiple: [{ transporterId: ARCHER.id, name: ARCHER.name, routes: ['CX106', 'CX107'] }],
    },
    counts: {
      total: 6,
      missingEmail: 0,
      ready: 2,
      'needs-decision': 1,
      exception: 1,
      skipped: 1,
      'no-sheet': 1,
    },
    waves: [
      { waveTime: '10:20 AM', routes: 4, pad: '1' },
      { waveTime: '02:30 PM', routes: 1, pad: null },
    ],
    unsent: ['CX101', 'CX106'],
    typedPadWaves: ['02:30 PM'],
  };
}

function run(values: Json = {}): Json {
  return {
    id: RUN_ID,
    label: 'XXX1 · Tue, Sep 1, 2026 · CYCLE_1',
    saved: true,
    station: 'XXX1',
    date: '2026-09-01',
    dateLabel: 'Tue, Sep 1, 2026',
    cycle: 'CYCLE_1',
    pdfFileName: '2026-09-01.pdf',
    importedAt: '2026-09-01T12:00:00.000Z',
    pageCount: 7,
    warnings: ['Page 7 is blank and was skipped.'],
    routesFileName: 'Routes_XXX1_2026-09-01.xlsx',
    sheetCount: 5,
    checkFailures: ['CX103'],
    sent: {},
    decisions: {},
    typedPads: {},
    pdfMissing: false,
    ...values,
  };
}

function runListing(id: string, label: string, values: Json = {}): Json {
  return {
    id,
    label,
    date: id.slice(5, 15),
    updatedAt: '2026-09-01T14:05:00.000Z',
    sheets: 5,
    pdfFileName: `${id.slice(5, 15)}.pdf`,
    routesFileName: 'Routes_XXX1.xlsx',
    pdfMissing: false,
    ...values,
  };
}

function stateView(values: Json = {}): Json {
  const due = new Date(Date.now() + 20 * 86_400_000).toISOString();
  return {
    run: run(),
    runs: [
      runListing(RUN_ID, 'XXX1 · Tue, Sep 1, 2026 · CYCLE_1'),
      runListing(OLDER_RUN, 'XXX1 · Mon, Aug 31, 2026 · CYCLE_1', { pdfMissing: true }),
    ],
    routeData: { kind: 'routes', label: 'Routes', fileName: 'Routes_XXX1_2026-09-01.xlsx' },
    driverList: {
      count: 5,
      fileName: 'AssociateData.csv',
      importedAt: new Date().toISOString(),
      refreshDueAt: due,
    },
    oldAppFolder: false,
    emailProblem: null,
    sending: false,
    unsent: 2,
    ...values,
  };
}

const PREVIEW_HTML =
  '<html><body style="margin:0;background:#ffffff;"><h1>Route Sheet</h1><p data-route="CODE">Hi there</p></body></html>';

interface Open {
  state?: Json;
  dist?: Json;
  settings?: Json;
  tab?: string;
}

/**
 * Opens the Route Sheets page on the stand-in bridge. `window.__rs` holds what the routeSheets
 * queries answer; `window.__rsBump()` counts a revision and says the data changed, as the app does
 * after every command; `window.__copied` is what the page put on the clipboard.
 */
async function openRouteSheets(page: Page, options: Open = {}) {
  await installFakeBridge(page, {
    settings: { demoMode: false, ...options.settings },
    snapshot: {
      routeSets: emptyRouteSets() as never,
      associates: [
        associate(CARMEN, { associate: { email: mail(1) } }),
        associate(BARRETT, { associate: { email: mail(4) } }),
        associate(COLTON, { associate: { email: mail(2) } }),
        associate(ZANE, { associate: { email: '', status: 'INACTIVE' } }),
        associate(ARCHER, { associate: { email: mail(5) } }),
      ] as never,
    },
  });
  await page.addInitScript(
    ({ state, dist, html }) => {
      const w = window as unknown as {
        __fake: {
          snapshot: Record<string, unknown>;
          hooks: Record<string, (input: unknown) => unknown>;
          emit: (name: string, payload: unknown) => void;
        };
        __rs: { state: Json; dist: Json; html: string };
        __rsBump: () => void;
        __copied: Array<{ types: string[]; text: string }>;
      };
      type Json = Record<string, unknown>;
      w.__rs = { state, dist, html };
      w.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          write: async (items: ClipboardItem[]) => {
            const item = items[0]!;
            const text = await (await item.getType('text/plain')).text();
            w.__copied.push({ types: [...item.types], text });
          },
          writeText: async (text: string) => {
            w.__copied.push({ types: ['text/plain'], text });
          },
        },
        configurable: true,
      });
      w.__rsBump = () => {
        const next = (w.__fake.snapshot.revision as number) + 1;
        w.__fake.snapshot.revision = next;
        setTimeout(() => w.__fake.emit('state:changed', { revision: next }), 0);
      };
      const ok = (value: unknown) => ({ ok: true, value });
      const hooks = w.__fake.hooks;
      hooks['routeSheets:state'] = () => ok(structuredClone(w.__rs.state));
      hooks['routeSheets:distribution'] = () => ok(structuredClone(w.__rs.dist));
      hooks['routeSheets:runs'] = () => ok(structuredClone(w.__rs.state.runs));
      hooks['routeSheets:preview'] = (input) => {
        const { routeCode } = input as { routeCode: string };
        const found = (w.__rs.dist.routes as Json[]).find((r) => r.routeCode === routeCode);
        return ok({
          routeCode,
          subject: `Route Sheet: ${routeCode} · Tue, Sep 1`,
          html: w.__rs.html.replace('CODE', routeCode),
          text: `Route Sheet ${routeCode}`,
          recipients: found && found.state === 'ready' ? found.recipients : [],
          route: found ?? null,
        });
      };
      // Every command the page runs changes the data in the app, so the stand-in says so.
      for (const name of [
        'routeSheets:set-decision',
        'routeSheets:accept-suggestions',
        'routeSheets:mark-sent',
        'routeSheets:set-wave-pad',
        'routeSheets:load-run',
        'routeSheets:new-run',
        'routeSheets:delete-run',
      ]) {
        hooks[name] = (input) => {
          w.__rsBump();
          if (name === 'routeSheets:accept-suggestions') return ok(2);
          if (name === 'routeSheets:set-wave-pad')
            return ok((input as { pad: string }).pad.trim() || null);
          return ok(null);
        };
      }
      hooks['routeSheets:copy-email'] = (input) => {
        const { routeCode } = input as { routeCode: string };
        return ok({
          html: `<p>Route Sheet ${routeCode}</p>`,
          text: `Route Sheet ${routeCode}`,
          subject: `Route Sheet: ${routeCode}`,
        });
      };
      hooks['routeSheets:open-draft'] = () => ok({ opened: true });
      hooks['routeSheets:open-mail-app'] = () =>
        ok({ mailto: 'mailto:driver001%40example.com?subject=Route', opened: true });
      hooks['routeSheets:save-pdf-page'] = () =>
        ok({ saved: true, fileName: 'CX101 STG.A1 route sheet.pdf' });
      hooks['routeSheets:view-original-page'] = () => ok({ opened: true });
    },
    {
      state: stateView(options.state) as Json,
      dist: { ...distribution(), ...options.dist } as Json,
      html: PREVIEW_HTML,
    },
  );
  await page.addInitScript((tab) => {
    window.localStorage.setItem('loadout.page', 'route-sheets');
    void tab;
  }, options.tab ?? '');
  await page.goto('/');
  await page.locator('[data-page="route-sheets"]').waitFor();
  if (options.tab) await page.getByTestId(`route-sheets-tab-${options.tab}`).click();
}

/** Changes what the queries answer, then says the data changed. */
async function change(page: Page, patch: { state?: Json; dist?: Json }) {
  await page.evaluate((given) => {
    const w = window as unknown as {
      __rs: { state: Record<string, unknown>; dist: Record<string, unknown> };
      __rsBump: () => void;
    };
    Object.assign(w.__rs.state, given.state ?? {});
    Object.assign(w.__rs.dist, given.dist ?? {});
    w.__rsBump();
  }, patch);
}

const status = (page: Page) => page.getByTestId('route-sheets-status');
const problem = (page: Page) => page.getByTestId('route-sheets-problem');
const section = (page: Page, id: string) => page.getByTestId(`route-sheets-section-${id}`);
const dialog = (page: Page, name: string) => page.locator(`dialog[data-dialog="${name}"]`);
const copied = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __copied: Array<{ types: string[]; text: string }> }).__copied,
  );

// ---------------------------------------------------------------- where it is, and the cards

test('sits under Load Out in the menu, with Distribute, Sheets and History tabs', async ({
  page,
}) => {
  await installFakeBridge(page, { settings: { demoMode: false } });
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'route-sheets'));
  await page.goto('/');
  const menu = (await page
    .locator('[data-nav]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-nav')))) as string[];
  expect(menu.indexOf('route-sheets')).toBe(menu.indexOf('load-out') + 1);
  await expect(page.locator('[data-nav="route-sheets"]')).toHaveText('Route Sheets');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Route Sheets');
  await expect(page.getByRole('tab')).toHaveText(['Distribute', 'Sheets', 'History']);
  await expect(page.getByTestId('route-sheets-tab-distribute')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Nothing brought in yet: the page says how to start.
  await expect(page.getByTestId('route-sheets-run-label')).toHaveText(
    'New run (no route sheet PDF yet)',
  );
  await expect(page.getByTestId('route-sheets-start')).toContainText(
    "Bring in today's route sheet PDF.",
  );
  await page.getByTestId('route-sheets-tab-sheets').click();
  await expect(page.getByTestId('route-sheets-no-sheets')).toHaveText(
    'Bring in a route sheet PDF to see the route sheets here.',
  );
  await page.getByTestId('route-sheets-tab-history').click();
  await expect(page.getByText('No saved runs yet.')).toBeVisible();
});

test('the cards ask for the Routes export, the driver list and the email setup, and open those pages', async ({
  page,
}) => {
  await installFakeBridge(page, { settings: { demoMode: false } });
  await page.addInitScript(() => window.localStorage.setItem('loadout.page', 'route-sheets'));
  await page.goto('/');
  await expect(page.getByTestId('route-sheets-route-data-words')).toHaveText(
    'No Routes export is loaded. Bring in the Routes export on the Route Data page, so each route sheet can be matched to its driver.',
  );
  await expect(page.getByTestId('route-sheets-driver-list-missing')).toHaveText('Not loaded');
  await expect(page.getByTestId('route-sheets-email-problem')).toHaveText(
    'Add the from address and the app password in Settings first.',
  );
  await page.getByTestId('route-sheets-open-route-data').click();
  await expect(page.locator('[data-page="route-data"]')).toBeVisible();
  await page.click('[data-nav="route-sheets"]');
  await page.getByTestId('route-sheets-open-associates').click();
  await expect(page.locator('[data-page="associates"]')).toBeVisible();
  await page.click('[data-nav="route-sheets"]');
  await page.getByTestId('route-sheets-open-settings').click();
  await expect(page.locator('[data-page="settings"]')).toBeVisible();
});

test('the cards name the route data in use, an old driver list and a ready email setup', async ({
  page,
}) => {
  await openRouteSheets(page, {
    state: {
      routeData: { kind: 'itineraries', label: 'Itineraries', fileName: 'Itineraries_XXX1.xlsx' },
      driverList: {
        count: 5,
        fileName: 'AssociateData.csv',
        importedAt: '2026-01-01T12:00:00.000Z',
        refreshDueAt: '2026-02-01T12:00:00.000Z',
      },
    },
  });
  await expect(page.getByTestId('route-sheets-run-label')).toHaveText(
    'XXX1 · Tue, Sep 1, 2026 · CYCLE_1',
  );
  await expect(page.getByTestId('route-sheets-run-pdf')).toHaveText(
    '2026-09-01.pdf - 5 route sheets, 1 failed the number check (CX103)',
  );
  await expect(page.getByTestId('route-sheets-route-data-words')).toHaveText(
    'Matching with the Itineraries export: Itineraries_XXX1.xlsx.',
  );
  await expect(page.getByTestId('route-sheets-open-route-data')).toHaveCount(0);
  await expect(page.getByTestId('route-sheets-driver-count')).toHaveText(
    '5 drivers - AssociateData.csv',
  );
  await expect(page.getByTestId('route-sheets-driver-list-old')).toHaveText('Over a month old');
  await expect(page.getByTestId('route-sheets-driver-list-old-note')).toContainText(
    'Bring in the latest driver list',
  );
  await expect(page.getByTestId('route-sheets-email-ready')).toHaveText('Email is ready');

  await change(page, {
    state: {
      routeData: { kind: 'schedule', label: 'Weekly Schedule', fileName: 'Week-36-Schedule.xlsx' },
      driverList: {
        count: 5,
        fileName: 'AssociateData.csv',
        importedAt: new Date().toISOString(),
        refreshDueAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    },
  });
  await expect(page.getByTestId('route-sheets-route-data-words')).toHaveText(
    'Matching with the Weekly Schedule: Week-36-Schedule.xlsx.',
  );
  await expect(page.getByTestId('route-sheets-driver-list-old')).toHaveCount(0);
});

test('the note about the old app shows until Got it, which is remembered', async ({ page }) => {
  await openRouteSheets(page, { state: { oldAppFolder: true } });
  const note = page.getByTestId('route-sheets-old-app-note');
  await expect(note).toHaveText(
    "Route Sheet Distributor's work now lives here. Enter your Gmail app password once in Settings > Email, and you can uninstall the old app.Got it",
  );
  await page.getByTestId('route-sheets-old-app-got-it').click();
  await expect(note).toHaveCount(0);
  expect(await callsTo(page, 'settings:set')).toContainEqual({ routeSheetsNoteSeen: true });
});

test('the note stays away once seen, and when the old app was never here', async ({ page }) => {
  await openRouteSheets(page, {
    state: { oldAppFolder: true },
    settings: { routeSheetsNoteSeen: true },
  });
  await expect(page.getByTestId('route-sheets-run-label')).toBeVisible();
  await expect(page.getByTestId('route-sheets-old-app-note')).toHaveCount(0);
});

// ------------------------------------------------------------------------------- Distribute

test('Distribute shows the counts and one route in each state, in the old order', async ({
  page,
}) => {
  await openRouteSheets(page);
  const count = (id: string) => page.getByTestId(`route-sheets-count-${id}`);
  await expect(count('total')).toHaveText('6 routes');
  await expect(count('ready')).toHaveText('2 ready to send');
  await expect(count('ready')).toHaveAttribute('data-tone', 'ok');
  await expect(count('needs-decision')).toHaveText('1 need your decision');
  await expect(count('needs-decision')).toHaveAttribute('data-tone', 'warn');
  await expect(count('exception')).toHaveText('1 no exact match');
  await expect(count('exception')).toHaveAttribute('data-tone', 'bad');
  await expect(count('no-sheet')).toHaveText('1 missing from the PDF');
  await expect(count('no-sheet')).toHaveAttribute('data-tone', 'bad');
  await expect(count('skipped')).toHaveText('1 not sending');
  await expect(count('people')).toHaveText('1 person not getting a sheet');
  await expect(count('people')).toHaveAttribute('data-tone', 'warn');
  await expect(count('missing-email')).toHaveCount(0);

  const headings = await page.locator('[data-testid^="route-sheets-section-"] h2').allInnerTexts();
  expect(headings).toEqual([
    'Pad for each wave',
    'Ready to send',
    'Choose who gets these route sheets',
    'No exact match',
    'On the Routes file but missing from the PDF',
    "People who won't get a route sheet",
    'All routes',
  ]);

  const ready = section(page, 'ready');
  await expect(ready.locator('tbody tr')).toHaveCount(2);
  await expect(ready.locator('tr[data-route="CX101"]')).toContainText(CARMEN.name);
  await expect(ready.locator('tr[data-route="CX101"]')).toContainText(mail(1));

  const decide = page.getByTestId('route-sheets-decide-CX102');
  await expect(decide).toContainText(COLTON.name);
  await expect(decide).toContainText(ZANE.name);
  await expect(decide).toContainText('Also listed on CX105');
  const suggested = page.getByTestId('route-sheets-suggested-CX102');
  await expect(suggested).toHaveText('Suggested');
  await expect(suggested).toHaveAttribute(
    'title',
    'Only driver on this route who is not also listed on another route',
  );

  const exception = page.getByTestId('route-sheets-exception-CX103');
  await expect(exception.getByTestId('route-sheets-headline')).toHaveText(
    'Route is in the PDF but not on the routes file',
  );
  const issues = page.getByTestId('route-sheets-issues-CX103').locator('li');
  await expect(issues.nth(0)).toHaveAttribute('data-level', 'error');
  await expect(issues.nth(0)).toHaveClass(/text-bad/);
  await expect(issues.nth(1)).toHaveClass(/text-muted/);

  await expect(section(page, 'no-sheet')).toContainText('CX104');
  await expect(section(page, 'no-sheet')).toContainText(BARRETT.name);
  await expect(section(page, 'no-sheet')).toContainText(
    'No page for this route in the route sheet PDF',
  );

  const people = page.getByTestId('route-sheets-not-receiving');
  await expect(people).toContainText(ZANE.name);
  await expect(people).toContainText('You chose not to send CX105');
  await expect(page.getByTestId('route-sheets-multiple')).toHaveText(
    `${ARCHER.name} gets 2 route sheets: CX106, CX107`,
  );

  // All routes: one table, every route, with its state.
  const grid = page.getByRole('grid', { name: 'All routes' });
  await expect(grid.locator('[role="rowgroup"] [role="row"]')).toHaveCount(6);
  await expect(grid.locator('[data-row-id="CX105"] [data-col-id="status"]')).toHaveText(
    'Not sending',
  );
  await expect(grid.locator('[data-row-id="CX104"] [data-col-id="listed"]')).toContainText(
    BARRETT.name,
  );
});

test('Choose, Accept all suggestions, Send to all and Don’t send set the choices', async ({
  page,
}) => {
  await openRouteSheets(page);
  await page.getByTestId(`route-sheets-choose-CX102-${COLTON.id}`).click();
  await expect(status(page)).toHaveText(`CX102 goes to ${COLTON.name}.`);
  expect(await callsTo(page, 'routeSheets:set-decision')).toEqual([
    { routeCode: 'CX102', decision: { recipients: [COLTON.id] } },
  ]);

  await page.getByTestId('route-sheets-accept-suggestions').click();
  await expect(status(page)).toHaveText('Accepted 2 suggestions.');
  // It asks nothing first.
  await expect(dialog(page, 'confirm')).toHaveCount(0);
  expect(await callsTo(page, 'routeSheets:accept-suggestions')).toHaveLength(1);

  await page.getByTestId('route-sheets-send-all-CX102').click();
  await page.getByTestId('route-sheets-skip-CX102').click();
  await expect(status(page)).toHaveText('CX102 will not be sent.');
  expect((await callsTo(page, 'routeSheets:set-decision')).slice(1)).toEqual([
    { routeCode: 'CX102', decision: { recipients: [COLTON.id, ZANE.id] } },
    { routeCode: 'CX102', decision: { skipped: true } },
  ]);
  // The page read the run again after each choice.
  expect((await callsTo(page, 'routeSheets:distribution')).length).toBeGreaterThan(3);
});

test('No exact match: Assign someone from the list, or Don’t send', async ({ page }) => {
  await openRouteSheets(page);
  await page.getByTestId('route-sheets-assign-CX103').click();
  await expect(status(page)).toHaveText('Pick someone from the list first.');
  expect(await callsTo(page, 'routeSheets:set-decision')).toEqual([]);

  const select = page.getByTestId('route-sheets-assign-select-CX103');
  // Every driver on the list, the ones not active marked as such.
  await expect(select.locator('optgroup[label="Active drivers"] option')).toHaveCount(4);
  await expect(select.locator('optgroup[label="Not active"] option')).toHaveText([
    `${ZANE.name} - ${ZANE.id} (INACTIVE)`,
  ]);
  await expect(select.locator(`option[value="${COLTON.id}"]`)).toHaveText(
    `${COLTON.name} - ${COLTON.id}`,
  );
  await select.selectOption(BARRETT.id);
  await page.getByTestId('route-sheets-assign-CX103').click();
  await expect(status(page)).toHaveText(`CX103 goes to ${BARRETT.name}.`);
  await page.getByTestId('route-sheets-skip-CX103').click();
  expect(await callsTo(page, 'routeSheets:set-decision')).toEqual([
    { routeCode: 'CX103', decision: { recipients: [BARRETT.id], manual: true } },
    { routeCode: 'CX103', decision: { skipped: true } },
  ]);
});

test('All routes: Change undoes a choice, by button or by key', async ({ page }) => {
  await openRouteSheets(page);
  const grid = page.getByRole('grid', { name: 'All routes' });
  // Only a route chosen by hand can be changed.
  await expect(page.getByTestId('route-sheets-change-CX101')).toHaveCount(0);
  await page.getByTestId('route-sheets-change-CX106').click();
  await expect(status(page)).toHaveText("CX106 is back to the app's own match.");
  // Enter on the Change cell does the same.
  await grid.locator('[data-row-id="CX105"] [data-col-id="notes"]').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  expect(await callsTo(page, 'routeSheets:set-decision')).toEqual([
    { routeCode: 'CX106', decision: null },
    { routeCode: 'CX105', decision: null },
  ]);
  // Enter on any other cell opens the route sheet.
  await grid.locator('[data-row-id="CX101"] [data-col-id="route"]').click();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('route-sheets-tab-sheets')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('route-sheets-detail-code')).toContainText('CX101');
});

test('the pad box shows only for a wave the route data does not know', async ({ page }) => {
  await openRouteSheets(page);
  const pads = section(page, 'pads');
  await expect(pads).toContainText('02:30 PM');
  await expect(pads).toContainText('1 route');
  await expect(pads.locator('input')).toHaveCount(1);
  const box = page.getByTestId('route-sheets-pad-02-30-PM');
  await expect(box).toHaveAccessibleName('Pad for the 02:30 PM wave');
  await box.fill('B12');
  await box.press('Enter');
  await expect(status(page)).toHaveText('Pad B12 for the 02:30 PM wave.');
  expect(await callsTo(page, 'routeSheets:set-wave-pad')).toEqual([
    { waveTime: '02:30 PM', pad: 'B12' },
  ]);

  await change(page, { dist: { typedPadWaves: [] } });
  await expect(section(page, 'pads')).toHaveCount(0);
  await expect(page.getByTestId('route-sheets-pads-note')).toHaveText(
    'The pad for each wave comes from the Route Data page.',
  );
});

test('drivers with no email address are counted on Distribute', async ({ page }) => {
  await openRouteSheets(page, {
    dist: {
      counts: {
        total: 6,
        missingEmail: 1,
        ready: 2,
        'needs-decision': 1,
        exception: 1,
        skipped: 1,
        'no-sheet': 1,
      },
    },
  });
  await expect(page.getByTestId('route-sheets-count-missing-email')).toHaveText(
    '1 without an email address',
  );
});

test('a refused choice is shown in plain words, never a code', async ({ page }) => {
  await openRouteSheets(page);
  await onCall(
    page,
    'routeSheets:set-decision',
    `() => ({ ok: false, reason: 'refused', message: 'That route is not in this run.' })`,
  );
  await page.getByTestId('route-sheets-skip-CX102').click();
  await expect(problem(page)).toContainText('That route is not in this run.');
  await onCall(page, 'routeSheets:accept-suggestions', `() => ({ ok: false, reason: 'failed' })`);
  await page.getByTestId('route-sheets-accept-suggestions').click();
  await expect(problem(page)).toContainText('Something went wrong');
  await expect(problem(page)).not.toContainText('failed');
});

// --------------------------------------------------------------------------- bringing it in

test('Bring in the route sheet PDF picks it and says what was read', async ({ page }) => {
  await openRouteSheets(page);
  await onCall(
    page,
    'files:pick',
    `() => ({ ok: true, value: { path: 'C:/Downloads/2026-09-01.pdf' } })`,
  );
  await onCall(
    page,
    'files:import',
    `() => { window.__rsBump(); return { ok: true, value: { kind: 'route-sheets', rows: 5, routeSheets: {
      message: 'Read 5 route sheets from 2026-09-01.pdf — 1 did not pass the number check.',
      warnings: ['Page 7 is blank and was skipped.'], runId: '${RUN_ID}' } } }; }`,
  );
  await page.getByTestId('route-sheets-bring-in').click();
  await expect(status(page)).toHaveText(
    'Read 5 route sheets from 2026-09-01.pdf — 1 did not pass the number check.',
  );
  await expect(page.getByTestId('route-sheets-warnings')).toHaveText(
    'Page 7 is blank and was skipped.',
  );
  expect(await callsTo(page, 'files:pick')).toEqual([{ kind: 'route-sheets' }]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'route-sheets', path: 'C:/Downloads/2026-09-01.pdf' },
  ]);

  // A file that is not a route sheet PDF is refused in the reader's words.
  await onCall(
    page,
    'files:import',
    `() => ({ ok: false, reason: 'refused', message: 'No route sheets were found in notes.pdf.' })`,
  );
  await page.getByTestId('route-sheets-bring-in').click();
  await expect(problem(page)).toContainText('No route sheets were found in notes.pdf.');
  await expect(problem(page)).toContainText('Could not bring the PDF in');
  await expect(status(page)).toHaveText('The PDF did not come in.');
});

/** Drags a made-up file over the page and lets go, the way a file from the computer arrives. */
async function dropFile(page: Page, name: string, letGo = true) {
  const target = page.locator('[data-drop-kind="route-sheets"]');
  const data = await page.evaluateHandle((fileName) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['made-up'], fileName));
    return transfer;
  }, name);
  await target.dispatchEvent('dragenter', { dataTransfer: data });
  await target.dispatchEvent('dragover', { dataTransfer: data });
  if (letGo) await target.dispatchEvent('drop', { dataTransfer: data });
}

test('a PDF dropped on the page is brought in, and a file of the wrong kind is refused', async ({
  page,
}) => {
  await openRouteSheets(page);
  await onCall(
    page,
    'files:dropped',
    `(input) => ({ ok: true, value: { token: 'dropped-1/' + input.file.name } })`,
  );
  await onCall(
    page,
    'files:import',
    `() => ({ ok: true, value: { kind: 'route-sheets', rows: 5, routeSheets: {
      message: 'Read 5 route sheets from 2026-09-01.pdf — all numbers check out.', warnings: [], runId: '${RUN_ID}' } } })`,
  );
  await dropFile(page, '2026-09-01.pdf', false);
  await expect(page.getByTestId('drop-highlight')).toHaveText('Drop the route sheet PDF here');
  await page.locator('[data-drop-kind="route-sheets"]').dispatchEvent('dragleave');
  await dropFile(page, '2026-09-01.pdf');
  await expect(status(page)).toHaveText(
    'Read 5 route sheets from 2026-09-01.pdf — all numbers check out.',
  );
  expect(await callsTo(page, 'files:dropped')).toEqual([
    { page: 'route-sheets', kind: 'route-sheets', file: '2026-09-01.pdf' },
  ]);
  expect(await callsTo(page, 'files:import')).toEqual([
    { kind: 'route-sheets', path: 'dropped-1/2026-09-01.pdf' },
  ]);
  expect(await callsTo(page, 'files:pick')).toEqual([]);

  await onCall(
    page,
    'files:dropped',
    `() => ({ ok: false, reason: 'refused', message: "That file doesn't look like a route sheet PDF. It should end in .pdf." })`,
  );
  await page.getByTestId('route-sheets-tab-history').click();
  await dropFile(page, 'Routes_XXX1.xlsx');
  await expect(problem(page)).toContainText(
    "That file doesn't look like a route sheet PDF. It should end in .pdf.",
  );
  await expect(status(page)).toHaveText('The PDF did not come in.');
  expect(await callsTo(page, 'files:import')).toHaveLength(1);
});

// ---------------------------------------------------------------------------------- Sheets

test('Sheets lists every route with a page and shows the email the driver gets', async ({
  page,
}) => {
  await openRouteSheets(page, {
    state: { run: run({ sent: { CX106: { how: 'manual', at: '2026-09-01T14:05:00.000Z' } } }) },
  });
  await page.getByTestId('route-sheets-tab-sheets').click();
  const list = page.getByTestId('route-sheets-list');
  // Ready first, then the ones waiting on you, then not sending. No page, no entry.
  await expect(list.locator('[data-testid^="route-sheets-pick-"]')).toHaveText([
    /^CX101/,
    /^CX106.*✓/,
    /^CX102/,
    /^CX103/,
    /^CX105/,
  ]);
  await expect(page.getByTestId('route-sheets-pick-CX104')).toHaveCount(0);
  // The first ready one is shown.
  await expect(page.getByTestId('route-sheets-pick-CX101')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('route-sheets-subject')).toHaveText(
    'Route Sheet: CX101 · Tue, Sep 1',
  );
  await expect(page.getByTestId('route-sheets-recipients')).toContainText(CARMEN.name);
  await expect(page.getByTestId('route-sheets-recipients')).toContainText(mail(1));
  const frame = page.getByTestId('route-sheets-preview');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('[data-testid="route-sheets-preview"]').locator('h1')).toHaveText(
    'Route Sheet',
  );
  await expect(
    page.frameLocator('[data-testid="route-sheets-preview"]').locator('p[data-route]'),
  ).toHaveAttribute('data-route', 'CX101');

  // Arrow keys move down the list.
  await page.getByTestId('route-sheets-pick-CX101').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('route-sheets-pick-CX106')).toBeFocused();
  await expect(page.getByTestId('route-sheets-detail-code')).toContainText('CX106');
  await expect(page.getByTestId('route-sheets-sent-mark')).toHaveText(/^✓ Marked sent Sep 1, /);

  // A route waiting on a choice says so, and the sending buttons wait too.
  await page.getByTestId('route-sheets-pick-CX102').click();
  await expect(page.getByTestId('route-sheets-recipients')).toContainText(
    '2 Transporter IDs are listed on this route',
  );
  await expect(page.getByTestId('route-sheets-send')).toBeDisabled();
  await expect(page.getByTestId('route-sheets-copy')).toBeDisabled();
  await expect(page.getByTestId('route-sheets-save-pdf')).toBeEnabled();
  await page.getByTestId('route-sheets-resolve').click();
  await expect(page.getByTestId('route-sheets-tab-distribute')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await callsTo(page, 'routeSheets:preview')).toContainEqual({ routeCode: 'CX102' });
});

test('every way to send one route sheet calls the app and puts a tick after it', async ({
  page,
}) => {
  await openRouteSheets(page, { tab: 'sheets' });
  const buttons = page.locator('[role="toolbar"][aria-label="Ways to send CX101"] button');
  await expect(buttons).toHaveText([
    'Send email',
    'Copy for email',
    'Open email draft',
    'Copy + open mail app',
    'Save PDF page',
    'View original page',
    'Mark as sent',
  ]);

  await page.getByTestId('route-sheets-copy').click();
  await expect(status(page)).toHaveText(
    'Copied. Paste it into a new email (Ctrl+V). The tables keep their look.',
  );
  expect(await copied(page)).toEqual([
    { types: ['text/html', 'text/plain'], text: 'Route Sheet CX101' },
  ]);

  await page.getByTestId('route-sheets-open-draft').click();
  await expect(status(page)).toContainText('The email draft is open');
  await page.getByTestId('route-sheets-mail-app').click();
  await expect(status(page)).toContainText('Your mail app is opening');
  expect(await copied(page)).toHaveLength(2);

  await page.getByTestId('route-sheets-save-pdf').click();
  await expect(status(page)).toHaveText('Saved CX101 STG.A1 route sheet.pdf.');
  await page.getByTestId('route-sheets-view-original').click();

  await page.getByTestId('route-sheets-mark-sent').click();
  await expect(status(page)).toHaveText('CX101 is marked as sent.');

  expect(await callsTo(page, 'routeSheets:copy-email')).toEqual([
    { routeCode: 'CX101' },
    { routeCode: 'CX101' },
  ]);
  expect(await callsTo(page, 'routeSheets:open-draft')).toEqual([{ routeCode: 'CX101' }]);
  expect(await callsTo(page, 'routeSheets:open-mail-app')).toEqual([{ routeCode: 'CX101' }]);
  expect(await callsTo(page, 'routeSheets:save-pdf-page')).toEqual([{ routeCode: 'CX101' }]);
  expect(await callsTo(page, 'routeSheets:view-original-page')).toEqual([{ routeCode: 'CX101' }]);
  expect(await callsTo(page, 'routeSheets:mark-sent')).toEqual([
    { routeCode: 'CX101', how: 'copied' },
    { routeCode: 'CX101', how: 'draft' },
    { routeCode: 'CX101', how: 'mail-app' },
    { routeCode: 'CX101', how: 'manual' },
  ]);

  // The app now says it went out: the tick shows, and the button undoes it.
  const at = new Date(2026, 8, 1, 9, 5).toISOString();
  await change(page, { state: { run: run({ sent: { CX101: { how: 'copied', at } } }) } });
  await expect(page.getByTestId('route-sheets-sent-mark')).toHaveText('✓ Copied Sep 1, 9:05 AM');
  await expect(page.getByTestId('route-sheets-mark-sent')).toHaveText('Undo');
  await page.getByTestId('route-sheets-mark-sent').click();
  expect((await callsTo(page, 'routeSheets:mark-sent')).at(-1)).toEqual({
    routeCode: 'CX101',
    how: null,
  });
  await page.getByTestId('route-sheets-tab-distribute').click();
  await expect(page.getByTestId('route-sheets-sent-CX101')).toHaveText('✓ Copied Sep 1, 9:05 AM');
});

test('Send email sends it, and asks first when it was already sent', async ({ page }) => {
  await openRouteSheets(page, { tab: 'sheets' });
  await onCall(
    page,
    'routeSheets:send-one',
    `(input) => { window.__rsBump(); return { ok: true, value: { sent: [input.routeCode], failed: [], skipped: [] } }; }`,
  );
  await page.getByTestId('route-sheets-send').click();
  await expect(status(page)).toHaveText(`Emailed CX101 to ${mail(1)}.`);
  await expect(dialog(page, 'confirm')).toHaveCount(0);

  await change(page, {
    state: {
      run: run({
        sent: { CX101: { how: 'emailed', at: '2026-09-01T14:05:00.000Z', to: [mail(1)] } },
      }),
    },
  });
  await expect(page.getByTestId('route-sheets-sent-mark')).toContainText('✓ Emailed');
  await page.getByTestId('route-sheets-send').click();
  await expect(dialog(page, 'confirm')).toContainText('Send it again?');
  await dialog(page, 'confirm').getByRole('button', { name: 'No' }).click();
  expect(await callsTo(page, 'routeSheets:send-one')).toHaveLength(1);
  await page.getByTestId('route-sheets-send').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, send it again' }).click();
  await expect.poll(() => callsTo(page, 'routeSheets:send-one')).toHaveLength(2);

  // A refusal comes back in the app's own words.
  await onCall(
    page,
    'routeSheets:send-one',
    `() => ({ ok: false, reason: 'refused', message: 'CX101 was not sent. The email server refused this address.' })`,
  );
  await page.getByTestId('route-sheets-send').click();
  await dialog(page, 'confirm').getByRole('button', { name: 'Yes, send it again' }).click();
  await expect(problem(page)).toContainText(
    'CX101 was not sent. The email server refused this address.',
  );
});

test('without an email setup, Send and Email all wait and say why', async ({ page }) => {
  const why = 'Add the from address and the app password in Settings first.';
  await openRouteSheets(page, { tab: 'sheets', state: { emailProblem: why } });
  await expect(page.getByTestId('route-sheets-send')).toBeDisabled();
  await expect(page.getByTestId('route-sheets-send')).toHaveAttribute('title', why);
  await expect(page.getByTestId('route-sheets-email-all')).toBeDisabled();
  await expect(page.getByTestId('route-sheets-email-all')).toHaveAttribute('title', why);
  // The other ways still work.
  await expect(page.getByTestId('route-sheets-copy')).toBeEnabled();
});

test('Email all asks first, then gives the tally in plain words', async ({ page }) => {
  await openRouteSheets(page, { tab: 'sheets' });
  await onCall(
    page,
    'routeSheets:email-all',
    `() => { window.__rsBump(); return { ok: true, value: {
      sent: ['CX101'],
      failed: [{ routeCode: 'CX106', error: 'The email server refused this address.' }],
      skipped: [{ routeCode: 'CX107', reason: 'No email address on file' }] } }; }`,
  );
  const button = page.getByTestId('route-sheets-email-all');
  await expect(button).toHaveText('Email all (2)');
  await button.click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Email 2 route sheets to their drivers?');
  await ask.getByRole('button', { name: 'No' }).click();
  expect(await callsTo(page, 'routeSheets:email-all')).toEqual([]);

  await button.click();
  await ask.getByRole('button', { name: 'Yes, send them' }).click();
  const tally = dialog(page, 'message');
  await expect(tally).toContainText(
    'Sent 1. Could not send 1: CX106: The email server refused this address. Left out 1: CX107: No email address on file.',
  );
  await tally.getByRole('button', { name: 'OK' }).click();
  expect(await callsTo(page, 'routeSheets:email-all')).toHaveLength(1);

  // Nothing left to send: the button waits.
  await change(page, { state: { unsent: 0 } });
  await expect(page.getByTestId('route-sheets-email-all')).toBeDisabled();
});

test('Export all says where it wrote, and nothing when the folder window was closed', async ({
  page,
}) => {
  await openRouteSheets(page, { tab: 'sheets' });
  await onCall(page, 'routeSheets:export-all', `() => ({ ok: true, value: null })`);
  await page.getByTestId('route-sheets-export-all').click();
  await expect.poll(() => callsTo(page, 'routeSheets:export-all')).toHaveLength(1);
  await expect(status(page)).toHaveText('Ready.');
  await onCall(
    page,
    'routeSheets:export-all',
    `() => ({ ok: true, value: { folder: 'Route sheets XXX1 Tue Sep 1 2026', drafts: 2 } })`,
  );
  await page.getByTestId('route-sheets-export-all').click();
  await expect(status(page)).toHaveText(
    'Wrote 2 email drafts and the PDFs into Route sheets XXX1 Tue Sep 1 2026.',
  );
});

test('Settings on the Sheets tab changes the emails’ wording, and the preview follows it', async ({
  page,
}) => {
  await openRouteSheets(page, { tab: 'sheets' });
  await expect(page.getByTestId('route-sheets-subject')).toHaveText(
    'Route Sheet: CX101 · Tue, Sep 1',
  );
  const asked = (await callsTo(page, 'routeSheets:preview')).length;
  // At the right end of the button strip.
  const strip = page.getByRole('toolbar', { name: 'Send every route sheet' });
  await expect(strip.locator('button')).toHaveText(['Email all (2)', 'Export all (2)', 'Settings']);
  await page.getByTestId('route-sheets-settings').click();
  const window = dialog(page, 'route-sheets-email-wording');
  await expect(window.getByRole('heading')).toHaveText('Email wording');
  await expect(window).toContainText(
    'What each driver gets with their route sheet. One wording for every route. The address and server come from Settings.',
  );
  await expect(window).toContainText('Placeholders: {name} {route} {date} {staging} {wave} {pad}');
  const subject = page.getByTestId('route-sheets-email-subject');
  const body = page.getByTestId('route-sheets-email-body');
  await expect(subject).toHaveValue(DEFAULT_ROUTE_SHEETS_EMAIL.subjectTemplate);
  await expect(body).toHaveValue(DEFAULT_ROUTE_SHEETS_EMAIL.bodyTemplate);
  await expect(page.getByTestId('route-sheets-email-save')).toBeDisabled();

  await subject.fill('Sheet {route}');
  await page.getByTestId('route-sheets-email-undo').click();
  await expect(subject).toHaveValue(DEFAULT_ROUTE_SHEETS_EMAIL.subjectTemplate);

  await subject.fill('Sheet {route} for {name}');
  await body.fill('Hi {name}, {route} is at {staging}.');
  await page.getByTestId('route-sheets-email-save').click();
  await expect(page.getByTestId('route-sheets-email-note')).toHaveText('Email wording saved.');
  expect(await callsTo(page, 'settings:set')).toContainEqual({
    routeSheetsEmail: {
      subjectTemplate: 'Sheet {route} for {name}',
      bodyTemplate: 'Hi {name}, {route} is at {staging}.',
    },
  });
  // The preview is asked for again, so it shows the new wording.
  await expect
    .poll(async () => (await callsTo(page, 'routeSheets:preview')).length)
    .toBeGreaterThan(asked);
  await window.getByRole('button', { name: 'Close' }).click();
  await expect(window).toHaveCount(0);
  // Opened again, it starts from what was saved.
  await page.getByTestId('route-sheets-settings').click();
  await expect(subject).toHaveValue('Sheet {route} for {name}');
  await page.keyboard.press('Escape');
  await expect(window).toHaveCount(0);
});

test('a run whose PDF is gone says so, and the buttons that cut a page wait', async ({ page }) => {
  await openRouteSheets(page, { tab: 'sheets', state: { run: run({ pdfMissing: true }) } });
  await expect(page.getByTestId('route-sheets-pdf-missing')).toContainText(
    "The route sheet PDF for this day is no longer in the app's data folder. You can still see the emails, but you can't save or attach single pages.",
  );
  for (const id of ['save-pdf', 'view-original', 'open-draft']) {
    const button = page.getByTestId(`route-sheets-${id}`);
    await expect(button, id).toBeDisabled();
    await expect(button, id).toHaveAttribute('title', /no longer in the app's data folder/);
  }
  // Sending and Export all carry on without the PDF page, as the old app did, and say so.
  for (const id of ['send', 'export-all']) {
    const button = page.getByTestId(`route-sheets-${id}`);
    await expect(button, id).toBeEnabled();
    await expect(button, id).toHaveAttribute('title', /no longer in the app's data folder/);
  }
  // Copying and marking as sent still work, and the email still shows.
  await expect(page.getByTestId('route-sheets-copy')).toBeEnabled();
  await expect(page.getByTestId('route-sheets-mark-sent')).toBeEnabled();
  await expect(page.getByTestId('route-sheets-preview')).toBeVisible();
});

// --------------------------------------------------------------------------------- History

test('History lists the saved runs: Open, Delete (asking first) and New run', async ({ page }) => {
  await openRouteSheets(page, { tab: 'history' });
  const grid = page.getByRole('grid', { name: 'Saved runs' });
  await expect(grid.locator('[role="rowgroup"] [role="row"]')).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2, name: 'Saved runs' })).toBeVisible();
  await expect(grid.locator('[role="columnheader"][data-col-id="day"]')).toContainText('Run');
  await expect(grid.locator(`[data-row-id="${RUN_ID}"] [data-col-id="day"]`)).toContainText('Open');
  await expect(page.getByTestId(`route-sheets-run-pdf-missing-${OLDER_RUN}`)).toHaveText(
    'PDF missing',
  );
  await expect(page.getByTestId('route-sheets-history-note')).toContainText(
    'Runs older than 30 days are cleared when the app opens.',
  );
  // No output folder any more.
  await expect(page.getByText(/output folder/i)).toHaveCount(0);
  await expect(page.getByTestId(`route-sheets-open-run-${RUN_ID}`)).toBeDisabled();

  await page.getByTestId(`route-sheets-open-run-${OLDER_RUN}`).click();
  await expect(status(page)).toHaveText('Opened XXX1 · Mon, Aug 31, 2026 · CYCLE_1.');
  await expect(page.getByTestId('route-sheets-tab-distribute')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await callsTo(page, 'routeSheets:load-run')).toEqual([{ id: OLDER_RUN }]);

  await page.getByTestId('route-sheets-tab-history').click();
  await page.getByTestId(`route-sheets-delete-run-${OLDER_RUN}`).click();
  const ask = dialog(page, 'confirm');
  await expect(ask).toContainText('Delete this run?');
  await expect(ask).toContainText('Its choices and sent marks go with it.');
  // A red question starts on the way out.
  await expect(ask.getByRole('button', { name: 'No, keep it' })).toBeFocused();
  await ask.getByRole('button', { name: 'No, keep it' }).click();
  expect(await callsTo(page, 'routeSheets:delete-run')).toEqual([]);
  await page.getByTestId(`route-sheets-delete-run-${OLDER_RUN}`).click();
  await ask.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(status(page)).toHaveText('Deleted XXX1 · Mon, Aug 31, 2026 · CYCLE_1.');
  expect(await callsTo(page, 'routeSheets:delete-run')).toEqual([{ id: OLDER_RUN }]);

  await page.getByTestId('route-sheets-new-run').click();
  await expect(status(page)).toHaveText(
    'Started a new run. Bring in the route sheet PDF to fill it.',
  );
  expect(await callsTo(page, 'routeSheets:new-run')).toHaveLength(1);
});

// ------------------------------------------------------------------------------------ keys

test('every part of Distribute is reached with Tab, and works with Enter', async ({ page }) => {
  await openRouteSheets(page);
  await page.getByTestId('route-sheets-tab-distribute').focus();
  const firsts = [
    'route-sheets-pad-02-30-PM',
    'route-sheets-ready-open-CX101',
    'route-sheets-accept-suggestions',
    'route-sheets-assign-select-CX103',
  ];
  for (const id of firsts) {
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(
        (want) => document.activeElement?.getAttribute('data-testid') === want,
        id,
      );
    }
    expect(reached, `Tab never reached ${id}`).toBe(true);
  }
  // Enter on a route code opens its sheet.
  await page.getByTestId('route-sheets-ready-open-CX101').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('route-sheets-detail-code')).toContainText('CX101');
  // The tabs move with the arrow keys.
  await page.getByTestId('route-sheets-tab-sheets').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('route-sheets-tab-history')).toBeFocused();
  await expect(page.getByTestId('route-sheets-tab-history')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a change announced from outside is read again', async ({ page }) => {
  await openRouteSheets(page);
  await expect(page.getByTestId('route-sheets-count-ready')).toHaveText('2 ready to send');
  // The data changed in the app (another window, say): the page reads the run again.
  await page.evaluate(() => {
    const w = window as unknown as {
      __rs: { dist: { counts: Record<string, number> } };
      __fake: { snapshot: { revision: number } };
    };
    w.__rs.dist.counts.ready = 3;
    w.__fake.snapshot.revision = 7;
  });
  await emit(page, 'state:changed', { revision: 7 });
  await expect(page.getByTestId('route-sheets-count-ready')).toHaveText('3 ready to send');
});

// ------------------------------------------------------------ after the phase 3 review

test('with route data loaded but no PDF yet, Distribute says how to start, not that everything is missing', async ({
  page,
}) => {
  const missing = routes()
    .filter((r) => r.routeCode !== 'CX103')
    .map((r) => ({
      ...r,
      hasSheet: false,
      sheet: null,
      kind: 'no-sheet',
      state: 'no-sheet',
      headline: 'No page for this route in the route sheet PDF',
    }));
  await openRouteSheets(page, {
    state: {
      run: run({
        id: 'draft',
        label: 'New run (no route sheet PDF yet)',
        saved: false,
        pdfFileName: null,
        sheetCount: 0,
        checkFailures: [],
        warnings: [],
      }),
    },
    dist: { routes: missing, typedPadWaves: [], waves: [] },
  });
  await expect(page.getByTestId('route-sheets-route-data-words')).toHaveText(
    'Matching with the Routes export: Routes_XXX1_2026-09-01.xlsx.',
  );
  await expect(page.getByTestId('route-sheets-start')).toContainText('Start a run');
  await expect(page.locator('[data-testid^="route-sheets-section-"]')).toHaveCount(0);
  await expect(page.getByTestId('route-sheets-count-no-sheet')).toHaveCount(0);
});

test('Distribute says how many waves still have no pad from Route Data', async ({ page }) => {
  await openRouteSheets(page, {
    dist: {
      typedPadWaves: [],
      waves: [
        { waveTime: '10:20 AM', routes: 4, pad: null },
        { waveTime: '02:30 PM', routes: 1, pad: null },
        { waveTime: '03:00 PM', routes: 1, pad: '3' },
      ],
    },
  });
  await expect(page.getByTestId('route-sheets-pads-missing')).toHaveText(
    '2 waves have no pad yet. Set them with Assign PADs on the Route Data page.',
  );
  await change(page, {
    dist: {
      waves: [{ waveTime: '10:20 AM', routes: 4, pad: '1' }],
    },
  });
  await expect(page.getByTestId('route-sheets-pads-missing')).toHaveCount(0);
});

test('No exact match: View original PDF page opens the page', async ({ page }) => {
  await openRouteSheets(page);
  await page.getByTestId('route-sheets-view-original-CX103').click();
  await expect
    .poll(() => callsTo(page, 'routeSheets:view-original-page'))
    .toEqual([{ routeCode: 'CX103' }]);
});

test('the Sheets search narrows the list by route, staging or driver', async ({ page }) => {
  await openRouteSheets(page, { tab: 'sheets' });
  const picks = page.locator('[data-testid^="route-sheets-pick-"]');
  const search = page.getByTestId('route-sheets-search');
  await expect(search).toHaveAttribute('placeholder', 'Search route, staging, or driver');
  await expect(picks).toHaveCount(5);
  await search.fill('cx103');
  await expect(picks).toHaveCount(1);
  await expect(picks.first()).toHaveAttribute('data-route', 'CX103');
  await search.fill('stg.d4');
  await expect(picks).toHaveText([/^CX106/]);
  await search.fill(COLTON.name.split(' ')[1]!);
  await expect(picks).toHaveText([/^CX102/]);
  await search.fill('nobody at all');
  await expect(picks).toHaveCount(0);
  await expect(page.getByText('No route matches that search.')).toBeVisible();
  await search.fill('');
  await expect(picks).toHaveCount(5);
});

test('the Sheets tab shows the route sheet and the Transporter ID match under the email', async ({
  page,
}) => {
  await openRouteSheets(page, { tab: 'sheets' });
  const sheetPanel = page.getByTestId('route-sheets-panel-sheet');
  await expect(sheetPanel.getByRole('heading')).toHaveText('Route sheet');
  for (const words of [
    'RouteCX101',
    'StagingSTG.A1',
    'Wave10:20 AM',
    'Pad #1',
    'DateTue, Sep 1, 2026',
    'Service typeStandard Parcel',
    'Bags20',
    'Overflow packages10',
    'Total packages210',
    'PDF page1',
  ]) {
    await expect(sheetPanel).toContainText(words);
  }
  await expect(page.getByTestId('route-sheets-verified')).toHaveText(
    '✓ Verified: 20 bags, 10 overflow packages, 210 total all add up',
  );
  const match = page.getByTestId('route-sheets-panel-match');
  await expect(match.getByRole('heading')).toHaveText('Transporter ID match');
  await expect(match).toContainText(CARMEN.name);
  await expect(match).toContainText('ACTIVE');
  await expect(page.getByTestId('route-sheets-exact-match')).toHaveText(
    '✓ Exact match, nothing to review',
  );

  // A page that failed its check lists the problems and the notes, and the match its issues.
  await change(page, {
    dist: {
      routes: (
        await page.evaluate(
          () => (window as unknown as { __rs: { dist: { routes: unknown[] } } }).__rs.dist.routes,
        )
      ).map((r) =>
        (r as { routeCode: string }).routeCode === 'CX103'
          ? {
              ...(r as object),
              sheet: sheet('STG.C3', '02:30 PM', null, {
                checkOk: false,
                checkProblems: ['18 bag rows but the heading says 20 bags'],
                notes: ['Bag 4 has no Sort Zone on the route sheet'],
              }),
            }
          : r,
      ),
    },
  });
  await page.getByTestId('route-sheets-pick-CX103').click();
  await expect(page.getByTestId('route-sheets-check-problems')).toHaveText(
    '18 bag rows but the heading says 20 bags',
  );
  await expect(page.getByTestId('route-sheets-sheet-notes')).toHaveText(
    'Bag 4 has no Sort Zone on the route sheet',
  );
  await expect(page.getByTestId('route-sheets-panel-match')).toContainText(
    'Not on the routes file',
  );
  await expect(page.getByTestId('route-sheets-match-issues')).toContainText(
    'CX103 has a route sheet page but is not on the routes file',
  );
});

test('a ready route with no email address is tagged No email in the Sheets list', async ({
  page,
}) => {
  const list = routes().map((r) =>
    r.routeCode === 'CX101' ? { ...r, recipients: [person(CARMEN, '')] } : r,
  );
  await openRouteSheets(page, { tab: 'sheets', dist: { routes: list } });
  await expect(page.getByTestId('route-sheets-no-email-CX101')).toHaveText('No email');
  await expect(page.getByTestId('route-sheets-no-email-CX106')).toHaveCount(0);
});
