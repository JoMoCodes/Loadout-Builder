# Route Sheet Distributor - migration into Loadout Builder

This plan is written for the agents that carry out the migration and for Jonathan, who owns the
product. It is the single source of truth for scope, order of work, how agents are used, and what
"done" means. Read it fully before starting. Then read, in this order: `CLAUDE.md`,
`docs/PAGE-PATTERN.md`, `docs/WPA-MIGRATION-PLAN.md` (the last app folded in; same rules, same
tone), `packages/fixtures/README.md`, and the Route Sheet Distributor code at the pinned commit
(section 4).

The person who owns the product is Jonathan (a dispatcher, not a programmer). The people who will
use the app are dispatchers, leads and managers at an Amazon DSP. They are not programmers.

Status: **Approved.** Jonathan confirmed on 2026-10-12 that the public repository is the working
one and said yes to every proposed change in section 3. Phase 1 starts when the weekly usage card
allows (section 9). Everything runs in the cloud, on branch `route-sheets`, in one session, with
one pull request. Nobody waits at the keyboard.

---

## 1. Why

Route Sheet Distributor (`github.com/JoMoCodes/Route-Sheets-Distributor`, Electron, v1.5.2, about
4,700 lines of plain JavaScript, 34 tests) takes the day's route sheet PDF, works out which driver
each page belongs to by exact Transporter ID, and turns each page into an email the driver can read
on a phone. It works and it is in daily use. But it is a second program with a second window, a
second driver list to import, a second email setup, and a second place to type the pads.

Loadout Builder already holds the same driver list (the Associates page reads the same Cortex
export), the same Routes export (the Route Data page), and the pads for each dispatch time (the PAD
dialog). It already emails PDFs over Gmail (Weekly performance). Folding Route Sheet Distributor in
means one app, one driver list, one Routes file, one set of pads, one email setup, and one install
that updates itself.

## 2. What the old app does (the functional spec)

Everything below must exist in Loadout Builder or be listed in `docs/PARITY-ROUTE-SHEETS.md` as
deliberately changed, with the reason, under a heading Jonathan has approved (section 3).

**Bringing files in**

- Associate Data `.csv` (remembered; amber reminder when over a month old).
- Routes export `.xlsx` or `.csv` (pipe-separated Transporter IDs and names on shared routes; a
  title row above the header is skipped).
- Route sheet PDF: one route per page; a long route spills onto a second page; blank pages are
  skipped; a page with no route code is reported. Two PDF layouts: before and after 2026-10-10
  (headings in one run or split into runs; the "fl" ligature in "overflow" is often lost).
- Drag all the files onto the window at once; PDFs are read first so a Routes file dropped with
  them lands in the same run. A Routes file that shares no route codes with the open PDF starts a
  new run.

**The number check.** Every page is cross-checked: bag rows match the "N bags" heading, rows are
numbered 1..N, overflow rows add up to the "N overflow" heading, bags + overflow = Total Packages,
Commercial Packages present. Blank cells (a missing Sort Zone or Bag label) stay blank, are never
shifted, and are reported as notes to the dispatcher and the driver.

**Distribute page.** Counts along the top. "Pad for each wave" (type one pad per wave time; it goes
in a blue box on the email and in the subject). Then, in this order: Ready to send; Choose who gets
these route sheets (a route lists two or more drivers; a green Suggested tag when one is the only
active match or the only one not listed elsewhere; Accept all suggestions); No exact match (with
the reason: not in the driver list, INACTIVE, no Transporter ID, numbers did not add up, page found
but tables unreadable, in the PDF but not on the Routes file; choose someone from a drop-down and
Assign, or Don't send); On the Routes file but missing from the PDF; People who won't get a route
sheet (every driver getting nothing, and why; and anyone getting more than one); All routes (one
table; Change undoes a choice). A name check warns when the Routes file name and the driver list
name disagree, but matching is always by ID.

**Route Sheets page.** Click a route, see exactly the email the driver gets (route, staging, pad,
wave and date boxes; the date in a maroon box with the full day name; bag table with colour
swatches; overflow table; totals; a note when the page could not be read, telling the driver to use
the attached PDF). Buttons: Send email; Copy for email (rich clipboard); Open email draft (`.eml`
that Outlook opens unsent, with the page attached); Copy + open mail app (`mailto:`); Save PDF page;
View original page; Mark as sent. A ✓ after any of them. Email all (asks first, one email per
driver over one login, each success saved at once, a plain-words tally at the end; routes with no
address are left out and said so). Export all (a folder with an email draft and a PDF per ready
route, every PDF, and a summary as HTML and CSV).

**History.** Every day's work is saved with its choices, sent marks and pads, keyed by station,
date and cycle; reopen an older day; New run; Delete a run (asks first); on the first open of a new
day, ask whether to clear earlier days' runs (the driver list and settings always stay); Open and
Change the output folder (runs move with it; if the folder is unplugged, the default folder is used
and the page says so).

**Email settings.** Gmail address, 16-letter App Password (spaces removed; kept sealed with the
computer's safe storage; never shown again), optional BCC copy, Send test email. Plain-words
explanations for every SMTP failure (wrong password, 2-Step off, no connection, daily limit).

**Shell.** Light or dark, High contrast, text size A+ (and Ctrl +/-/0 and Ctrl + wheel), What's
new once after an update, Features log, How to use (step by step, colours, what to do when
something goes wrong, Ask a question), "?" on each import box showing where to download the file
with a picture, Open data folder.

## 3. What changes when it lives inside Loadout Builder

These are the only allowed differences from section 2. Anything else an agent wants to change goes
under "Needs Jonathan" in the pull request and is **not** done.

### Decided by the shape of Loadout Builder (no decision needed)

1. **One driver list.** The Associate Data import goes away. Matching reads the Associates page's
   list (same Cortex export, same columns: Transporter ID, name, email, status). The "over a month
   old" reminder is ported onto the Associates page and the Route Sheets page's driver-list card.
2. **One Routes file.** The Routes import goes away. Matching reads the Route Data page's loaded
   Routes export (the core keeps every pipe-joined ID and name in `sharedIds` / `sharedDrivers`).
   If the loaded route data is the Itineraries or Weekly Schedule export instead, it is used the
   same way when it carries Transporter IDs per route code; the page says in plain words which
   file it is using and asks for the Routes export when none is loaded.
3. **Pads come from Route Data.** "Pad for each wave" goes away. Each route's pad is the one the
   Route Data page already knows for that dispatch time (or that the Weekly Schedule row carries).
   The PDF's wave time ("09:50 AM") is matched to the Routes export's dispatch time by clock value,
   not text. For any wave time on the PDF that matches no dispatch time in the route data, the
   Distribute tab shows the old "Pad for each wave" box for that wave only, so a pad can still be
   typed. If a route has no pad either way, the email shows no pad box, as before.
4. **One email setup.** The Weekly performance email section in Settings becomes the app's
   **Email** section (same fields: server, port, from address and name, username, app password,
   BCC, Send test). Route sheet emails use it. The app password already lives in safe storage.
5. **Theme, text size, What's new, Features log, How to use, tours, checklist, demo mode, Open
   data folder** are the app's existing ones. Nothing from the old shell is ported.
6. **The plain-words shell rules** (`CLAUDE.md`) already apply.

### Approved by Jonathan on 2026-10-12

7. **Runs live in the app's database.** Each day's run (sheets as read, decisions, sent marks)
   goes in new `rs_` tables in `loadout.db`; the original PDF is kept as a file under the app's
   data folder (`route-sheets/<run id>.pdf`) so single pages can be re-cut later. **Open output
   folder** and **Change output folder** go away: there is no output folder any more, only the
   data folder (already in Settings) and the folder you pick for Export all.
8. **No "clear earlier days?" question.** Runs older than 30 days are removed quietly when the app
   opens. History shows the ones that are left. Delete a run stays (asks first).
9. **Where it lives in the app:** a new **Route Sheets** page in the left menu, under Load Out,
   with three tabs: **Distribute**, **Sheets**, **History**. The Home checklist gains a daily step
   "Send the route sheets" after "Assign vans and print".
10. **Nothing is brought over from the old app.** Its driver list is the same file the Associates
    page already has; its runs are days that have passed; its app password cannot be read by
    another program (it is sealed to the old app). The first time the Route Sheets page opens, if
    the old app's data folder exists, the page says: "Route Sheet Distributor's work now lives
    here. Enter your Gmail app password once in Settings > Email, and you can uninstall the old
    app."
11. **A last Route Sheet Distributor release (1.6.0)** whose only What's-new note says the app has
    moved into Loadout Builder, with the install link. Then the old repository is archived.

## 4. The stack mapping

Pinned source: Route Sheet Distributor commit `92d21aa` (release 1.5.2). The port reads that code
and nothing newer. Its licence is MIT and the repository is already public, so vendoring a copy for
the parity harness (section 6) raises no privacy question; the harness copy is never shipped.

| Old (JavaScript) | New (TypeScript) | Where |
| --- | --- | --- |
| `pdfParser.js`: `groupLines`, `findHeading`, `findColumns`, `readRow`, `parsePageItems`, `verifySheet`, `hasRouteCode`, the page-stacking loop | pure functions over `{ str, x, y, width, size }` items, same names, same rules | `packages/route-sheets/src/parser/` |
| `pdfParser.js`: `parseRouteSheetPdf` (pdfjs) | one node-only file that turns a PDF into positioned items (the sibling of `packages/performance/src/importers/pdfWords.node.ts`; share the pdfjs loading) | `packages/route-sheets/src/parser/pdfItems.node.ts` |
| `tableParsers.js`: `parseAssociates`, `parseRoutes`, `readTable` | **not ported** (section 3, items 1 and 2). `namesAgree` and `nameTokens` are ported. | `packages/route-sheets/src/matcher/names.ts` |
| `matcher.js`: `distribute`, `STATES`, `summarizeSheet`, `summarizeWaves`, `summarizePeople`, `waveSortKey` | pure functions, same shapes; `routes` input is built from the core's `RouteDataSet`, `associates` from the core's `AssociateBook`, `pads` from the core's `padFor` | `packages/route-sheets/src/matcher/` |
| `emailRender.js`, `exporter.js` (`renderEmailHtml`, `renderEmailText`, `subjectFor`, `buildEml`, `extractPages`, `buildRouteEmail`), `service.js` `renderSummaryHtml` / `renderSummaryCsv` | pure functions, same output byte for byte where the input is the same | `packages/route-sheets/src/email/`, `packages/route-sheets/src/export/` |
| `mailer.js` | the app's existing mailer, extended to carry an HTML part and attachments given as bytes (`apps/desktop/src/main/performance/mailer.ts` moves to `apps/desktop/src/main/mail/mailer.ts`; the performance side keeps working) | `apps/desktop/src/main/mail/` |
| `service.js`: runs, decisions, sent marks, `pruneDecisions`, `runIdFor`, `runLabel`, `detectKind`, `emailRoutes`, `exportAll` | a `RouteSheetsHost` in the main process (the sibling of `performance/perfHost.ts`), with the rules as pure functions in the package so they are tested without Electron | `apps/desktop/src/main/routeSheets/` and `packages/route-sheets/src/runs/` |
| `store.js` (JSON files, output folder) | migration step adding the `rs_` tables; repository reads and writes in storage; the PDF file beside the database | `packages/storage/src/migrations.ts`, `packages/storage/src/routeSheets.ts` |
| `main.js` handlers, `preload.js` | declared channels and handlers, per `docs/PAGE-PATTERN.md` | `apps/desktop/src/shared/channels/routeSheets.ts`, `apps/desktop/src/main/handlers/routeSheets.ts` |
| `renderer/app.js`: Distribute, Route Sheets, History views | the **Route Sheets** page with its three tabs, built on `DataGrid`, the page parts and dialogs the other pages use | `apps/desktop/src/renderer/pages/routeSheets/` |
| `renderer/app.js`: `viewHelp`, import "?" help | a How to use section and `whereToGet` entries (the old help pictures are only Cortex and Slack menus with no names; they can be reused) | `apps/desktop/src/renderer/help/`, `pages/HowToUsePage.tsx` |
| `display.js`, `updater.js`, `releaseNotes.js`, History's output folder | not ported | - |
| `test/core.test.js` (34 tests), `test/fixtures.js` | every test gets a vitest twin with the same name and the same assertions; the synthetic PDF builder becomes the fixture generator | `packages/route-sheets/src/**/*.test.ts`, `packages/fixtures/make-route-sheets.mjs` |

## 5. Non-negotiables (every phase)

1. **Privacy.** No real names, IDs, VINs, emails, phones, station code or user paths anywhere in
   the repository, the PR, commit messages, logs or error text. Examples come from
   `packages/fixtures/manifest.json`; made-up email addresses end in `@example.com`. The old
   app's tests and screens use made-up Gmail addresses as placeholders; `npm run scan` refuses
   those, so the twins use example.com. No Claude session links or session trailers anywhere
   (commits, the PR, this file): `CLAUDE.md` has the rule and the CI scan fails on them.
   `npm run scan` must pass before every commit; in the cloud the CI scan is the gate. The app's
   own logs carry counts and reason codes only.
2. **Plain words** for everything a person reads. `CLAUDE.md` has the rules.
3. **Same answers as the old app.** For the same PDF items, routes, drivers, decisions and pads,
   `distribute` must return the same states, headlines, suggestions, issues and people lists; the
   email HTML and text, the subject, the `.eml` and the summary files must be the same bytes. Port
   the rules; do not improve them. Improvements go in a later release with a note.
4. **Only the differences in section 3.** Any other difference is a "Needs Jonathan" item, not a
   change.
5. **Do not change the load-out side** (matching, assignment, print) or the weekly performance
   side, beyond the mailer move in section 4. A shared helper is fine; say so in the PR.
6. **Nothing leaves the machine** except the update check and the emails the person sends.
7. **One database, one settings file, one email setup.**
8. **Every page is testable without Electron** (handler test with the rig in
   `src/main/stateHost.test.ts`, page test with the stand-in bridge) and **every real-data path
   has a smoke check** in `apps/desktop/scripts/smoke.mjs`.
9. **The release note test** must pass: version `2.3.0` with a What's-new entry written for a
   five-year-old.

## 6. Fixtures and the parity harness

No real file is needed to build this. Everything is made in the cloud:

- **Synthetic route sheet PDFs.** `packages/fixtures/make-route-sheets.mjs` draws
  `packages/fixtures/route-sheets/<day>.pdf` with pdf-lib, one page per route of the fixture Routes
  export for that day (`packages/fixtures/routes/Routes_XXX1_2026-09-01_12_20 (CDT).xlsx` and the
  09-25 one), in the same layout the old app's `test/fixtures.js` draws, in **both** layouts (one
  run per heading, and split runs), with at least: one long route that spills onto a second page,
  one blank trailing page, one page that is not a route sheet, one page whose numbers do not add
  up, one route in the PDF but not on the Routes file, one route on the Routes file but not in the
  PDF, one shared route with a suggested driver, one shared route with no suggestion, one driver
  who is INACTIVE, one Transporter ID not on the driver list, one blank Sort Zone and one blank
  Bag label. Wave times must match the fixture Routes export's dispatch times so pads line up.
  The station on the pages is `XXX1`, the DSP `XXXX`, the names and IDs from the manifest.
- **The old app's own answers.** `scripts/parity/rsd/` holds a vendored copy of the old app's
  `src/core/` at commit `92d21aa` plus `test/fixtures.js`, and `dump.mjs`, which runs the old
  `parseRouteSheetPdf`, `distribute`, `renderEmailHtml`, `renderEmailText`, `buildEml` (with a
  fixed boundary and date), `renderSummaryHtml` and `renderSummaryCsv` over the synthetic set, with
  a fixed set of decisions and pads, and writes `scripts/parity/rsd/expected/*.json|html|txt|csv`.
  The expected files are committed (they are made up). `scripts/parity/rsd/diff.mjs` runs the new
  package over the same inputs and diffs. **An empty diff is the review for the core.**
- The vendored copy is excluded from the installer and from lint; it exists only to answer "what
  did the old app say".
- Demo mode loads the synthetic PDF and the fixture Routes export for the matching day, so a
  trainee can click through Distribute and Sheets without real data.

## 7. How agents are used, and how they are kept on this plan

The plan is carried out by **one orchestrator session** on branch `route-sheets`, with **one draft
pull request** updated after each phase. The orchestrator spawns background subagents only where a
phase below says so. These rules keep the speed without the drift:

1. **The brief is the plan, not a paraphrase.** A subagent's prompt contains, verbatim: the phase
   bullet it owns, section 3 (allowed differences), section 5 (non-negotiables), the stop rules
   below, and the exact list of files it may create or edit. It is told to read `CLAUDE.md`,
   `docs/PAGE-PATTERN.md` and this plan before writing anything. It is never given a summary of
   the old code; it reads the pinned copy itself.
2. **Disjoint files.** Two subagents never own the same file. Shared files (`channels/index.ts`,
   `handlers/index.ts`, `migrations.ts`, `Nav.tsx`, `pages/index.ts`, `settings.ts`) are edited by
   the orchestrator only, before or after the subagents run.
3. **A test is the finish line.** Every bullet names the test or diff that proves it done. A
   subagent stops when that passes, opens nothing, polishes nothing, and reports what it changed
   and what it could not do. The orchestrator runs the full gate (lint, typecheck, test, scan,
   parity diff) itself before committing; a subagent's own claim of green is not trusted.
4. **No product decisions in a subagent.** Anything that is not covered by section 2 or section 3
   is written as a "Needs Jonathan" line in the subagent's report and left undone. The orchestrator
   collects those lines into the PR. Nobody asks Jonathan mid-task.
5. **The old app's tests are the spec for the core.** Each of the 34 tests is ported by name. A
   subagent may not delete, weaken or skip a twin; a twin that cannot pass is a "stuck" report.
6. **Review is one pass, by script first.** The parity diff, the twins, lint, typecheck, scan,
   the Playwright page tests and the smoke check run first. One Opus review pass per phase reads
   only what those cannot judge (plain words, the page, the join with route data). Never a second
   reviewer, never a "critic" agent.
7. **Fix loops are capped at three rounds.** After the third failed fix the agent writes what is
   stuck and what it tried into the PR and stops.
8. **Fresh context per task.** Each subagent starts clean with its brief. The orchestrator does
   not forward chat history.
9. **Model per task** is fixed in each phase heading. Sonnet for near-translation work with a
   diff or a twin test as the judge; Opus for the join with the app's route data and pads, the
   page, and the review passes; Haiku is not used.
10. **Budget rules** are section 9 of `docs/MIGRATION-PLAN.md`: check the weekly usage card
    before launching a phase (phases 1 and 4 up to 80 %, phases 2 and 3 not above 60 %), run in
    the cloud, nobody waits at the keyboard.

Stop rules for every agent: the bullet's finish line is met; three failed fix rounds; a privacy
scan failure (stop at once, never fix around it); any need for a real file, a real name or a
decision.

## 8. Phases (in order, on branch `route-sheets`, one draft PR)

After each phase: lint, typecheck, test, scan, parity diff, commit with a plain-words message,
push, update the PR description (the template's sections, plus a running "Needs Jonathan" and
"Ideas not done"). The next phase does not start until the previous one is green in CI.

### Phase 1 - The core package and the parity harness

Model: **Sonnet** for both subagents (translation with the old tests and the diff as judge).
Coordination: two background subagents in parallel, disjoint files; the orchestrator creates the
package skeleton (`packages/route-sheets`, `@loadout/route-sheets`, copied from the shape of
`packages/performance`) and the parity folder first.

- **Agent 1a - parser and fixtures.** Port `pdfParser.js` as pure functions plus the node item
  extractor; write the fixture generator and the synthetic PDFs (section 6); port the six PDF
  tests and the fallback-path test; the item extractor is tested by reading every synthetic PDF
  and asserting every page passes the number check except the one meant to fail. Files:
  `packages/route-sheets/src/parser/**`, `packages/fixtures/make-route-sheets.mjs`,
  `packages/fixtures/route-sheets/**`, the manifest's `files` list.
- **Agent 1b - matcher, email, export, run rules.** Port `matcher.js`, `namesAgree`,
  `emailRender.js`, `exporter.js`, the two summary renderers, `runIdFor`, `runLabel`,
  `pruneDecisions`, `addMonth`, the "which routes would Email all send" rule and the
  "send problem" rule as pure functions; port the remaining tests (Distribute, Email, EML, pads,
  the date box, the people lists, the sent rules). Files: `packages/route-sheets/src/matcher/**`,
  `src/email/**`, `src/export/**`, `src/runs/**`.
- **Orchestrator, after both:** vendor the old core under `scripts/parity/rsd/`, write
  `dump.mjs` and `diff.mjs`, run the dump, commit the expected files, run the diff.
- **Done when:** every one of the 34 old tests has a passing twin; the parity diff is empty for
  both fixture days and both PDF layouts; `docs/PARITY-ROUTE-SHEETS.md` exists with a checkbox
  per line of section 2, grouped (bringing files in, the number check, Distribute, Sheets, email,
  Export all, History, settings, help) and the core rows are ticked with the test named.

### Phase 2 - Storage, the host, channels and the mailer

Model: **Opus** (this is where the old app's inputs are joined to the app's own route data, driver
list and pads, and where the sending rules meet safe storage). Coordination: a single subagent, or
the orchestrator itself. Review: one Opus pass, plus the handler tests.

- Migration step: `rs_runs` (id, station, date, date label, cycle, pdf file name, imported at,
  page count, warnings, routes file name), `rs_sheets` (run id, route code, the parsed sheet as
  JSON, page numbers), `rs_decisions` (run id, route code, recipients, skipped, manual, via
  suggestion, at), `rs_sent` (run id, route code, how, at, to). Repository reads and writes in
  `packages/storage/src/routeSheets.ts`. The PDF bytes go to `route-sheets/<run id>.pdf` beside
  the database; a run whose PDF file is missing says so in plain words and still shows its sheets.
- `RouteSheetsHost`: holds the open run; builds the matcher's input from the core `AppState`'s
  associates and loaded route set and pads (section 3, items 1 to 3); applies decisions, accept
  suggestions, mark sent; emails over the shared mailer with the attachment and HTML part; Export
  all; removes runs older than 30 days on open (section 3, item 8); the "old app's folder exists"
  note (item 10).
- The mailer move (section 4) with the performance side's tests still green.
- Channels `routeSheets:*` (open run, runs list, load run, new run, delete run, import PDF,
  distribution, preview, decision, accept suggestions, mark sent, copy email, open draft, open
  mail app, save PDF page, view original page, send one, email all, export all) with input checks;
  the snapshot gains `routeSheets` summary counts only (the page asks for the rest with queries).
  The PDF comes in through `files:pick` / `files:import` / `files:dropped` with a new kind
  `route-sheets`, so a page never names a path.
- Settings: the Weekly performance email section becomes **Email** (section 3, item 4); nothing
  else moves.
- **Done when:** handler tests cover every channel through the rig; a storage test round-trips a
  run; a host test proves the join (a fixture day's Routes export + the synthetic PDF + the
  fixture driver list gives the parity harness's distribution, with pads from the route set); the
  performance mailer tests still pass; the parity doc's storage, email and sending rows are
  ticked.

### Phase 3 - The Route Sheets page, teaching, demo mode, the release note

Model: **Opus** for 3a (the page), **Sonnet** for 3b (teaching and release). Coordination: 3a
first (a single subagent), then 3b (a single subagent) once 3a's tab names and test ids are
fixed. Review: one Opus pass over the page, the "no help" wording check.

- **3a - the page.** Route Sheets page with **Distribute**, **Sheets**, **History** tabs, laid out
  as section 2 describes, using `DataGrid` for All routes and History, the page parts and dialogs
  the other pages use, the app's chips and tones for the five states. Drag-and-drop of the PDF
  onto the page. Keyboard reachable. Playwright page tests with the stand-in bridge for each tab
  and each state. The smoke check imports the synthetic PDF through the real bridge, accepts the
  suggestions, previews one sheet, saves one page as a PDF, and runs Export all into a temp
  folder.
- **3b - teaching and release.** A Home checklist step (section 3, item 9); a tour for the page;
  a How to use section ("Sending the route sheets") lifted from the old How to use text, with the
  "where to get the file" pictures; demo mode loads the synthetic day; `docs/NO-HELP-TEST.md`
  gains a route sheets test; version `2.3.0` and its What's-new note; a "Route sheets" part in the
  README in the same voice as the rest.
- **Done when:** the page tests and the smoke check pass in CI; the tours and checklist tests pass;
  help screenshots are regenerated in demo mode; every row of `docs/PARITY-ROUTE-SHEETS.md` is
  ticked or has a reason under "Needs Jonathan".

### Phase 4 - Wrap up

Model: **Sonnet**. The orchestrator itself.

- The PR description is final: What changed, What you'll notice, How it was checked, For whoever
  maintains the app, Needs Jonathan, Ideas not done. Mark the PR ready for review.
- In the old repository: a branch with version `1.6.0` and the single What's-new note (section 3,
  item 11), as a PR for Jonathan to merge after Loadout Builder 2.3.0 is out.

### After the cloud run (Jonathan, on his PC)

1. Merge the Loadout Builder PR; the public repository builds and publishes `v2.3.0`.
2. Run one real day in Loadout Builder with a real route sheet PDF (kept outside the repository),
   next to the old app, and compare: the same routes ready, the same questions asked, the same
   emails. Anything different is an issue, not a note.
3. Merge the old repository's `1.6.0` PR, let it publish, then archive that repository.

## 9. What Jonathan does, and when

Settled on 2026-10-12: the working repository is `JoMoCodes/Loadout-Builder` (public; the private
one stopped at the Weekly Performance merge and keeps only the `legacy/` history); every change in
section 3 is approved; branch protection is already on (a ruleset requires the Privacy scan and
Build and test checks and a pull request). Nothing is needed from Jonathan's PC: no real file, no
old database, no screenshots (the old help pictures were checked and hold no names).

What is left for Jonathan, in order:

1. **Start it.** Check the weekly usage card, then start the cloud session with this plan. The
   session runs phases 1 to 4 on its own. It stops early only for a privacy-scan failure or a
   stuck fix loop, and says so in the PR. If it has to be started again, phases 2 and 3 should not
   begin above 60 % usage.
2. **Read the PR once** when it is marked ready: the "Needs Jonathan" list (expected to be short
   or empty, since section 3 is settled) and the What's-new note. Merge it.
3. **One real day** on his PC with a real route sheet PDF (step 2 of "After the cloud run").
4. **Merge the old app's `1.6.0` PR and archive that repository** once 2.3.0 is out.
