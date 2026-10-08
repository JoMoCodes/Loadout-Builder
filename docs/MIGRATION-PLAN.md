# Loadout Builder v2 - migration plan

This plan is written for Opus agents carrying out the migration. It is the single source of
truth for scope, order of work, and what "done" means for each phase. Read it fully before
starting any phase. The person who owns the product is Jonathan (a dispatcher, not a
programmer). The people who will use the app are dispatchers, leads and managers at an
Amazon DSP. They are not programmers either.

Status: **Approved.** Jonathan confirmed Electron + React + TypeScript on 2026-10-08.
Phase 0 is next and runs on Jonathan's PC. Everything after it runs in the cloud.

---

## 1. Why we are migrating

The current app (`loadout_builder/`, ~14.4k lines of Python + tkinter, SQLite) works but:

- A newbie cannot install it. It needs Python 3.10+, pip, and a terminal.
- There is no update path. Changes have to be hand-copied.
- tkinter caps the UI. Jonathan's manager wants an "easy-to-use experience" for everyone
  who isn't Jonathan, and tkinter/Excel made that too expensive to reach.
- A prior port to Excel/VBA ("Simplicity", ~50k lines) proved the domain logic again but
  moved slowly for the same reasons.

The sister app **Route Sheet Distributor** (github.com/JoMoCodes/Route-Sheets-Distributor,
Electron, v1.4.1) already solves install, auto-update, plain-English release notes and a
"How to use" page for the same users. Non-technical coworkers install it from a GitHub
Release and it updates itself. That is the bar, and we reuse its machinery wherever possible.

## 2. Stack decision

### Options considered

| | A. Electron + React/TS | B. Tauri 2 + React/TS | C. .NET WPF / WinUI 3 | D. Web app (Next.js + hosted DB) |
|---|---|---|---|---|
| Install for a newbie | One `.exe`, same as Route Sheet Distributor. Portable `.exe` fallback for locked-down PCs. | One `.exe`. Needs WebView2 (present on Win10/11). | One `.exe` or MSIX. | Nothing to install. Just a link. |
| Auto-update | Proven: `electron-updater` + GitHub Releases + GitHub Actions. Already running for RSD. | Works (Tauri updater) but needs signing keypair + manifest; new ground for this team. | Needs Velopack/Squirrel or MSIX; new ground. | Instant for everyone on deploy. |
| UI / UX ceiling | Highest. Full web ecosystem (shadcn/ui, TanStack Table, driver.js tours). Mobbin patterns map 1:1. | Same as A. | Good but styling costs more; fewer ready-made parts. | Same as A. |
| Reuse from existing apps | Lift updater, release-notes, help, font-size, high-contrast code from RSD. | Partial (renderer only). | Could share code with the Weekly Performance App (WPF). | Partial (renderer only). |
| Future: scheduling, SMS | Node side can call Twilio; a scheduling page is just another React route. | Same, via Rust or JS. | Possible. | Most natural (multi-user, phone-friendly). |
| Future: consolidate with Weekly Performance App | WPA is WPF/.NET; it would be re-ported into the shell later, or kept separate. | Same. | Easiest: same tech. | Same as A. |
| Data stays on the PC | Yes. SQLite in `%APPDATA%`. | Yes. | Yes. | **No.** Associate data (names, Transporter IDs, qualifications) would live on a server. Needs auth, hosting, and a compliance answer. |
| Agent-friendliness | High. TS everywhere, huge training corpus, easy to debug. | Rust backend is harder for agents to debug. | Medium. | High. |
| Install size | ~150-200 MB. Nobody has complained for RSD. | ~10-20 MB. | ~50-150 MB. | n/a |

### Recommendation: **A. Electron + React + TypeScript**

Reasons, in order of weight:

1. Route Sheet Distributor already proved this exact install/update/release story with the
   same users. We do not want two different install stories in the same office.
2. Same release ritual Jonathan already knows: bump version, write a plain-English note,
   push to `main`, GitHub builds and publishes.
3. The UI ceiling is the highest of the four, which is the manager's actual ask.
4. Scheduling and SMS come later as pages and a Node integration, not a rewrite. If a
   phone-friendly multi-user view is wanted one day, the React screens and the TS core move
   to a web app with the Electron shell swapped out.
5. Data stays on the machine, so no new privacy conversation with the DSP.

If Jonathan chooses C (to consolidate with the Weekly Performance App now), phases 0-2 are
unchanged and the shell phases are rewritten for WPF. If D, we need a hosting and data
residency decision first.

### Concrete stack (option A)

- **Shell:** Electron (latest stable), `electron-builder` (NSIS installer + portable),
  `electron-updater` publishing to GitHub Releases. Same `build-windows.yml` as RSD.
- **UI:** React 19 + TypeScript + Vite. Tailwind + shadcn/ui components. TanStack Table for
  the roster grids (column drag/resize/sort persisted, like the current app). `driver.js` for
  spotlight tours. Lucide icons.
- **Core:** `packages/core` - pure TypeScript, no Electron or DOM imports. Holds models,
  importers, matching, tenure, van assignment, DWP/route bring-over, export layout, print
  pagination. This is what gets ported from Python and what any future app reuses.
- **Storage:** SQLite via `better-sqlite3` in `%APPDATA%\Loadout Builder\data\loadout.db`.
  Schema migrations via a small versioned migration runner (no ORM).
- **Files:** `exceljs` or `read-excel-file` for `.xlsx`, `papaparse` for `.csv`, `pdf-lib` or
  Chromium's `printToPDF` for the printed roster (decide in phase 4; RSD uses `pdf-lib`).
- **Tests:** `vitest` for core, Playwright for a smoke run of the shell. Fixtures are
  anonymised real exports (see section 6).
- **Repo layout:**

```
apps/desktop/        Electron main + preload + renderer (React)
packages/core/       pure TS domain logic + tests
packages/fixtures/   anonymised export files used by tests and the demo mode
docs/                this plan, ADRs, help screenshots
legacy/python/       the current Python app, kept read-only until parity is signed off
```

## 3. Non-negotiables (apply to every phase)

1. **Plain words for users.** Everything a user reads (buttons, errors, release notes, help,
   PR summaries) follows RSD's `CLAUDE.md` rule: say what changed for the person, no code
   words. Copy that file into this repo in phase 0.
2. **Feature parity before polish.** The Python README (`README.md`, ~47k chars) is the
   functional spec. Every behaviour it describes must exist in v2 or be listed in
   `docs/PARITY.md` as deliberately dropped with a reason Jonathan has approved.
3. **Never guess on a match.** The matching, linking and van-assignment rules in Python are
   the rules. Port them, do not "improve" them. Improvements go in a later release with a note.
4. **Nothing leaves the machine.** No telemetry, no cloud storage. The only network calls are
   the update check to GitHub.
5. **Hold their hand, then get out of the way.** First run is guided (section 5). Everything
   the guide shows can be reopened from Help at any time.
6. **Every release ships a What's-new note** written for a five-year-old, shown once after
   update, and kept on a Features log page. Tests fail if the note for the current version is
   missing (copy RSD's test).

## 4. Phases

Phases 0-2 are independent of the shell and can run in parallel with phase 3. Each phase
names its inputs, outputs and the check that proves it done. Agents work in feature branches
and open PRs with the RSD PR template; Jonathan merges.

### Phase 0 - Foundation (1 agent)

Model: **Sonnet** (scaffolding and copying from RSD). Haiku for the privacy scan script.
Coordination: a single subagent. Review: one Opus pass.

- Create the monorepo layout above. Move the Python app to `legacy/python/` unchanged;
  keep `run.py` working from there.
- Copy from RSD: `CLAUDE.md`, `.github/pull_request_template.md`,
  `.github/workflows/build-windows.yml`, `src/updater.js` (convert to TS),
  `src/core/releaseNotes.js` (convert to TS, start at `2.0.0` with one entry).
- Set up `vitest`, ESLint, Prettier, `npm test`, `npm start`, `npm run dist`.
- Write `docs/PARITY.md`: a checklist of every feature in the Python README, grouped by
  page, each with a checkbox. This is the contract every later phase ticks off.
- Put the privacy guardrails in place (section 8): `.gitignore`, the pre-commit scan, the CI
  scan, the fixture anonymiser and its manifest, and the "no real data" rule in `CLAUDE.md`.
- Scrub the README: delete the "What the current data says" section and any other real
  names, IDs, dates or station codes. Rewrite the two code comments that quote a real driver
  name (`matching.py` line 3, `state.py` line 320) to use a made-up name.
- **Done when:** `npm test` passes with one trivial core test, `npm start` opens an empty
  Electron window titled "Loadout Builder", CI is green on a push, and the privacy scan
  passes on the whole repo.

### Phase 1 - Core models and importers (2 agents in parallel)

Model: **Sonnet** for both agents (near-translation work with clear fixtures).
Coordination: two subagents or a workflow, not a team. Review: one Opus pass over both PRs.

Port, with tests, from Python:

- **Agent 1a - models + importers:** `models.py` (DriverRow, Roster, Associate,
  AssociateBook, TenureRecord/Book, RouteEntry/RouteDataSet, DwpEntry/DwpDataSet, Vehicle,
  VehicleFleet, VanAffinity, service-type helpers, natural sort keys, clock parsing);
  `importer.py` (load-out sheet), `associates.py`, `tenure.py`, `vehicles.py`, `dwp.py`,
  `routedata.py` (routes, itineraries, schedule). Each importer's header aliases, date-from-
  filename rules and error messages must match the Python behaviour exactly.
- **Agent 1b - storage:** `storage.py` schema (23 tables, see the `CREATE TABLE` list) as SQL
  migrations in TS; a repository layer; a one-time **importer for the existing Python
  `loadout.db`** so Jonathan's current data (associates, links, vehicles, affinities, print
  layouts, previous roster) carries over on first run.
- **Done when:** every importer has a test per fixture file that asserts row counts and a
  sample of parsed fields against values hand-checked from the Python app; the v1 DB importer
  round-trips Jonathan's real `data/loadout.db` (from `%USERPROFILE%\OneDrive\Desktop App - Loadout Builder`)
  with identical counts per table.

### Phase 2 - Core logic (2 agents in parallel, after 1a)

Model: **Opus** for both agents (matching, assignment and print math are the product).
Sonnet writes the parity harness. Coordination: a workflow (port a module, diff against
Python, fix, re-diff; cap at three fix rounds per module). Review: the parity diff is the
review. One Opus pass only on modules whose diff would not go to zero.

- **Agent 2a - matching, links, tenure, bring-over:** `matching.py` (name normalisation,
  AssociateIndex, match_driver, match_roster, summarise), driver links, tenure lookup,
  `state.py` bring-over of route data and DWP, previous-roster carry-over.
- **Agent 2b - van assignment + export layout:** `assignment.py` (Candidate, eligibility,
  why-not reasons, plan), available-vans logic, LMR approvals, vehicle overrides and
  priorities; `export.py` row/column layout; `printing.py` PrintSpec, geometry, column
  widths, bands, pagination (pure math, no PDF yet).
- **Parity harness:** write a script that runs the Python app's logic and the TS core on the
  same fixture set and diffs the outputs (match results, assignment table, export rows,
  page counts). This is the equivalent of Simplicity's 50-step smoke test.
- **Done when:** parity diff is empty for every fixture day, and `docs/PARITY.md` has every
  logic row ticked.

### Phase 3 - Shell and first screens (2 agents in parallel with phase 2)

Model: **Sonnet** for 3a (shell, mostly lifted from RSD). **Opus** for 3b (the grid and
design system are where the manager's "easy to use" ask is won or lost).
Coordination: an agent team with phase 4, so 3b can ask the core agents about types.
Review: one Opus pass.

- **Agent 3a - app shell:** Electron main/preload/IPC, window state, left-nav layout (pages:
  Home, Load Out, Route Data, Vehicle Data, Associates, Previous Roster, How to use,
  Features log, Settings), theme (light/dark/high contrast), font-size A+/A- (lift from RSD),
  updater status pill and "Restart to update" button, What's-new dialog, Features log page,
  "Open data folder".
- **Agent 3b - design system + grid:** shadcn/ui setup, tokens, the reusable data grid
  (TanStack Table) with column drag, resize, sort, per-table persisted layout, right-click
  context menus per column, "Needs attention" filter, free-text search, status chips.
  Reference screens: Mobbin "operations table" patterns (dense rows, coloured status chips,
  filter bar on top, detail panel on the right).
- **Done when:** the shell runs with a fake data source, the grid handles 200 rows without
  jank, keyboard navigation works, and a Playwright smoke test opens every page.

### Phase 4 - Feature pages (3 agents, after phases 2 and 3)

Model: **Opus** for 4a (Load Out, the most logic-heavy page) and 4b (print fidelity).
**Sonnet** for 4c. Coordination: agent team (shared task list, teammates ask each other
rather than guessing). Review: one Opus pass per PR, then Jonathan's real-day test.

- **Agent 4a - Load Out:** Roster tab (import, bring over route data, bring over DWP,
  assign vans, clear, filters, right-click actions, "Matched On" column, hand moves), Available
  Vans tab, Previous Roster tab, link dialog, driver dialog, van pick / roster pick dialogs,
  assign result dialog.
- **Agent 4b - Print + Export:** Print tab with the layout editor (columns, page setup, who
  prints, saved layouts), live preview, PDF and XLSX export with and without DWP. Decide
  `printToPDF` vs `pdf-lib` by matching the current output on the fixture day.
- **Agent 4c - Route Data, DWP, Vehicle Data, Associates, LMR:** the remaining pages and their
  dialogs (PAD assignment, shared routes, source picker, vehicle priorities/overrides, LMR
  approvals, affinity).
- **Done when:** every page row in `docs/PARITY.md` is ticked, and Jonathan runs one real day
  end to end in v2 and gets the same printed roster as the Python app.

### Phase 5 - Hand-holding (1 agent, after phase 4)

Model: **Opus** (plain-words copy and the first-run flow need judgement, not volume).
Coordination: a single subagent. Review: the "no help" test with a real lead or dispatcher.

See section 5. Done when a person who has never seen the app can import a load-out sheet
and print a roster using only what the app shows them, with no one helping. Test it with a
lead or new dispatcher, not Jonathan.

### Phase 6 - Release (1 agent)

Model: **Sonnet**. Coordination: a single subagent. Review: the privacy gate and the VM
install test, both scripts, plus Jonathan's sign-off before the public push.

- Version `2.0.0`, release note, icon, installer name `Loadout-Builder-Setup-<v>.exe`, portable
  build, README install steps copied from RSD's wording.
- First-run migration from the Python DB, with a plain-words dialog ("We found your old
  roster data. Bring it over?").
- Code signing is out of scope (same as RSD); README explains the SmartScreen click-through.
- **Going public.** Auto-update needs a public repo. Do not flip this repo to public. Its
  first commit already contains real names, so the history is tainted. Instead, create a new
  public repo (`JoMoCodes/Loadout-Builder` can be renamed to `Loadout-Builder-private` and
  archived) and push a single squashed, scanned commit from the migration branch. The
  `legacy/python/` folder is **left out** of that commit (decided 2026-10-08): the public
  repo holds only the Electron app, and the Python version stays in the private repo's
  history. Run the section 8 gate on that commit before the first push. Then enable Discussions with the
  "don't paste rosters here" pinned note.
- **Done when:** a fresh Windows 10 VM installs from the GitHub Release, auto-updates to a
  `2.0.1` test release, the What's-new dialog shows once, and the public repo's full history
  passes the privacy scan.

### Later (not in this migration)

Scheduling, SMS, and folding in the Weekly Performance App. The `packages/core` boundary and
the left-nav shell are designed so these are new pages plus a Node integration, not rewrites.

## 5. Hand-holding spec (phase 5)

Three layers, all reopenable from **How to use** in the left menu:

1. **First-run checklist panel** (right side of Home). Five steps that tick themselves off
   as the app detects them done: *Bring in your driver list* > *Bring in your vans* >
   *Bring in today's load-out sheet* > *Bring over route data* > *Assign vans and print*.
   Each step has a one-line "why", a button that does the thing, and a **?** that shows where
   to download that file with a screenshot (as RSD 1.2.1 does). Progress bar on top. Hides
   itself once complete; **Show the checklist again** lives in How to use.
   Reference: beehiiv's "Get ready to publish" panel - https://mobbin.com/flows/2e01960d-3001-4150-9de1-f4e1fa95a825
2. **Spotlight tour per page** (driver.js). First visit to each page runs a 3-6 step
   tooltip tour over the real controls, with Back / Next / Skip and a step counter. Stored per
   user so it only auto-runs once. **Take the tour** button on every page's help menu.
   References: Canva - https://mobbin.com/flows/d3237fe5-9e7c-47ec-89e6-56ccfd951dc1 ,
   Pitch - https://mobbin.com/flows/f9bed0ed-a493-4d72-845e-15ffffd204cd ,
   Amplitude - https://mobbin.com/flows/881b4177-a000-4707-8129-4467c1d14e36
3. **How to use page.** Step-by-step for a normal day, what the colours mean, what to do when
   something goes wrong, and an **Ask a question** link to GitHub Discussions. Lift the
   structure from RSD 1.3.0.

Plus **What's new** after every update (section 3, item 6), and a **demo mode** that loads
the anonymised fixtures so a trainee can click around without touching real data.

## 6. Fixtures and real data

Agents need real-shaped exports. Sources on Jonathan's machine:

- `%USERPROFILE%\OneDrive\Microsoft Excel - Simplicity\tests\fixtures` (and `import`,
  `parity`, `probes`) - the Excel port's test inputs.
- `%USERPROFILE%\OneDrive\Desktop App - Loadout Builder\data\loadout.db` - a real v1 database.
- Downloads folder exports: DSP Workplace load-out sheet, Amazon associate export, tenure
  export, routes / itineraries / schedule exports, DWP sheet, vehicle export.

Phase 0 copies them into `packages/fixtures/` **after anonymising**: replace names with
generated ones, Transporter IDs with fake IDs of the same shape, VINs with fake VINs, keep
dates, wave times, service types, route codes and counts. Write the anonymiser as a script
so new fixture days can be added later. Real files never get committed.

## 7. What Jonathan needs to decide or provide

1. ~~Confirm the stack.~~ Done: Electron + React + TypeScript (2026-10-08).
2. Confirm the app is Windows-only and data stays on the PC. The repo stays **private** until
   the section 8 gate passes, then a fresh public repo is created for releases (free
   auto-update needs a public repo, same as RSD).
3. Drop at least one full day of exports into a folder for fixtures.
4. Name one lead or new dispatcher who will do the phase-5 "no help" test.
5. Confirm which Python-README features, if any, can be dropped (default: none).

## 8. Keeping private data out of the public repo

What counts as private: driver and associate names, Transporter IDs, phone numbers, email
addresses, ID or licence expiry dates, VINs and plate numbers, the station code, van
nicknames that identify a person, anything from Cortex or DSP Workplace exports, Jonathan's
own email, and any secret (Gmail app password, future SMS API key).

What is already exposed today (repo is private, so not yet public): the README's "What the
current data says" section names five real people, one ID expiry date, the station code and
van registration dates. Two code comments quote a real driver's name. All of it sits in the
first commit, so it stays in history until the history is replaced (phase 6).

Guardrails, in order of when they catch a leak:

1. **Never in the working tree.** `.gitignore` excludes `data/`, `legacy/python/data/`,
   `*.db*`, `*.xlsx`, `*.xlsm`, `*.csv`, `*.pdf` everywhere except `packages/fixtures/`,
   plus `.env*`, `*.lnk`, and any `exports/` or `downloads/` folder. Real exports are only
   ever read from outside the repo (the Downloads folder or a path in a gitignored
   `local.config.json`).
2. **Fixtures are generated, never copied.** `packages/fixtures/anonymise.ts` reads real
   exports from a path outside the repo and writes anonymised copies plus a
   `manifest.json` listing every fake name, fake Transporter ID and fake VIN it produced.
   Fake IDs keep the real shape (learn the shape from one real export and encode it as a
   regex in the script). Real values are never written anywhere inside the repo.
3. **Pre-commit scan (local).** A git hook runs `gitleaks` for secrets and a PII scan that
   fails the commit if any staged text contains: a Transporter-ID-shaped or VIN-shaped token
   not in `manifest.json`; an email address; a 10-digit phone number; the station code; or a
   name from a **local, gitignored denylist** (`.private/real-names.txt`, built from the real
   associate export by a script Jonathan runs once). The denylist never leaves the machine.
4. **CI scan (public).** The same scan runs in GitHub Actions without the denylist: secrets,
   ID/VIN shapes outside the manifest, emails, phones, station code. The build and release
   jobs depend on it passing.
5. **Writing rule.** `CLAUDE.md` gains: no real driver names, IDs, station codes or
   screenshots of real data in code, comments, tests, PRs, issues, release notes, help
   pages or Discussions. Help screenshots are taken in demo mode. Agents must use names from
   the fixture manifest in examples.
6. **The app itself.** Logs and diagnostics never include names or IDs (log row counts and
   reason codes instead). No crash reporting service. Secrets (email app password, future SMS
   keys) are stored with Electron `safeStorage`, as RSD does, never in config files that
   could be shared. Exported rosters and PDFs go to the user's chosen folder, not the app
   folder.
7. **Discussions and issues.** The "Ask a question" page and the pinned Discussions post tell
   users to describe the problem in words and never paste a roster, screenshot or export,
   because the forum is public.
8. **Before going public (phase 6 gate).** Run the full scan over every commit of the branch
   that will become the public history, confirm the README and comments are clean, and only
   then push to the new public repo. Nobody flips the existing repo to public.

Same rules apply to Route Sheet Distributor, which is already public. Its help screenshots
(`src/renderer/help/cortex-*.png`) should be checked for real names once, outside this plan.

## 9. Budget and pacing

The Excel port took one 34-hour sitting and ran out of plan usage with 36 review findings
unaddressed. The account is on the Max plan, so the binding limit is the **weekly** window
(resets Fridays, 11am Central). These rules exist so no phase repeats that.

### Nobody waits at the keyboard

- Phases run as background work: workflows, background subagents, or scheduled cloud
  routines that start one phase overnight and leave a PR. Sessions may be moved to the cloud
  so Jonathan's PC need not stay on.
- Every agent task ends in a commit and a PR. An interrupted phase loses one task, never a day.
- Agents never wait on Jonathan mid-task. Anything that needs his decision is written into the
  PR description under "Needs Jonathan" and the agent stops.

### Run in the cloud by default

Jonathan should be able to start, watch and review phases from any computer or his phone,
and the work should not depend on one PC staying on. So:

- **Where phases run.** Every phase from 1 onward runs as a cloud session or a scheduled cloud
  routine against the GitHub repo, not on Jonathan's PC. Phase 0 is the exception: it needs
  his machine once, to read the real exports and the v1 database and produce the anonymised
  fixtures (section 6). After that commit, nothing in the plan needs a local file.
- **What the cloud can't see.** OneDrive, the Downloads folder, the Simplicity fixtures and
  `loadout.db` are local. Any task that needs them is a phase 0 task. Agents in the cloud
  must never ask Jonathan to upload a real export into a session; they ask for a new
  anonymised fixture, produced locally by the phase 0 script.
- **Privacy gate in the cloud.** The pre-commit hook (section 8, item 3) only runs on
  Jonathan's PC. For cloud sessions the CI scan is the gate, so it must block merges, not
  just report. Branch protection on `main` requires the scan job to pass.
- **Building the installer.** `npm run dist` is Windows-only. Cloud sessions never build the
  installer; GitHub Actions does, on push, exactly as RSD does today.
- **Coordination in the cloud.** Workflows and single subagents are supported in cloud
  sessions. Whether agent teams (phases 3-4) can run in a cloud session is not confirmed in
  the docs at the time of writing. If they cannot, phases 3-4 run as a workflow instead, with
  the grid agent reading the core's type file rather than asking the core agent.
- **Following along.** Jonathan watches from the Claude app on any device. Each task's PR is
  the hand-off point, so picking up on another computer means opening the PR, not the session.

### Spend less per phase

- **Model per task** is fixed in each phase heading above. Summary: Sonnet for translation,
  scaffolding, pages with little logic, tests and release work; Opus for matching, assignment,
  print math, the grid, Load Out, hand-holding copy and all review passes; Haiku for scans.
  Do not upgrade a task's model without a reason written in the PR.
- **Scripts review before people do.** The parity harness, the privacy scan, vitest and the
  Playwright smoke test run first. An Opus review pass reads only what those cannot judge.
  Never more than one review pass per PR, no multi-lens review, no separate "critic" agent.
- **Fix loops are capped at three rounds.** After the third failed fix the agent writes what
  is stuck and what it tried into the PR and stops.
- **Fresh session per task.** Each agent starts clean and reads this plan, `docs/PARITY.md`
  and the previous PR. No task depends on chat history. Long sessions re-send their whole
  context on every call and are the fastest way to burn the week.
- **Teams only in phases 3-4.** Agent teams cost more because every teammate carries a full
  context. Phases 0-2 and 5-6 use single subagents or a workflow.
- **Generate less.** Port, don't redesign. Lift the updater, release notes, help, font-size,
  high-contrast and CI from Route Sheet Distributor verbatim before writing anything new.

### Pace against the window

- Before launching a phase, check the usage card. Do not start phases 2, 3 or 4 above 60%
  weekly usage. Phases 0, 1, 5 and 6 may start up to 80%.
- Schedule the heaviest phases (2 and 4) to begin right after a Friday reset.
- Suggested cadence: one heavy phase or two light phases per weekly window. Phases 1 and 3
  can share a window because they are Sonnet-heavy.
- Extra usage is off on the account. Turning it on with a dollar cap is Jonathan's call and
  is only worth considering for phase 6, where an interruption means a half-published release.

### Stop rules for agents

1. The phase's "Done when" is met: stop, open the PR, do not polish.
2. Three failed fix rounds on one problem: stop and write it up.
3. A privacy-scan failure: stop immediately, do not try to "fix around" the scan.
4. Any need for a real export, a real name or a decision: stop and ask in the PR.
