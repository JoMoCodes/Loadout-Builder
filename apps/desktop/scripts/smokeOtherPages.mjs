// Smoke checks for the Route Data, Vehicle Data and Associates pages, run inside smoke.mjs while
// demo mode is on. Demo mode starts from the made-up saved data the old app's parity harness
// started from, so bringing in the same made-up files through the pages must land on the numbers
// the harness wrote down (scripts/parity/expected/<day>/inputs.json, routes.json and dwp.json).
//
// Each check drives the real page in the real app: the file window is answered with a fixture
// file, the pages' own buttons and windows are used, and the numbers read are the ones the page
// shows. Only counts and reason codes are ever printed.

/* global window -- this runs inside the app's page */

import { readFileSync } from 'node:fs';
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

  /** Brings a route export in through its tab and assigns PADs in the cycle. Returns the sharing. */
  async function importRoute(kind, parts) {
    await page.click(`[data-testid="route-data-tab-${kind}"]`);
    await choose(parts);
    await page.click(`[data-testid="import-${kind}"]`);
    await skipSharedRoutes();
    await assignCycle();
    const label = { routes: 'Routes', itineraries: 'Itineraries', schedule: 'Weekly Schedule' }[
      kind
    ];
    await until(
      async () => (await text(status('route-data'))).startsWith(`${label}: `),
      `${kind}: the PAD window did not finish`,
      20_000,
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
        (await ask1.innerText()).includes('Replace the associate list?'),
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
      const withCount = snap.associates.filter((view) => view.associate.tenure !== null).length;
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

  // ------------------------------------------------------------------- Route Data
  for (const day of DAYS) {
    await check(
      `Route Data on ${day.day}: every export comes in on the harness’s counts`,
      async () => {
        const inputs = expected(day.day, 'inputs.json');
        await startDay(day);
        // Leave and come back, so the page starts with a fresh status line.
        await goTo(page, 'home');
        await goTo(page, 'route-data');

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
        await page.click('[data-testid="route-data-tab-itineraries"]');
        await page.click('[data-testid="pads-from-schedule"]');
        if (routes.skipped) {
          await until(
            async () =>
              (await text(status('route-data'))) ===
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
          async () => (await text(status('route-data'))) === `${bits.join('. ')}.`,
          `the page said "${await text(status('route-data'))}"`,
        );
        return `${copied} copied, ${noPad} without a PAD, ${missing} not on it`;
      },
    );

    await check(
      `Route Data on ${day.day}: the DWP sheet comes in and reports its day as the harness did`,
      async () => {
        const inputs = expected(day.day, 'inputs.json');
        const harness = expected(day.day, 'dwp.json').after_route_bring_over.before;
        await page.click('[data-testid="route-data-tab-dwp"]');
        await choose(day.dwp);
        await page.click('[data-testid="import-dwp"]');
        await until(
          async () => /^Imported \d+ routes from /.test(await text(status('route-data'))),
          'the DWP sheet did not come in',
        );
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
    await goTo(page, 'route-data');
    await page.click('[data-testid="route-data-tab-routes"]');
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
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));
}
