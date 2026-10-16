// Smoke checks for the Route Data, Vehicle Data, Associates and Route Sheets pages, run inside
// smoke.mjs while demo mode is on. Demo mode starts from the made-up saved data the old app's parity harness
// started from, so bringing in the same made-up files through the pages must land on the numbers
// the harness wrote down (scripts/parity/expected/<day>/inputs.json, routes.json and dwp.json).
//
// Each check drives the real page in the real app: the file window is answered with a fixture
// file, the pages' own buttons and windows are used, and the numbers read are the ones the page
// shows. Only counts and reason codes are ever printed.

/* global window -- this runs inside the app's page */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DAYS = [
  {
    day: '2026-09-01',
    loadout: ['loadout-sheets', '2026_09_02_15_27_loadout_sheet.xlsx'],
    routes: ['routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx'],
    itineraries: ['itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx'],
    schedule: ['schedules', 'Week-36-Schedule.xlsx'],
    dwp: ['dwp', 'XXXX DWP 9.2.xlsx'],
  },
  {
    day: '2026-09-11',
    loadout: ['loadout-sheets', '2026_09_11_17_37_loadout_sheet.xlsx'],
    routes: ['routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx'],
    itineraries: ['itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx'],
    schedule: null,
    dwp: ['dwp', 'DWP_DSP-XXXX_09-11-2026.xlsx'],
  },
  {
    day: '2026-09-14',
    loadout: ['loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx'],
    routes: ['routes', 'Routes_XXX1_2026-09-25_09_54 (CDT).xlsx'],
    itineraries: ['itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx'],
    schedule: ['schedules', 'Week-38-Schedule.xlsx'],
    dwp: ['dwp', 'DWP_DSP-XXXX_09-11-2026.xlsx'],
  },
];

const KINDS = ['routes', 'itineraries', 'schedule'];
const DAY_WORDS = { ok: "Matches the roster's day", mismatch: 'Wrong day', unknown: "Can't tell" };

export async function otherPagesChecks({ app, page, check, assert, until, ask, goTo, root }) {
  const repo = resolve(root, '..', '..');
  const fixtures = join(repo, 'packages', 'fixtures');
  const expected = (day, file) =>
    JSON.parse(readFileSync(join(repo, 'scripts', 'parity', 'expected', day, file), 'utf8'));
  const fixturePath = (parts) => join(fixtures, ...parts);

  /** Answers the file window with this file, as if the person chose it. */
  const choose = (parts) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, fixturePath(parts));

  // The page collapses runs of spaces when it draws ("rows  -  times" reads "rows - times"), so
  // both sides are compared with single spaces.
  const norm = (value) => value.replace(/\s+/g, ' ').trim();
  const text = async (selector) => norm(await page.locator(selector).innerText());
  const status = (id) => `[data-testid="${id}-status"]`;
  const snapshot = async () => {
    const reply = await ask('state:snapshot');
    assert(reply.ok, `snapshot failed: ${reply.reason}`);
    return reply.value;
  };

  /** A route export's PADs as plain pairs (a Map does not cross out of the page). */
  const padsOf = (kind) =>
    page.evaluate(
      (name) =>
        window.loadout.calls['state:snapshot']().then((reply) =>
          [...reply.value.routeSets.find((set) => set.kind === name).pads].map(([time, pad]) => [
            time,
            pad,
          ]),
        ),
      kind,
    );

  /** Loads a file into the day's data through the bridge (for the files these pages do not own). */
  async function load(kind, parts) {
    await choose(parts);
    const picked = await ask('files:pick', { kind });
    assert(picked.ok && picked.value.path, `${kind}: the file window gave nothing`);
    const done = await ask('files:import', { kind, path: picked.value.path });
    assert(done.ok, `${kind}: ${done.reason}`);
    return done.value.rows;
  }

  /** Puts dispatch times into PADs 1, 2, 3, 1, 2, 3... in clock order, as the harness does. */
  async function assignCycle() {
    const windowSel = 'dialog[data-dialog="assign-pads"]';
    await page.waitForSelector(windowSel, { state: 'visible', timeout: 10_000 });
    const times = await page.$$eval(`${windowSel} fieldset[data-time]`, (sets) =>
      sets.map((set) => set.getAttribute('data-time')),
    );
    let index = 0;
    for (const time of times) {
      if (time === '') continue;
      const radios = page.locator(`${windowSel} fieldset[data-time="${time}"] input[type="radio"]`);
      await radios.nth(index % 3).check();
      index += 1;
    }
    // A blank time stays on "None": the window asks before leaving it, and the answer is yes.
    await page.click(`${windowSel} [data-action="confirm"]`);
    const ask2 = page.locator('dialog[data-dialog="confirm"]');
    if (await ask2.isVisible().catch(() => false))
      await ask2.getByRole('button', { name: 'Yes' }).click();
  }

  /** Cancels the shared-route window if it opens, then waits for the PAD window. */
  async function skipSharedRoutes() {
    const shared = page.locator('dialog[data-dialog="shared-routes"]');
    const pads = page.locator('dialog[data-dialog="assign-pads"]');
    await until(
      async () => (await shared.isVisible()) || (await pads.isVisible()),
      'neither the shared route window nor the PAD window opened',
      20_000,
    );
    if (await shared.isVisible()) await shared.getByRole('button', { name: 'Cancel' }).click();
  }

  /** Answers the notes Import Route Data may show (who route data added), until `done` is true. */
  async function closeNotesUntil(done, message) {
    await until(
      async () => {
        if (await done()) return true;
        const ok = page.locator('[data-testid="inform-ok"]');
        if (await ok.isVisible().catch(() => false)) await ok.click();
        return false;
      },
      message,
      20_000,
    );
  }

  /**
   * Brings a route export in with Import Route Data on the Roster and assigns PADs in the cycle,
   * then says Not today to the DWP question. Ends back on the Roster.
   */
  async function importRoute(kind, parts) {
    await page.click('[data-tab-button="roster"]');
    await page.click('[data-action="import-route-data"]');
    if (kind !== 'routes') await page.click('[data-testid="other-route-files"]');
    await choose(parts);
    await page.click(`[data-testid="choose-${kind}"]`);
    await skipSharedRoutes();
    await assignCycle();
    const dwpWindow = page.locator('dialog[data-dialog="import-dwp"]');
    await closeNotesUntil(() => dwpWindow.isVisible(), `${kind}: the DWP question never came`);
    await page.click('[data-testid="dwp-not-today"]');
    await until(
      async () => (await page.locator('dialog[open]').count()) === 0,
      `${kind}: a window stayed open`,
    );
  }

  async function startDay(day) {
    // A clean slate for the day's route data, then the roster the day is read for.
    for (const kind of KINDS) await ask('routeData:clear', { kind });
    await ask('dwp:clear');
    await load('loadout', day.loadout);
  }

  // ---------------------------------------------------------------- Vehicle Data
  await check(
    'Vehicle Data: the fleet comes in and the page shows the harness’s counts',
    async () => {
      const inputs = expected('2026-09-11', 'inputs.json');
      await goTo(page, 'vehicle-data');
      await choose(['vehicles', 'VehiclesData.xlsx']);
      await page.click('[data-testid="import-vehicles"]');
      await until(
        async () => /^Imported \d+ vehicles from /.test(await text(status('vehicle-data'))),
        'the fleet did not come in',
      );
      const metric = await text('[data-testid="fleet-metric"]');
      assert(
        metric.startsWith(
          `${inputs.vehicles.count} vehicles - ${inputs.vehicles.operational} operational`,
        ),
        `the header said "${metric}"`,
      );
      const rows = await page
        .locator('[data-page="vehicle-data"] [role="rowgroup"] [role="row"]')
        .count();
      assert(rows > 5, 'the fleet table drew no rows');
      const snap = await snapshot();
      assert(snap.counts.vehicles === inputs.vehicles.count, 'the snapshot has another fleet size');
      return `${inputs.vehicles.count} vans, ${inputs.vehicles.operational} operational`;
    },
  );

  await check(
    'Vehicle Data: grounding and returning a van, and a priority, change the data',
    async () => {
      const before = await snapshot();
      const target = before.vehicles.find((view) => view.operational && !view.overridden);
      assert(target, 'no van to ground');
      const name = target.vehicle.name;
      await page
        .locator(`[data-page="vehicle-data"] [role="row"][data-row-id="${target.vehicle.vin}"]`)
        .locator('[data-col-id="name"]')
        .click();
      await page.click('[data-testid="ground-return"]');
      await until(
        async () => (await text(status('vehicle-data'))) === `${name} grounded.`,
        'the status did not say the van was grounded',
      );
      let now = await snapshot();
      assert(
        now.counts.overriddenVehicles === before.counts.overriddenVehicles + 1,
        'the van did not count as set here',
      );
      await page.click('[data-testid="ground-return"]');
      await until(
        async () => (await text(status('vehicle-data'))) === `${name} back in service.`,
        'the van did not go back',
      );
      now = await snapshot();
      assert(
        now.counts.overriddenVehicles === before.counts.overriddenVehicles,
        'going back to the export left a stored change',
      );
      // The window for a priority refuses words and takes a number.
      await page.click('[data-testid="set-priority"]');
      const prompt = page.locator('dialog[data-dialog="prompt"]');
      await prompt.getByTestId('prompt-answer').fill('abc');
      await prompt.getByRole('button', { name: 'OK' }).click();
      assert((await prompt.getByTestId('prompt-problem').count()) === 1, 'a word was accepted');
      await prompt.getByTestId('prompt-answer').fill('77');
      await prompt.getByRole('button', { name: 'OK' }).click();
      await until(
        async () => (await text(status('vehicle-data'))) === `${name} set to priority 77.`,
        'the priority was not set',
      );
      now = await snapshot();
      assert(
        now.vehicles.find((view) => view.vehicle.vin === target.vehicle.vin).priority === '77',
        'the snapshot has no priority',
      );
      // Put it back as it was.
      await page.click('[data-testid="set-priority"]');
      await prompt.getByTestId('prompt-answer').fill('');
      await prompt.getByRole('button', { name: 'OK' }).click();
      await until(
        async () => /^Priority removed from /.test(await text(status('vehicle-data'))),
        'the priority was not removed',
      );
    },
  );

  await check(
    'Vehicle Data: Van Affinity holds the harness’s assignments and keeps them through Clear Vehicles',
    async () => {
      const inputs = expected('2026-09-11', 'inputs.json');
      await page.click('[data-testid="vehicle-data-tab-affinity"]');
      await until(
        async () =>
          (await text('[data-testid="affinity-metric"]')) ===
          `${inputs.affinity_slots_held} assignments`,
        'the affinity header did not show the harness’s count',
      );
      const before = await snapshot();
      assert(
        before.counts.affinitySlots === inputs.affinity_slots_held,
        'the snapshot count differs',
      );

      // Clear Vehicles empties the fleet but keeps affinity, statuses set here and LMR approvals.
      await page.click('[data-testid="vehicle-data-tab-management"]');
      await page.click('[data-testid="clear-vehicles"]');
      await page
        .locator('dialog[data-dialog="confirm"]')
        .getByRole('button', { name: 'Yes, clear' })
        .click();
      await until(
        async () => (await snapshot()).counts.vehicles === 0,
        'the fleet was not cleared',
      );
      const cleared = await snapshot();
      assert(
        cleared.counts.affinitySlots === inputs.affinity_slots_held,
        'affinity went with the fleet',
      );
      assert(
        cleared.lmrApproved.length === inputs.lmr_approved,
        'LMR approvals went with the fleet',
      );
      // Bringing the fleet back puts the same numbers on the page.
      await choose(['vehicles', 'VehiclesData.xlsx']);
      await page.click('[data-testid="import-vehicles"]');
      await until(
        async () => (await snapshot()).counts.vehicles === inputs.vehicles.count,
        'no fleet',
      );
      const back = await snapshot();
      assert(back.counts.affinitySlots === inputs.affinity_slots_held, 'affinity changed');
      assert(
        back.vehicles.filter((view) => view.operational).length === inputs.vehicles.operational,
        'the operational count differs from the harness',
      );
    },
  );

  await check('Vehicle Data: LMR Approved Drivers holds the harness’s approvals', async () => {
    const inputs = expected('2026-09-11', 'inputs.json');
    await page.click('[data-testid="vehicle-data-tab-lmr"]');
    await until(
      async () => (await text('[data-testid="lmr-metric"]')) === `${inputs.lmr_approved} approved`,
      'the approved count differs from the harness',
    );
  });

  // ------------------------------------------------------------------ Associates
  await check(
    'Associates: the list and the Tenured Workforce files come in on the harness’s numbers',
    async () => {
      const inputs = expected('2026-09-11', 'inputs.json');
      await goTo(page, 'associates');
      // With a list already there, the page asks before replacing it.
      await page.click('[data-testid="import-associates"]');
      const ask1 = page.locator('dialog[data-dialog="confirm"]');
      await ask1.waitFor({ state: 'visible', timeout: 5_000 });
      assert(
        (await ask1.innerText()).includes('Update the associate list?'),
        'no question was asked',
      );
      await choose(['associates', 'AssociateData.csv']);
      await ask1.getByRole('button', { name: 'Yes, choose a file' }).click();
      await until(
        async () => /^Imported \d+ associates from /.test(await text(status('associates'))),
        'the associate list did not come in',
      );
      const metric = await text('[data-testid="associates-metric"]');
      assert(
        metric.startsWith(`${inputs.associates.count} associates`),
        `the header said "${metric}"`,
      );

      for (const name of inputs.tenure.files) {
        await choose(['tenure', name]);
        await page.click('[data-testid="import-tenure"]');
        await until(
          async () => (await text(status('associates'))).includes(`Imported ${name}`),
          `${name} did not come in`,
        );
      }
      const snap = await snapshot();
      assert(
        snap.tenure.records === inputs.tenure.record_count,
        'the kept counts differ from the harness',
      );
      // Current people only: the earlier day's drivers are on the list now, marked offboarded.
      const withCount = snap.associates.filter(
        (view) => view.associate.status !== 'OFFBOARDED' && view.associate.tenure !== null,
      ).length;
      assert(withCount === inputs.associates.with_tenure, `${withCount} associates have a count`);

      // The Lifetime Routes tab says the same.
      await page.click('[data-testid="associates-tab-lifetime-routes"]');
      const headline = await text('[data-testid="tenure-metric"]');
      assert(
        headline.startsWith(`${inputs.tenure.record_count} drivers with a count`),
        `the Lifetime Routes header said "${headline}"`,
      );
      const covered = await text('[data-testid="tenure-detail-0"]');
      assert(
        covered ===
          `${inputs.associates.with_tenure}/${inputs.associates.count} associates covered`,
        `covered said "${covered}"`,
      );
      return `${inputs.associates.count} associates, ${inputs.tenure.record_count} counts`;
    },
  );

  await check(
    'Associates: an older Tenured Workforce file does not roll the counts back',
    async () => {
      const files = expected('2026-09-11', 'inputs.json').tenure.files;
      const before = (await snapshot()).tenure;
      await goTo(page, 'associates');
      await page.click('[data-testid="associates-tab-associates"]');
      await choose(['tenure', files[0]]);
      await page.click('[data-testid="import-tenure"]');
      await until(
        async () => (await text(status('associates'))).includes(`Imported ${files[0]}`),
        'the older file did not come in',
      );
      const after = (await snapshot()).tenure;
      assert(
        after.records === before.records && after.weekLabel === before.weekLabel,
        'counts moved',
      );
    },
  );

  // --------------------------------------------- Route Data (Import Route Data on Load Out)
  for (const day of DAYS) {
    await check(
      `Route Data on ${day.day}: every export comes in on the harness’s counts`,
      async () => {
        const inputs = expected(day.day, 'inputs.json');
        await startDay(day);
        // Leave and come back, so the page starts with a fresh status line.
        await goTo(page, 'home');
        await goTo(page, 'load-out');

        const summary = [];
        for (const kind of KINDS) {
          const want = inputs.route_sources[kind];
          if (!day[kind]) {
            assert(want.row_count === 0, `${kind}: the harness expected rows`);
            continue;
          }
          await importRoute(kind, day[kind]);
          const set = (await snapshot()).routeSets.find((one) => one.kind === kind);
          assert(
            set.rows.length === want.row_count,
            `${kind}: ${set.rows.length} rows, not ${want.row_count}`,
          );
          assert(set.day === want.day, `${kind}: read for another day`);
          const times = new Set(set.rows.map((row) => row.dispatchTime)).size;
          // The file has its own tab on Load Out now.
          await page.click(`[data-tab-button="${kind}"]`);
          const metric = await text(`[data-testid="route-${kind}-metric"]`);
          assert(
            metric === `${want.row_count} rows - ${times} dispatch times`,
            `${kind}: the header said "${metric}"`,
          );
          // The PADs chosen in the window are the ones the harness chose.
          const pads = sortKeys(Object.fromEntries(await padsOf(kind)));
          assert(
            JSON.stringify(pads) === JSON.stringify(sortKeys(want.pads)),
            `${kind}: PADs differ`,
          );
          summary.push(`${kind} ${want.row_count}`);
        }
        return `${day.day}: ${summary.join(', ')}`;
      },
    );

    await check(
      `Route Data on ${day.day}: PADs from the schedule give the harness’s counts`,
      async () => {
        const routes = expected(day.day, 'routes.json').scenarios['itineraries/adopted'];
        await page.click('[data-tab-button="itineraries"]');
        await page.click('[data-testid="pads-from-schedule"]');
        if (routes.skipped) {
          await until(
            async () =>
              (await text(status('load-out'))) ===
              'Import a Weekly Schedule export first - its PADs are what come over.',
            'the page did not say the schedule is missing',
          );
          return 'no schedule for this day, and the page said so';
        }
        const [copied, noPad, missing] = routes.adopt_result;
        const total = copied + noPad + missing;
        const bits = [`${copied} of ${total} PADs copied from the Weekly Schedule`];
        if (noPad) bits.push(`${noPad} scheduled but with no PAD there`);
        if (missing) bits.push(`${missing} not on the schedule`);
        await until(
          async () => (await text(status('load-out'))) === `${bits.join('. ')}.`,
          `the page said "${await text(status('load-out'))}"`,
        );
        return `${copied} copied, ${noPad} without a PAD, ${missing} not on it`;
      },
    );

    await check(
      `Route Data on ${day.day}: the DWP sheet comes in and reports its day as the harness did`,
      async () => {
        const inputs = expected(day.day, 'inputs.json');
        const harness = expected(day.day, 'dwp.json').after_route_bring_over.before;
        // Import Route Data, straight to its DWP question. If the app is unsure of the sheet's
        // day it asks before putting it on the roster: No keeps it off, as the old page did.
        await page.click('[data-tab-button="roster"]');
        await page.click('[data-action="import-route-data"]');
        await page.click('[data-testid="skip-to-dwp"]');
        await choose(day.dwp);
        await page.click('[data-testid="choose-dwp"]');
        await until(async () => {
          const no = page.locator('[data-testid="confirm-no"]');
          if (await no.isVisible().catch(() => false)) await no.click();
          const open = await page.locator('dialog[open]').count();
          return open === 0 && (await snapshot()).dwp.set.rows.length > 0;
        }, 'the DWP sheet did not come in');
        await page.click('[data-tab-button="dwp"]');
        const metric = await text('[data-testid="dwp-metric"]');
        assert(metric === `${inputs.dwp.row_count} routes`, `the DWP header said "${metric}"`);
        const snap = await snapshot();
        assert(snap.dwp.set.day === inputs.dwp.day, 'the sheet was read for another day');
        assert(snap.dwp.dayStatus === harness.day_status, `day status ${snap.dwp.dayStatus}`);
        const chip = await text('[data-testid="dwp-day"]');
        assert(
          chip.includes(DAY_WORDS[harness.day_status]),
          `the day note said "${chip.slice(0, 60)}"`,
        );
        return `${inputs.dwp.row_count} routes, day ${harness.day_status}`;
      },
    );
  }

  await check('Route Data: Clear empties one export and asks first', async () => {
    await goTo(page, 'load-out');
    await page.click('[data-tab-button="routes"]');
    const before = (await snapshot()).counts.routeRows;
    assert(before.routes > 0, 'no routes to clear');
    await page.click('[data-testid="clear-routes"]');
    const ask1 = page.locator('dialog[data-dialog="confirm"]');
    await ask1.getByRole('button', { name: 'No, keep it' }).click();
    assert((await snapshot()).counts.routeRows.routes === before.routes, 'No still cleared it');
    await page.click('[data-testid="clear-routes"]');
    await ask1.getByRole('button', { name: 'Yes, clear' }).click();
    await until(
      async () => (await snapshot()).counts.routeRows.routes === 0,
      'Yes did not clear it',
    );
    const after = (await snapshot()).counts.routeRows;
    assert(after.itineraries === before.itineraries, 'another export was touched');
  });

  // ------------------------------------------------------------------ Route Sheets
  // The fixture day's Routes export and driver list, then the synthetic route sheet PDF, all
  // through the real bridge with the file window answered. Clear Route Data first, so the roster
  // names no route file and the route sheets fall back to the Routes export.
  let sheetRun = null;
  await check('Route Sheets: the synthetic PDF comes in through the bridge', async () => {
    const cleared = await ask('loadOut:clear-route-data', { routes: true, dwp: false });
    assert(cleared.ok, 'Clear Route Data did not go through');
    const routeRows = await load('routes', ['routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx']);
    assert(routeRows > 0, 'the Routes export brought in no rows');
    await load('associates', ['associates', 'AssociateData.csv']);
    await choose(['route-sheets', '2026-09-01.pdf']);
    const picked = await ask('files:pick', { kind: 'route-sheets' });
    assert(picked.ok && picked.value.path, 'route sheets: the file window gave nothing');
    const done = await ask('files:import', { kind: 'route-sheets', path: picked.value.path });
    assert(done.ok, `route sheets: ${done.reason}`);
    assert(done.value.rows === 29, `${done.value.rows} route sheets read, not 29`);
    sheetRun = done.value.routeSheets.runId;
    assert(sheetRun, 'no run was opened');
    const state = await ask('routeSheets:state');
    assert(state.ok && state.value.routeData?.kind === 'routes', 'the Routes export is not in use');
    assert(state.value.run.sheetCount === 29, 'the run does not hold the route sheets');
    return `${done.value.rows} route sheets`;
  });

  await check('Route Sheets: Accept all suggestions takes every suggestion', async () => {
    const before = await ask('routeSheets:distribution');
    assert(before.ok, 'the distribution could not be read');
    const suggested = before.value.routes.filter(
      (r) => r.state === 'needs-decision' && r.suggestion,
    ).length;
    assert(suggested > 0, 'no route had a suggestion');
    const accepted = await ask('routeSheets:accept-suggestions');
    assert(accepted.ok && accepted.value === suggested, `accepted ${accepted.value}`);
    const again = await ask('routeSheets:accept-suggestions');
    assert(again.ok && again.value === 0, 'a second Accept all took more');
    return `${suggested} accepted`;
  });

  const temp = mkdtempSync(join(tmpdir(), 'loadout-smoke-route-sheets-'));
  let readyRoute = null;
  try {
    await check('Route Sheets: a ready route sheet previews as the driver’s email', async () => {
      const dist = await ask('routeSheets:distribution');
      readyRoute = dist.value.routes.find((r) => r.state === 'ready' && r.hasSheet)?.routeCode;
      assert(readyRoute, 'no route is ready');
      const preview = await ask('routeSheets:preview', { routeCode: readyRoute });
      assert(preview.ok, 'the preview was refused');
      assert(preview.value.html.includes('Route Sheet'), 'the email does not say Route Sheet');
      assert(preview.value.html.includes(readyRoute), 'the email does not name its route');
      assert(preview.value.recipients.length === 1, 'the email has no driver to go to');
    });

    await check(
      'Route Sheets: Save PDF page writes the page where the save window says',
      async () => {
        const file = join(temp, 'one page.pdf');
        await app.evaluate(({ dialog }, chosen) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath: chosen });
        }, file);
        const saved = await ask('routeSheets:save-pdf-page', { routeCode: readyRoute });
        assert(saved.ok && saved.value.saved === true, `not saved: ${JSON.stringify(saved)}`);
        assert(existsSync(file), 'the PDF is not there');
        assert(readFileSync(file).subarray(0, 5).toString() === '%PDF-', 'the file is not a PDF');
      },
    );

    await check('Route Sheets: Export all writes drafts, PDFs and the summary', async () => {
      await app.evaluate(({ dialog, shell }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
        // The folder is opened afterwards, as the old app did; do not open a file manager here.
        shell.openPath = async () => '';
      }, temp);
      const done = await ask('routeSheets:export-all');
      assert(done.ok && done.value, `Export all: ${JSON.stringify(done).slice(0, 120)}`);
      assert(done.value.drafts > 0, 'no email drafts were written');
      const root = join(temp, done.value.folder);
      for (const name of ['Distribution summary.html', 'Distribution summary.csv']) {
        assert(existsSync(join(root, name)), `${name} is missing`);
      }
      assert(existsSync(join(root, 'Email drafts')), 'no drafts folder');
      assert(existsSync(join(root, 'Route sheet PDFs')), 'no PDFs folder');
      return `${done.value.drafts} drafts`;
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  await check(
    'Route Sheets: the page shows the counts, the sheets and the run in History',
    async () => {
      const dist = (await ask('routeSheets:distribution')).value;
      await goTo(page, 'route-sheets');
      await page.click('[data-testid="route-sheets-tab-distribute"]');
      await until(
        async () =>
          (await text('[data-testid="route-sheets-count-total"]')) ===
          `${dist.counts.total} routes`,
        'the counts do not show the routes',
      );
      const ready = await text('[data-testid="route-sheets-count-ready"]');
      assert(ready === `${dist.counts.ready} ready to send`, `the ready count said "${ready}"`);
      await page.click('[data-testid="route-sheets-tab-sheets"]');
      await page.click(`[data-testid="route-sheets-pick-${readyRoute}"]`);
      await until(
        async () => (await text('[data-testid="route-sheets-subject"]')).includes(readyRoute),
        'the Sheets tab does not show the route’s email',
      );
      // The Windows build machine is several times slower than a desktop, so these waits are long.
      await until(
        async () => (await page.$('[data-testid="route-sheets-preview"]')) !== null,
        'the Sheets tab does not show the email preview',
        30_000,
      );
      await page.click('[data-testid="route-sheets-tab-history"]');
      await until(
        async () =>
          (await page.$(`[data-page="route-sheets"] [role="row"][data-row-id="${sheetRun}"]`)) !==
          null,
        'History does not list the run',
        30_000,
      );
      return `${dist.counts.total} routes, ${dist.counts.ready} ready`;
    },
  );
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));
}
