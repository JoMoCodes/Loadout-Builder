# Page pattern: how a page gets data and does things

For the page agents (4a Load Out, 4b Print and Export, 4c the rest). Read this first. Use the
pattern as it is; if it is missing something, add it to the shared files and say so in your pull
request, so the other two can use it.

## The picture

```
 page (React)                  bridge                 main process
 ------------                  ------                 ------------
 useAppSnapshot()  <-- state:snapshot (query) ------  StateHost -> core AppState -> database
 call('x:do-it')   --- command ----------------------> handler -> AppState method
                   <-- state:changed (event) --------- sent after every command
```

- The day's data lives in **one core `AppState`**, in the main process (`src/main/appState.ts`,
  class `StateHost`). It is built when the app opens and again when demo mode is switched.
- A page **reads** with `useAppSnapshot()` and **acts** with `call(...)`. It never holds its own
  copy of roster, vans or associates, and never imports `@loadout/storage` or
  `@loadout/core/importers` (those are Node-only and live behind the bridge).
- Every message is a **channel**: declared once, with its name, its input check and its result
  type. The main side, the bridge and the page's `call` all come from that one declaration.

## Where things live

| What                                                | Where                                           |
| --------------------------------------------------- | ----------------------------------------------- |
| Channel declarations (one file per area)            | `src/shared/channels/<area>.ts`                 |
| Input checks (`shape`, `text`, `oneOf`, ...)        | `src/shared/channels/check.ts`                  |
| Main-side handlers (one file per area)              | `src/main/handlers/<area>.ts`                   |
| What a snapshot holds                               | `src/shared/snapshot.ts`, built in `src/main/snapshot.ts` |
| Page side: `call`, `listen`, `explain`              | `src/renderer/lib/channels.ts`                  |
| Page side: `useAppSnapshot`                         | `src/renderer/lib/useAppSnapshot.ts`            |
| Table layouts saved with the data                   | `src/renderer/lib/gridLayoutStore.ts`           |
| Stand-in bridge for browser tests                   | `e2e/support/fakeBridge.ts`                     |

Your area files: 4a `loadOut`, 4b `print`, 4c `routeData`, `dwp`, `vehicles`, `associates`. They
start empty (except one example in `loadOut`). Edit only your own; nobody needs to touch
`index.ts`, `preload.ts` or `main.ts`.

## Add a query or a command

A **query** asks and changes nothing. A **command** does something; after every command the main
process sends `state:changed`, so every page that is looking reads the snapshot again.

The worked example is **Clear Previous Roster**. It is already in the code (the Previous Roster
page), so you can open each file.

**1. Declare it** in `src/shared/channels/loadOut.ts`:

```ts
import { nothing } from './check';
import { as, defineCommand } from './define';

export const loadOutChannels = [
  defineCommand('loadOut:clear-previous-roster', { input: nothing, result: as<null>() }),
] as const;
```

The name is `area:what-it-does`, lower case with dashes. `input` is a check (below). `result` is
the type of what comes back, written `as<Type>()`. Add `quiet: true` only for a command that is
not a change to the day's data (moving a column, opening a file window); it then sends no
`state:changed`.

An input with fields:

```ts
import { filled, intBetween, shape } from './check';

defineCommand('loadOut:give-van', {
  input: shape({ rowIndex: intBetween(0, 5000), vin: filled(40) }),
  result: as<null>(),
});
```

The checks are `nothing`, `text(max)`, `filled(max)`, `number`, `integer`, `intBetween(a, b)`,
`boolean`, `oneOf([...])`, `optional(c)`, `nullable(c)`, `arrayOf(c, max)`, `recordOf(c, max)`,
`shape({...})`, `anyObject`. Always bound text and lists. A message that fails its check never
reaches your handler.

**2. Write the handler** in `src/main/handlers/loadOut.ts`. The build fails until every declared
channel has one:

```ts
export const loadOutHandlers: HandlersFor<typeof loadOutChannels> = {
  'loadOut:clear-previous-roster': (_input, ctx) => {
    ctx.state.clearPreviousRoster(); // the core AppState method does the real work
    return null;
  },
};
```

`ctx.state` is the core `AppState` (it refuses with "no data" if the saved data did not open).
`ctx.today()` is today's date. Also on `ctx`: `ctx.host` (revision, layouts) and `ctx.services`
(version, settings, file window). Do the rule in `AppState`, not in the handler: the handler only
calls it. If the core is missing a method, add it there with its own test (and say so in the PR).

To say no in plain words, throw `new ChannelRefusal('refused', 'Words for the person.')`. Any
other error becomes a `failed` reply with no words, and the log gets only the kind of error.

**3. Bridge:** nothing. The bridge is built by looping over the declarations.

**4. Call it from the page:**

```tsx
const { snapshot } = useAppSnapshot();

async function clearIt() {
  const reply = await call('loadOut:clear-previous-roster');
  if (!reply.ok) setProblem(explain(reply)); // success needs nothing: the snapshot follows
}
<Button onClick={() => void clearIt()}>Clear Previous Roster</Button>;
```

`call` never throws. It answers `{ ok: true, value }` or `{ ok: false, reason, message? }`.

**5. Test it** (see "Tests" below): a handler test, a browser test, and a line in the Electron
smoke check if it touches the real data.

## Read the snapshot

```tsx
const { snapshot, loading, error, refresh } = useAppSnapshot();
if (error) return <p role="alert">{error}</p>; // plain words already
if (!snapshot) return <p>Getting the saved data...</p>;
const rows = snapshot.roster.rows; // one object per driver
```

One copy is shared by every page; it is read again when the app says `state:changed`. `refresh()`
reads it by hand (rarely needed). Do not copy rows into `useState`. Derive with `useMemo` from
`snapshot` instead.

What the snapshot holds (`AppSnapshot`):

- `revision`, `today`, `mode` (`real` or `demo`), `loadOutDate`
- `roster.rows[]`: `index`, `row` (the driver row as the core has it), `match` (`method`,
  `ambiguous`, `candidates`), `associateId`, `associateName`, `vanBadges`, `tenure`, `check` (the
  Check column's text), `assignMethodLabel`, `issues[]`; plus `roster.sourceFile`, `importedAt`,
  `routeSource`
- `associates[]`: `associate`, `vanBadges`, `lmrApproved`, `idState`, `daysUntilIdExpiry`,
  `onRoster`
- `vehicles[]`: `vehicle`, `operational`, `overridden`, `priority`, `affinity` (slot to Transporter
  ID), `rental`, `inUse`, `available`
- `routeSets[]` (Routes, Itineraries, Weekly Schedule): the core route set plus `label`; `pads` is
  a `Map`
- `dwp`: `set`, `matchedCount`, `dayStatus`
- `previousRoster`, `lmrApproved[]`, `links` (a `Map`), `tenure` summary, `matchSummary` (a `Map`)
- `print`: `spec` and `presets[]`
- `counts`: every number a header or badge needs

`roster.rows[].index` is the row's place on the roster. Commands that act on a row take it. It is
only good for the snapshot it came from, so a command that takes a row index should also take
`revision` and refuse (`ChannelRefusal('refused', ...)`) when it is no longer current, or find the
row by something stable (the VIN, the Transporter ID).

Need something the snapshot does not hold? Add it to `AppSnapshot` and `buildSnapshot`, or add a
query for it. Keep it plain data: **no class instances** (they cross as bare objects with no
methods). `Map`, `Set` and `Date` are fine. The test "crosses to the page as plain data" in
`src/main/stateHost.test.ts` walks a real snapshot and fails on a class instance.

## Mount a table with the saved layout

```tsx
import { DataGrid } from '../components/DataGrid';
import { databaseLayoutStore } from '../lib/gridLayoutStore';

<DataGrid
  view="roster" // the layout is saved under this name (the old app used "roster")
  label="Roster"
  columns={COLUMNS}
  rows={rows}
  getRowId={(r) => String(r.index)}
  layoutStore={databaseLayoutStore}
/>;
```

Order and widths go to the saved data's own tables (`layout:get`, `layout:set`). Hidden columns
stay in the window's storage per table: the old app could not hide a column, and this is a
deliberate addition that Jonathan approved on 2026-10-08 (see `docs/PARITY.md`). Keep `COLUMNS` and
`rows` stable (`useMemo`), or the table reloads its layout.

## Pick and bring in a file

```tsx
async function bringIn() {
  const picked = await call('files:pick', { kind: 'vehicles' });
  if (!picked.ok) return setProblem(explain(picked));
  if (picked.value.path === null) return; // they closed the window
  // Ask first if this replaces something (the page's job), then:
  const done = await call('files:import', { kind: 'vehicles', path: picked.value.path });
  if (!done.ok) return setProblem(explain(done)); // the reader's own plain words when it refused
  setNote(`Brought in ${done.value.rows} vans.`);
}
```

Kinds: `loadout`, `associates`, `tenure`, `vehicles`, `dwp`, `routes`, `itineraries`, `schedule`.
`files:import` reads **only a file that `files:pick` returned in this run** (or the token of a
file dropped on the page, below). A page cannot name
any other path. The weekly schedule is read for the load-out day (`AppState.routeDay`). After an
import the app sends `state:changed` as for any command. If the file is refused, nothing
changes and the reply is `{ ok: false, reason: 'refused', message }`, where `message` is the
reader's text ("The selected file is not a DWP sheet we can read..."). Show it as it is.

## Take a file dropped on the page

Wrap the tab in `FileDrop` (`src/renderer/components/FileDrop.tsx`) and bring the file in with
the token it hands you, exactly as if `files:pick` had returned it:

```tsx
<FileDrop
  page="vehicle-data"
  kind="vehicles"
  onDropped={(token) => void importVehicles(token)} // bringInFile(kind, messages, token)
  onProblem={(words) => dropRefused(messages, words)}
>
  ...the tab...
</FileDrop>
```

The page hands the file itself to `call('files:dropped', { page, kind, file })`. Only the preload
turns it into a place on the computer (`webUtils.getPathForFile`) and sends `{ page, kind, path }`
to the main process, which checks it (that page takes that kind, the ending fits, it is there,
it is one file, it is under 50 MB) and answers with a token such as
`dropped-<id>/sheet.xlsx`. `files:import` reads a token once, for the kind it was dropped as. The
page never sees where the file is, and nothing logs it. Which pages take which kinds, and what
each kind is called ("Drop the load-out sheet here"), is in `src/shared/channels/files.ts`
(`DROP_KINDS`, `FILE_WORDS`). A drop anywhere else does nothing (`useNoStrayDrops` at the root).

## Show an error in plain words

Use `explain(reply)` from `lib/channels.ts`. It turns a failed reply into words for the person
(the reader's own text for `refused`, a plain sentence for every other reason). Never show
`reason`, never show a caught error's `.message`, and never log one: it can hold a name or a path.
Log counts and codes only.

## Tests

**Handler test (vitest, no Electron).** `src/main/stateHost.test.ts` builds the real handlers on a
temporary database with a stand-in for Electron's message bus. Copy its `makeRig()`, call
`rig.call('loadOut:your-channel', input)`, and check the reply and then `snapshot()`. Use the
fixture files in `packages/fixtures` (`fixture('vehicles', 'VehiclesData.xlsx')`) and
`rig.switchTo(true)` for the made-up demo day.

```ts
it('forgets the previous roster', async () => {
  rig.switchTo(true);
  rig.host.state.moveToPreviousRoster();
  expect(await rig.call('loadOut:clear-previous-roster')).toEqual({ ok: true, value: null });
  expect((await snapshot()).counts.previousRosterRows).toBe(0);
});
```

**Page test (Playwright on the Vite dev server).** `npm run test:ui -w @loadout/desktop`. A plain
browser has no bridge, so install the stand-in from `e2e/support/fakeBridge.ts`:

```ts
await installFakeBridge(page, {
  settings: { demoMode: false },
  snapshot: { counts: { previousRosterRows: 12 } },
});
await page.addInitScript(() => localStorage.setItem('loadout.page', 'previous-roster'));
await page.goto('/');
await onCall(page, 'loadOut:clear-previous-roster', `() => {
  window.__fake.snapshot.counts.previousRosterRows = 0;
  setTimeout(() => window.__fake.emit('state:changed', { revision: 2 }), 0);
  return { ok: true, value: null };
}`);
await page.getByTestId('clear-previous-roster').click();
await expect(page.getByTestId('previous-roster-count')).toContainText('No previous roster');
expect(await callsTo(page, 'loadOut:clear-previous-roster')).toHaveLength(1);
```

Put `data-testid` on what a test needs. `e2e/page-pattern.spec.ts` has more (a refusal, a missing
database, a change announced from outside). The stand-in's empty snapshot is plain; pass what the
page needs. It does not run the core, so it proves the page, not the rules.

**Smoke check (real Electron).** `ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a npm run smoke -w
@loadout/desktop` (on Windows: `npm run smoke -w @loadout/desktop`). Add a `check('...', ...)` in
`scripts/smoke.mjs`. Inside the page, `window.loadout.calls['state:snapshot']()` is the real
bridge. Demo mode gives a made-up day. To skip the file window, replace the dialog in the main
process first:

```js
await app.evaluate(({ dialog }, file) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
}, fixtureFilePath);
```

## Channels that exist

Every channel in the app after phase 4, in the order of their area files. Signals and events
take no reply; a quiet command sends no `state:changed`. Row commands on the Load Out page take
the snapshot's `revision` and refuse when it has moved on.

| Channel | Kind | Input | What it does |
| --- | --- | --- | --- |
| `app:get-version` | query | none || The app's version text. |
| `app:renderer-ready` | signal |  | The page has drawn itself (the start-up check waits for this). |
| `data:get-source-info` | query | none || `DataSourceInfo`: real or demo, whether it opened, table counts. |
| `data:open-folder` | command (quiet) | none || Opens the folder that holds the saved data. |
| `app:open-link` | command (quiet) | link text | Opens the help forum or one of the app's release pages in the browser. Refuses any other link (`shared/links.ts`). |
| `settings:get` | query | none || The settings (`AppSettings`). |
| `settings:set` | command (quiet) | settings patch | Takes a patch, keeps only the valid fields, saves, and returns the settings as they now are. Turning demo... |
| `updates:get-status` | query | none || Where the update check is (`UpdateStatus`). |
| `updates:check` | command (quiet) | none || Checks GitHub for an update now. |
| `updates:install` | signal |  | Restart the app to finish installing a downloaded update. |
| `updates:status-changed` | event |  | Main process to page: the update status changed. |
| `state:snapshot` | query | none | Everything a page needs to draw (see `AppSnapshot`). |
| `state:changed` | event |  | Main process to page: a command ran, or the data was swapped (demo mode). Re-read. |
| `files:pick` | command (quiet) | `{ kind }` | Opens the file window, set up for this kind of file. Changes nothing. |
| `files:import` | command | `{ kind, path }` | Reads a file that `files:pick` returned and puts it in the day's data, replacing what was there for that... |
| `files:dropped` | command (quiet) | `{ page, kind, path }` | A file dropped on a page: checks it and answers a token `files:import` reads once. The page sends the file; the preload sends its place. |
| `layout:get` | query | `{ view }` || A table's saved column order and widths. |
| `layout:set` | command (quiet) | `{ view, order, widths }` | Replaces the table's layout. Quiet: moving a column is not a change to the day's data. |
| `loadOut:clear-previous-roster` | command | none | Forgets the previous roster (the one kept from the last run). |
| `loadOut:move-to-previous-roster` | command | none | Copies today's roster to the Previous Roster. Today's roster is untouched. Rows copied. |
| `loadOut:clear-roster` | command | none | Empties today's roster. Associate data and manual links are kept. |
| `loadOut:bring-over-route-data` | command | `{ kind }` | Copies dispatch time, route code, service type and PAD from one route export. |
| `loadOut:bring-over-dwp` | command | none | Copies staging, bags and OVS from the DWP sheet, matched on route code. |
| `loadOut:assign-vans` | command | none | Works out a van for every driver who needs one (a full recompute). |
| `loadOut:clear-vans` | command | none | Empties the Vehicle and VIN columns. How many drivers lost a van. |
| `loadOut:clear-links` | command | none | Forgets every hand-made link; every driver goes back to automatic matching. |
| `loadOut:remove-driver` | command | `{ revision, rowIndex }` | Takes one driver off the roster, with whatever they were holding. |
| `loadOut:link-driver` | command | `{ revision, rowIndex, transporterId }` | Links a driver to an associate by hand, or (transporterId null) marks them as not one. |
| `loadOut:unlink-driver` | command | `{ revision, rowIndex }` | Drops the hand-made link of one driver: back to automatic matching. |
| `loadOut:reassign-route` | command | `{ revision, from, to }` | Hands one driver's route (and its van and DWP numbers) to another; a swap if they had one. |
| `loadOut:reassign-van` | command | `{ revision, from, to }` | Hands one driver's van to another; a swap if they had one. |
| `loadOut:give-van` | command | `{ revision, rowIndex, vin }` | Puts a driver in a free van by hand. |
| `loadOut:take-van` | command | `{ revision, rowIndex }` | Takes a driver's van away. Answers with the van's name. |
| `print:rows` | query | none | Today's drivers as the sheet wants them, and the day. Changes nothing. |
| `print:set-spec` | command (quiet) | `{ spec }` | Remembers the layout the tab is showing (the unnamed working layout). |
| `print:save-preset` | command | `{ name, spec }` | Saves the layout under a name (replacing one of that name). Answers the names. |
| `print:load-preset` | command | `{ name }` | Puts a saved layout on the tab (it becomes the working layout too). |
| `print:delete-preset` | command | `{ name }` | Forgets a saved layout. What is on the tab stays. Answers the names left. |
| `print:reset` | command | none | Puts the tab back to the sheet it started with. Saved layouts are kept. |
| `print:print` | command (quiet) | `{ spec, vans, openAfter }` | Print Page (or Print Vans, with `vans`): asks where to save it, then writes the .pdf or .xlsx the name... |
| `print:preview` | command (quiet) | `{ spec }` | Preview: writes the sheet to a temporary PDF and opens it. |
| `print:export` | command (quiet) | `{ withDwp }` | Export Roster (or Export with DWP): asks where to save it, then writes it. |
| `routeData:set-pads` | command | `{ kind, pads }` | Pins each dispatch time to a PAD (0 or a missing time means no PAD). Times left out become unassigned, and... |
| `routeData:adopt-schedule-pads` | command | `{ kind }` | Copies each driver's PAD from the Weekly Schedule onto this export's rows. |
| `routeData:set-route-drivers` | command | `{ kind, revision, choices, transporterId }` | Says which of a shared route's drivers each route belongs to. `rowIndex` is the row's place in the export... |
| `routeData:clear` | command | `{ kind }` | Empties one export and its PADs. The others and the roster are kept. |
| `dwp:clear` | command | none | Empties the DWP sheet. The roster and the route exports are kept. |
| `vehicles:set-operational` | command | `{ vins, operational }` | Puts vans in service or takes them out. Setting a van back to the export's word drops the override. |
| `vehicles:match-export` | command | `{ vins }` | Drops the status set here for these vans and goes back to what the export says. |
| `vehicles:set-priority` | command | `{ vins, priority }` | A whole number, or empty to remove the number. |
| `vehicles:clear` | command | none | Empties the fleet. Affinity, statuses set here, priorities and LMR approvals are kept. |
| `vehicles:clear-overrides` | command | none || Drops every status set here; every van goes back to what the export says. |
| `vehicles:clear-priorities` | command | none || Removes every van's priority number. |
| `vehicles:set-affinity` | command | `{ vin, slot, transporterId }` | Puts a driver in a van's slot. Returns the slots they gave up to take it. |
| `vehicles:clear-affinity` | command | `{ vin, slot }` || Empties one slot of one van. |
| `vehicles:clear-all-affinity` | command | none || Empties every van's slots. |
| `vehicles:set-lmr` | command | `{ transporterIds, approved }` | Approves or removes approval for Last Mile Rentals. |
| `vehicles:clear-lmr` | command | none || Removes every Last Mile Rental approval. |
| `associates:clear` | command | none | Empties the associate list. Lifetime route counts and the roster are kept. |
| `associates:clear-tenure` | command | none | Forgets every lifetime route count. The associate list and the roster are kept. |

## Parts the data pages share (4c)

The Route Data, Vehicle Data and Associates pages share a few small parts in
`src/renderer/pages/dataPages/`. Use them if they fit; they are plain and have no page rules in them.

- `Modal.tsx`: `Modal`, `ConfirmDialog`, `MessageDialog`, `PromptDialog`. Native `<dialog>`, so
  Tab stays inside and Esc closes. `useDialogs.tsx` opens one and waits for the answer, like the
  old app's `wait_window`: `const yes = await ask<boolean>((done) => <ConfirmDialog ... onDone={done} />)`.
- `bringIn.ts`: `bringInFile(kind, messages)` picks and imports a file and shows the reader's
  words on a refusal. `command(messages, 'x:y', input)` runs a command and shows a plain banner if
  it does not go through. `readNow()` reads a fresh snapshot, for wording what an import did.
- `PageParts.tsx`: the heading card, the button strip, the status line, the problem banner.
- `picks.tsx`: the table follows one row at a time, so several rows are chosen with a "Pick" tick
  box in the first column. Buttons act on the ticked rows, else on the row you are on. Keep the
  row you are on as an id, not as the row object: after a command the rows are new objects.
- Commands that name something take a stable key (a VIN, a Transporter ID). Only a command that
  takes a place in a list (a row of a route export) takes the snapshot `revision` as well.
- A refused command still counts as a change, so the page reads the snapshot again after it. A
  test that tries a second time must read the revision again first.
- In browser tests the stand-in bridge now hands over a **copy** of the snapshot each time, as
  the real bridge does. A page that keeps the old object would never notice a change.
- `DataGrid` list props (`rowActions`, `columnActions`, `statusChips`) now default to one shared
  empty list. A fresh `[]` on every render made the table redraw forever for any page that left
  them out.

## Rules that bite

- **Privacy.** No real names, IDs, VINs, plates, phone numbers or paths in code, tests, logs or
  messages. Examples use the made-up people in `packages/fixtures/manifest.json`. Handlers and
  logs carry counts and reason codes. Run `npm run scan` before you commit.
- **Plain words** for anything a person reads, and for the pull request.
- **No second bridge.** Do not add `ipcRenderer`, `ipcMain.handle` or any other door. New
  behaviour is a declared channel with a handler.
- **Do not change core rules** to suit a page. Matching, linking and van assignment are the old
  app's. A small export or helper in the core is fine; say so in the PR.
- A page that shows demo data only when demo mode is on must read `settings.demoMode` (it is in
  the page's props), not look for a special address.
- In the dev server, React runs pages twice on purpose, so the snapshot is read twice at start.
  The installed app reads it once.
