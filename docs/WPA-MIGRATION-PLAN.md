# Weekly Performance App - migration into Loadout Builder

This plan is written for the cloud agents that carry out the migration. It is the single source
of truth for scope, order of work and what "done" means. Read it fully before starting. Then read,
in this order: `CLAUDE.md`, `docs/PAGE-PATTERN.md`, `docs/MIGRATION-PLAN.md` (how the load-out
side was ported; same rules, same tone), `legacy/wpa/OLD-APP-NOTES.md` (the old app, file by
file), `legacy/wpa/README.md` (the parity harness), `packages/fixtures/README.md`.

The person who owns the product is Jonathan (a dispatcher, not a programmer). The people who
will use the app are dispatchers, leads and managers at an Amazon DSP. They are not programmers.

Status: **Approved.** Jonathan confirmed on 2026-10-10 (see section 2). Phase 0 ran on his PC.
Everything from phase 1 on runs in the cloud, on branch `wpa-migration`, in one session, with one
pull request. Nobody waits at the keyboard (section 9).

---

## 1. Why

The Weekly Performance App (`legacy/wpa/src`, about 10k lines of C# / WPF on .NET 10) ingests the
weekly Amazon performance exports for the drivers, keeps them in SQLite, and makes per-driver PDF
reports that get emailed out. It works, but it is a second program with a second window, a second
install story, no auto-update and no tests. Jonathan wants one app, in one language (TypeScript),
that updates itself from a public GitHub repository the way Route Sheet Distributor and Loadout
Builder already do. Loadout Builder is that shell. This plan folds the Weekly Performance App into
it.

## 2. What Jonathan decided (2026-10-10)

1. **Scope.** Port all of it, except the four old "report window" screens, which are replaced by
   something better (next item): the driver grid with its filters; all nine importers (scorecards,
   roster, thresholds, POD PDFs, CDF, DSB, PSB, DCR events, DCR totals, Safety); the per-driver PDF
   report with the score chart; the directory; emailing PDFs over Gmail; report colours and
   appearance; auto-import on startup and "Sync now".
2. **A new Dashboard, designed from scratch.** The old Team Summary PDF, Coaching window,
   Compliance window and Fleet Dashboard window are **not** rebuilt as they were. Their engines
   (coaching flags, ID-expiry compliance, fleet trends and category roll-ups) are ported as data,
   and a new Dashboard page is designed on top of them. Agents may search Mobbin for inspiration
   (section 7 has a starting set). The old windows are reference for *what information mattered*,
   not for how it should look.
3. **Quality-of-life changes are welcome.** Jonathan liked the small touches Route Sheet
   Distributor and Loadout Builder v2 gained (drag-and-drop, shortcuts, "asks before clearing",
   plain-words errors, the first-run checklist, page tours, What's new). Think broadly about what
   would make the weekly routine easier, do the ones that are cheap and obviously good, and list
   the rest under "Ideas not done" in the pull request. Section 8 has a starting list.
4. **Teach new users.** The hand-holding layers that Loadout Builder already has (Home checklist,
   per-page tours, How to use, What's new) must cover the new pages too. A lead who has never seen
   the app should be able to import a week and email the reports with no one helping.
5. **Bring over existing data.** On first run the app offers to copy the old app's database
   (`%LocalAppData%\WeeklyPerformanceApp\app.db`) into its own, the same way it offers the old
   roster data. This is code only: the file itself never goes near the repository.
6. **Private data never enters the repository.** Development happens in the private repository.
   The public repository receives a scrubbed single commit (`scripts/publish-public.mjs`) and that
   is where releases and auto-update come from. Nothing in `legacy/` is ever published.

## 3. The stack mapping

| Old (C#) | New (TypeScript) | Where |
| --- | --- | --- |
| `Models.cs` POCOs, `MetricDefinitions.All` (the 12 metrics and their exact CSV headers), `ThresholdMetricNames.Normalize`, `WeekMath.cs` | plain types and pure functions | `packages/performance/src/models/` |
| `*Importer.cs` (CSV via CsvHelper) | pure parsers over text, with Papa Parse (already a dependency) | `packages/performance/src/importers/` |
| `PodImporter.cs` (PDF via PdfPig: words bucketed by Y, anchored on the Transporter ID) | the row-finding logic as a pure function over `{ page, words: [{ text, x, y }] }`; the PDF-to-words step uses `pdfjs-dist` in the main process (Route Sheet Distributor uses the same library) | logic in `packages/performance/src/importers/pod.ts`; word extraction in `apps/desktop/src/main/performance/` |
| `Database.cs` (13 tables) | one new migration step in the app's own database (`loadout.db`), tables prefixed `perf_` in snake_case, same columns | `packages/storage/src/migrations.ts` |
| `DriverRepository.cs`, `FleetRepository.cs`, `ThresholdRepository.cs` | read queries in storage; the arithmetic (averages, ranks, safety counts, trends, roll-ups, summary) as pure functions in the performance package so they can be tested against the expected files | `packages/storage/src/performance.ts`, `packages/performance/src/analysis/` |
| `CoachingEngine.cs`, `ComplianceEvaluator.cs`, `IdExpirationParser.cs` | pure functions, same rules | `packages/performance/src/analysis/` |
| `AutoImporter.cs` (remembered folders, `ImportedFiles` ledger, idempotent re-import) | main-process service; folders are remembered in the main process after a `files:pick`; a page never names a path | `apps/desktop/src/main/performance/autoImport.ts` |
| `ReportGenerator.cs` (QuestPDF + ScottPlot), `ReportStyle.cs`, `PdfSettings.cs` colours | an HTML report template rendered by Electron's `printToPDF` in a hidden window; the chart is inline SVG; the same HTML is the on-screen preview. If `printToPDF` cannot be made to work in the Linux smoke test under xvfb, fall back to `pdf-lib` (already a dependency) and say so in the PR | `apps/desktop/src/main/performance/report/` |
| `DataExporter.cs` (verification CSV, exact source headers, UTF-8 with BOM) | same, as a pure function plus a save-as command | `packages/performance/src/export.ts` |
| `EmailSender.cs` (MailKit, Gmail App Password), `SecretProtector.cs` (DPAPI) | lift `src/core/mailer.js` from Route Sheet Distributor (nodemailer) and keep the app password in Electron `safeStorage`; `EmailSenderSession` becomes one transport reused for a batch | `apps/desktop/src/main/performance/mailer.ts` |
| `PdfSettings.cs` (JSON in LocalAppData) | a `performance` section of the app's settings (`src/shared/settings.ts`), never the database | `apps/desktop/src/shared/settings.ts` |
| `MainWindow` grid, filter chips, week range, import buttons, prev / next driver | the **Performance** page: Drivers tab (the grid, `DataGrid` with saved layout), Reports tab, Directory tab, Imports tab | `apps/desktop/src/renderer/pages/performance/` |
| `FleetDashboardWindow`, `CoachingWindow`, `ComplianceWindow`, `TeamSummaryReportGenerator` | the new **Dashboard** page (section 7) | `apps/desktop/src/renderer/pages/dashboard/` |
| `DirectoryWindow`, `SafetyDetailsWindow`, `ThresholdsWindow`, `AppearanceWindow`, `EmailSettingsWindow`, `PdfSettingsWindow` | tabs or dialogs on the Performance page and sections on Settings | as above |

Rules that follow from the page pattern (`docs/PAGE-PATTERN.md`): every new message is a declared
channel in `src/shared/channels/performance.ts` with a handler in
`src/main/handlers/performance.ts`; pages read from the snapshot and act with `call`; no second
bridge; the core rules live in the packages, the handlers only call them.

## 4. Fixtures and the parity harness (phase 0, done)

- `packages/fixtures/performance/<kind>/` holds made-up copies of ten weeks of every export kind:
  `roster`, `thresholds`, `scorecards`, `pod` (synthetic PDFs with the same word layout), `cdf`,
  `dsb`, `psb`, `dcr`, `dcr-totals`, `safety`. The station code is `XXX1`. Every made-up name and
  ID is in `packages/fixtures/manifest.json`; use those in examples and tests.
- `scripts/parity/wpa/expected/` holds what the **old app's own code** produced from those
  fixtures (made by `legacy/wpa/harness`, which compiles the old importers and analysis code):
  `import-results.json`, `weeks.json`, `drivers.json`, `thresholds.json`, `averages.json`,
  `safety-counts.json`, `trends.json`, `category-rollup.json`, `category-hits.json`,
  `fleet-summary.json`, `coaching.json`, `compliance.json` (with its `asOf` date),
  `drivers/<id>.json` (per-driver scorecards, metrics, ranks, event entries), `verification.csv`,
  and `pdf/` (three sample reports, the sample first page as PNG, a team summary and a coaching
  report, for looking at only).
- The harness only runs on Windows. The cloud never needs it: the expected files are committed.
  If the port finds the expected files wrong (the old app had a bug), do not edit them: write the
  case under "Needs Jonathan" in the PR with the evidence, and make the new behaviour match the
  old one for now.
- Known limitation: the seed used for the load-out fixtures was lost, so the people in
  `packages/fixtures/performance/` are different made-up people from the ones in the load-out
  fixtures. Demo mode therefore cannot join a driver's load-out record to their performance
  record. This is listed under "Needs Jonathan".

## 5. Non-negotiables (every phase)

1. **Privacy.** No real names, IDs, VINs, emails, phones, station code or user paths anywhere in
   the repository, the PR, commit messages, logs or error text. Examples come from
   `packages/fixtures/manifest.json`. `npm run scan` must pass before every commit; in the cloud
   the CI scan is the gate. The app's own logs carry counts and reason codes only.
2. **Plain words** for everything a person reads (buttons, errors, help, release notes, the PR).
   `CLAUDE.md` has the rules and examples.
3. **Numbers match the old app.** Averages, ranks, tiers, counts, flags and the verification CSV
   must equal the expected files exactly. Port the rules; do not improve them. Improvements go in
   a later release with a note.
4. **Do not change the load-out side** (matching, assignment, print). A small shared helper is
   fine; say so in the PR.
5. **Nothing leaves the machine** except the update check and the emails the person sends.
6. **One database, one settings file.** No second data folder.
7. **Every page is testable without Electron** (handler test with the rig in
   `src/main/stateHost.test.ts`, page test with the stand-in bridge) and **every real-data path
   has a smoke check** in `apps/desktop/scripts/smoke.mjs`.
8. **The release note test** must pass: version `2.1.0` with a What's-new entry written for a
   five-year-old.

## 6. Phases (run in order on branch `wpa-migration`; one draft PR, updated after each phase)

The cloud session is the orchestrator. It reads this plan, then does each phase itself or with
background subagents (one per bullet where the bullets are independent). After each phase: lint,
typecheck, test, scan, commit with a plain-words message, push, update the PR description
(sections of the PR template; keep a running "Needs Jonathan" and "Ideas not done" list at the
end). Never stop to ask. If something is truly blocked, write it under "Needs Jonathan", do
everything else, and carry on.

### Phase 1 - Models and importers (`packages/performance`)

Create the package (`@loadout/performance`, pure TypeScript, no Electron, no browser; copy the
shape of `packages/core`). Port `Models.cs`, `WeekMath.cs`, `MetricDefinitions`,
`ThresholdMetricNames`, `IdExpirationParser.cs`, and every importer as a parser from file text (or
words, for POD) to rows plus an `errors` list, keeping every header alias, the `YYYY-Www`
zero-padded week rule, the "replace the week on re-import" meaning (as a result shape the storage
layer applies), and the old error messages' meaning in plain words.

- Done when: each importer has a test per fixture file asserting row counts and a sample of
  parsed fields against `scripts/parity/wpa/expected/import-results.json` and the per-driver
  files; the POD parser reads every synthetic PDF's words (use `pdfjs-dist` in the test through a
  small node helper) and finds the same rows the old app found; `docs/PARITY-PERFORMANCE.md`
  exists with a checkbox per feature of the old app (grouped: importers, grid, reports, email,
  settings, auto-import, data brought over, dashboard inputs) and the importer rows are ticked.

### Phase 2 - Storage, analysis, data brought over

- Migration step: the `perf_` tables, same columns as `Database.cs` (`CREATE TABLE` list), with
  the two `MigrateAdd*` columns simply included. Repository reads in `packages/storage`.
- Analysis as pure functions: averages and ranks (`DriverRepository.ComputeAverages`,
  `GetRanksForDriver`), safety counts (excluding `Program Impact` = None), trends, category
  roll-up and hits, fleet summary (top N), coaching flags (four rules, settings-driven),
  compliance (window days, `asOf` passed in).
- One-time import of the old `app.db`: mirror `packages/storage/src/importV1.ts`; only while the
  `perf_` tables are empty; copies every table; the old file is never changed. A Settings entry
  and a first-run question in plain words ("We found your weekly performance data. Bring it
  over?"). Test it with a database built from the fixtures by the old schema (write it in the test
  from the `CREATE TABLE` text in `legacy/wpa/src/Database.cs`).
- Done when: every analysis function reproduces its expected file byte-for-byte after JSON
  normalisation; the verification CSV from the fixtures equals `expected/verification.csv`; the
  parity doc's analysis rows are ticked.

### Phase 3 - The Performance page, reports, email, auto-import

- Channels and handlers (`performance:*`), snapshot additions (keep it plain data; the
  "crosses as plain data" test must pass).
- **Performance page** with tabs: **Drivers** (the grid: driver, status, latest tier and score,
  per-metric averages over the week range, safety counts as red links that open the per-event
  list, trend columns; filter chips for status, tier and activity; week range picker remembered
  between runs; Select all visible / Clear selection; Generate for selected, Generate all, Export
  selected / visible; right-click row: Preview PDF, Email this report), **Reports** (report
  colours with a live preview of page 1, thresholds table with import, prev / next driver
  preview), **Directory** (contact list from the roster, copy email / phone), **Imports** (one card
  per export kind with the remembered folder, last import, Sync now, auto-import on startup
  toggle, drag-and-drop of a file or a folder onto the card).
- **PDF report**: the same pages as the old report (weekly detail with chart, metric tables,
  threshold legend, then POD / CDF / DSB / PSB / DCR pages; `FillMissingWeeks` behaviour). Match
  the content, not the pixels; the old PDFs in `expected/pdf/` are for looking at.
- **Email**: settings section (SMTP host and port, from address and name, username, app password
  in `safeStorage`, BCC, subject and body templates with the same placeholders), Send test, Email
  selected, with one connection per batch and a plain-words result ("Sent 12, could not send 1:
  no address on file").
- **Auto-import**: on startup when turned on, and Sync now; ledger of imported files by name and
  modified time; idempotent per week; a plain summary afterwards ("3 new files, 2 weeks
  updated").
- Settings page: a Weekly performance section (folders, auto-import, coaching rule numbers,
  compliance window, top N).
- Done when: handler tests cover every channel; Playwright page tests cover each tab with the
  stand-in bridge; the smoke check imports the fixtures through the real bridge, generates one
  report and opens it, and exports the verification CSV; the parity doc's grid, reports, email,
  settings and auto-import rows are ticked.

### Phase 4 - The Dashboard, quality of life, teaching

- Design and build the **Dashboard** page (section 7). It is new. Spend real care on it: it is the
  screen a manager will judge the app by.
- Quality-of-life touches (section 8): do the cheap obvious ones; list the rest.
- Teaching: a Home checklist card for the weekly routine (bring in the roster, choose the export
  folders, Sync now, look at the Dashboard, generate and email) that ticks itself off; tours for
  the Performance and Dashboard pages (`src/renderer/help/tours.ts`); a How to use section for the
  weekly routine with "where to get each file" notes (made-up screenshots only, taken in demo
  mode); demo mode loads the performance fixtures too; the `2.1.0` What's-new note.
- Done when: the "no help" test in `docs/NO-HELP-TEST.md` can be run for the weekly routine;
  tours and checklist have tests like the existing ones; help screenshots are regenerated with
  `help-shots` in demo mode.

### Phase 5 - Wrap up

- `docs/PARITY-PERFORMANCE.md` fully ticked, or each untouched row has a reason under "Needs
  Jonathan".
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run scan`, the Playwright page tests and
  the smoke check all green in CI on the branch.
- Version `2.1.0` in `apps/desktop/package.json`; release note at the top of
  `packages/core/src/releaseNotes.ts`; README gains a short "Weekly performance" part in the same
  voice as the rest.
- The PR description is final: What changed, What you'll notice, How it was checked, For whoever
  maintains the app, Needs Jonathan, Ideas not done. Mark the PR ready for review.

### After the cloud run (Jonathan, on his PC)

Merge the PR in the private repository, then run the publish step
(`node scripts/publish-public.mjs --remote https://github.com/JoMoCodes/Loadout-Builder.git` and
the push line it prints). The public repository builds and publishes `v2.1.0`; every installed
Loadout Builder updates itself. The Weekly Performance App repository is then archived.

## 7. The Dashboard brief

**Who looks at it and when.** The dispatcher on Monday after the exports land, and the manager
when they ask "how are we doing and who needs a word". It must answer both in under a minute,
without scrolling through the grid.

**What it has to show (from the engines that are ported).**

- The week range in use, with the newest week picked by default and quick picks (last week, last
  4, last 8, last 13).
- Fleet at a glance: average Overall Score and its change from the week before; how many drivers
  in each tier (Platinum / Gold / Silver / Bronze) with the movement in and out; packages
  delivered; the number of drivers with safety events that impact the program.
- Who needs attention: the coaching flags (currently Bronze; dropped a tier; score fell N weeks
  running; the same failure category K weeks running), each with its reason in plain words and
  the one metric dragging the score most; the ID-expiry alerts (expired, expiring within the
  window). Click a driver to open their row on the Performance page or their report preview.
- Movers: most improved and most declined (top N from settings) with before and after.
- Trend: fleet Overall Score over the range, and which failure categories are growing (category
  roll-up).
- Every number is explainable: hovering or clicking a tile says how it was worked out, in words.

**Constraints.** Use the design tokens (`src/renderer/tokens.css`), the shared `ui/` parts and
`DataGrid`; light, dark and high contrast; the A+ font scale; keyboard reachable; no new design
system; charts as inline SVG (no charting library) so they follow the theme; nothing on the page
that the person cannot act on or understand.

**Inspiration (Mobbin; look at the pictures, then design for a dispatcher, not a marketer).**
Agents may search Mobbin for more; these were picked on 2026-10-10:

- KPI tiles with small trend lines above a table: StackAI
  https://mobbin.com/screens/03fb91f0-89d0-45e6-ada1-34d533a3febf
- Top and bottom team members with change chips: Fresha
  https://mobbin.com/screens/2ad71fd9-6708-4fe9-8956-fb4021a87beb
- A traffic-light scorecard grid, one row per person: Charma
  https://mobbin.com/screens/ec30f1b5-302a-4747-af47-8c224486bd98
- Period tabs (week, month, quarter) over a leaderboard: Devin
  https://mobbin.com/screens/e7e5407f-d6f8-40b8-9f05-86745faeb75c
- A person's report: KPI strip then a line chart: Toggl Track
  https://mobbin.com/screens/4544f48d-541a-4c6d-8174-09ed6e442055
- Highlighted metrics next to an event timeline: Klaviyo
  https://mobbin.com/screens/5a526ec4-f548-4d0d-9410-c1d298f9d8ca
- A radar of competencies (the twelve metrics would fit this): Uxcel
  https://mobbin.com/screens/077b681c-46f4-4b0a-a63b-bd0f1e10e1c3
- The first-run checklist panel the app already borrows from (beehiiv):
  https://mobbin.com/flows/2e01960d-3001-4150-9de1-f4e1fa95a825

Write a half-page design note in the PR (what you chose and why, in plain words) before building
it, and keep it there.

## 8. Quality-of-life ideas (pick the cheap, obvious ones; list the rest)

- Drop a whole export folder on the Imports tab and have the app sort the files by kind from
  their names.
- A "What changed since last week" strip on the Drivers tab (tier changes, new safety events).
- Remember the week range, the filters and the selected drivers between runs.
- Email preview before sending; a dry run that lists who would get what.
- "Open report" straight from the row; "Copy email address" from the Directory.
- A missing-weeks warning per export kind ("No DSB file for 2026-W31").
- Keyboard: Ctrl+G generate for selected, Ctrl+E email selected, arrows to move between drivers
  in the preview.
- Ask before anything that overwrites (re-import a week that already has data, replace
  thresholds).
- Plain-words import errors that say which file and which row count, never a row's contents.
- A per-driver "explain this score" view that lists each metric's weight and contribution.

## 9. Cloud rules (so Jonathan never has to step in)

- One session, branch `wpa-migration`, one draft PR opened at the start of phase 1 and updated
  after every phase. Commit after every phase at least; more often is better.
- Subagents in the background are fine for independent bullets; give each the file list and the
  expected files it must match, and review their work before committing.
- Never wait on Jonathan. Decisions you cannot make go under "Needs Jonathan" with your
  recommendation; make the recommended choice and move on.
- Never ask for a real export. Need another fixture shape? Describe it under "Needs Jonathan".
- Never run the installer build; CI does it on Windows. Run the Linux-friendly checks: lint,
  typecheck, vitest, scan, Playwright page tests, and the Electron smoke check under xvfb
  (`ELECTRON_DISABLE_SANDBOX=1 xvfb-run -a npm run smoke -w @loadout/desktop`).
- Models: use the strongest model available to the session for the analysis port, the report and
  the Dashboard; a cheaper one is fine for translation-shaped importer work and tests. Say in the
  PR which parts were done by which.
- Budget: if the session is cut off, the branch and PR hold everything; a new session reads the
  PR's "Where we are" section (keep one, updated with each push) and continues.

## 10. Needs Jonathan (prefilled; add to it in the PR)

1. The load-out fixture seed was lost, so demo mode cannot join load-out people to performance
   people (section 4). Fix later by regenerating all fixtures with one seed on his PC.
2. PDF method: `printToPDF` (recommended) or `pdf-lib`; the agent decides by the Linux smoke test
   and records the choice.
3. Where the two new pages sit in the left menu. Recommendation: Dashboard right after Home;
   Performance after Associates.
4. The compliance window and coaching rule numbers keep the old defaults (30 days; 3 weeks; 3
   weeks; top 5). He can change them in Settings.
5. After the merge: the publish step and the `v2.1.0` release (section 6, last part), then
   archive the WeeklyPerformanceApp repository.
