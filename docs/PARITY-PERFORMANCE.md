# Parity checklist: everything the old Weekly Performance App does

**Tick a box only when the feature exists in the new app and a test proves it.**

This is the list of everything the old Weekly Performance App (`legacy/wpa/src`) does that a person
can see or use. A phase ticks a row when the feature exists and is tested, and says which test in
the same pull request. A row still unticked at the end needs a reason under "Needs Jonathan" in the
pull request. The plan behind it is [`docs/WPA-MIGRATION-PLAN.md`](WPA-MIGRATION-PLAN.md).

---

## 1. Importers

### All importers

- [x] Each kind of export is brought in from a folder you pick (the thresholds are a single
      file). `MainWindow.xaml.cs` Test: `src/main/performance.test.ts`,
      `e2e/performance-imports.spec.ts`. The roster is not one of these kinds any more: see
      "Roster (associates)" below.
- [x] The week comes from the file name and is always written as year, "W" and a two-digit week
      (for example 2026-W07), so weeks sort and line up across exports. `WeekMath.cs`
- [x] Bringing in a week again replaces that week's data instead of adding a second copy.
      `ScorecardImporter.cs` Test: `packages/storage/src/performance.test.ts`.
- [x] One bad file does not stop the others; it is listed as a problem and the rest come in.
      `ScorecardImporter.cs`
- [x] A file with no week in its name is refused with a message that says what name was expected.
      `CdfImporter.cs`
- [x] Each import ends with a summary: files read, rows brought in, new drivers and which weeks,
      plus any problems. `MainWindow.xaml.cs` Test: `e2e/performance-imports.spec.ts`,
      `src/renderer/pages/performance/perfText.test.ts`.
- [x] The import buttons are greyed out while an import is running, so two cannot run at once.
      `MainWindow.xaml.cs` Test: `e2e/performance-imports.spec.ts`, `src/main/performance.test.ts`.
- [x] The folder picked for each kind is remembered and offered first next time.
      `MainWindow.xaml.cs` Test: `src/main/performance.test.ts`.

### Scorecards

- [x] Every weekly scorecard file in the folder is brought in. `ScorecardImporter.cs`
- [x] A driver seen for the first time is added to the driver list (the Associates list, by name
      alone, marked OFFBOARDED until an associate export names them; a driver already on the list
      is left as the list has them, where the old app replaced their name).
      `ScorecardImporter.cs` Test: `packages/storage/src/performance.test.ts`,
      `src/main/stateHost.test.ts`.
- [x] Each week keeps the driver's Overall Standing (tier), Overall Score and Packages Delivered.
      `ScorecardImporter.cs`
- [x] Each week keeps all twelve metrics (the safety driving score, the five safety rates, CDF,
      CED, DCR, DSB, POD and PSB), each with its value, tier, score and weight. `Models.cs`
- [x] A metric column missing from a file leaves that one value empty instead of failing the file
      (Amazon adds columns a bit at a time). `ScorecardImporter.cs`
- [x] The driver name column is found with or without the stray space Amazon puts at the end of
      its heading. `ScorecardImporter.cs`
- [x] The file each week came from is kept, so the check file can show it. `ScorecardImporter.cs`

### Roster (associates)

Since 2.4.0 there is one driver list for the whole app: the Associates page's list (the
`associates` table). The Performance page reads it; the old `perf_drivers` copy was folded into it
by database step 4 (`packages/storage/src/migrations.ts`) and dropped. So the roster is brought in
on Associates, not on the Imports tab.

- [x] One roster file is picked (Import Associates on the Associates page, or Ctrl+I from any
      page). `MainWindow.xaml.cs` Test: `src/main/stateHost.test.ts`,
      `e2e/associates.spec.ts`.
- [x] Each driver's name, status, position, qualifications, ID expiry, personal phone, work phone
      and email are brought in or updated. Anyone with a Transporter ID the file no longer lists
      stays, marked OFFBOARDED (the old app kept them with their last status).
      `AssociateImporter.cs` Test: `packages/core/src/state/appState.test.ts`.
- [x] The summary says how many drivers were new, how many were updated, and how many were marked
      offboarded (the old app counted active and inactive instead). `MainWindow.xaml.cs` Test:
      `src/renderer/pages/pageHelpers.test.ts`.
- [x] A driver with no status is treated as Offboarded. `Models.cs`
- [ ] The roster file picked is remembered so auto-import can bring it in again when it changes.
      `MainWindow.xaml.cs` Not carried over: the driver list is brought in by hand on Associates,
      like the vans. A roster folder left in an older settings file is ignored.
- [x] The old app's Drivers table comes over into the Associates list when its data is brought
      over (a driver already on the list is left as the list has them).
      Test: `packages/storage/src/importWpa.test.ts`.

### Thresholds

- [x] One thresholds file (the scoring metadata export) is brought in from the Metric Thresholds
      window. `ThresholdsWindow.xaml.cs` Test: `e2e/performance-reports.spec.ts`.
- [x] It replaces all the thresholds there; only one set is kept, with no history.
      `ThresholdImporter.cs` Test: `packages/storage/src/performance.test.ts`,
      `e2e/performance-reports.spec.ts`.
- [x] Amazon's long metric names are turned into the short names used everywhere else.
      `Models.cs`
- [x] The safety driving score row and rows the app does not track are skipped and counted.
      `ThresholdImporter.cs`
- [x] Each threshold keeps the Platinum, Gold, Silver and Bronze cut-offs, the weight, and whether
      higher or lower is better. `ThresholdImporter.cs`
- [x] The week the thresholds came from and when they were brought in are kept and shown.
      `ThresholdsWindow.xaml.cs` Test: `packages/storage/src/performance.test.ts`,
      `src/main/performance.test.ts`, `e2e/performance-imports.spec.ts`.

### POD (photo on delivery PDFs)

- [x] Every POD details PDF in the folder is read; the week comes from "Week" and the number in
      the file name. `PodImporter.cs`
- [x] The driver table is found on the PDF's pages by lining up words into rows and finding the
      Transporter ID in each row. `PodImporter.cs`
- [x] Each driver's opportunities, successes, bypasses, rejects and the nine reject reasons are
      kept for the week. `PodImporter.cs`
- [x] Pages with no driver rows (the cover page, the sample photos) are passed over quietly.
      `PodImporter.cs`

### CDF (customer delivery feedback)

- [x] Every negative feedback file in the folder is read. `CdfImporter.cs`
- [x] Feedback is added up per driver per week across the six reasons (mishandled package,
      unprofessional, did not follow instructions, wrong address, never received, wrong item).
      `CdfImporter.cs`
- [x] A blank or odd cell counts as zero. `CdfImporter.cs`

### DSB (delivery concessions)

- [x] Every delivery concessions file in the folder is read. `DsbImporter.cs`
- [x] Only rows that count against the scorecard are added up; the column is found under either
      of the two names Amazon has used. `DsbImporter.cs`
- [x] The six behaviours are added up per driver per week. `DsbImporter.cs`

### PSB (pickup failures)

- [x] Every pickup failures file in the folder is read. `PsbImporter.cs`
- [x] The seven failure reasons are added up per driver per week. `PsbImporter.cs`
- [x] The driver ID is found even if Amazon swaps the two driver columns. `PsbImporter.cs`
- [x] A week is remembered as brought in even when its file has no failures, so the report can
      tell "no failures" from "no file". `PsbImporter.cs`

### DCR events (returned packages)

- [x] Every returned-to-station file in the folder is read; the week is found in the name with or
      without the dash. `DcrImporter.cs`
- [x] Each returned package is kept on its own (not added up), because the report lists each one.
      `DcrImporter.cs`
- [x] The columns are found under every name Amazon has used, so a folder that mixes old and new
      files comes in cleanly. `DcrImporter.cs`
- [x] Whether each return counted against the driver is kept. `DcrImporter.cs`
- [ ] A file that is still open in Excel can still be read. `DcrImporter.cs`
      Not ticked: this can only be checked on a Windows computer with the file open in Excel. The
      app reads files without locking them, the way the old app did, but no test here runs on
      Windows with Excel. Jonathan, please try it once.

### DCR weekly totals

- [x] Every DCR weekly totals file in the folder is read. `DcrTotalsImporter.cs`
- [x] Each driver's weekly completion figure, packages dispatched, delivered, returned, returned
      by the driver's own doing, rescued, and all exempted are kept. `DcrTotalsImporter.cs`
- [x] The completion figure is found under its new name or its old one. `DcrTotalsImporter.cs`

### Safety (camera events)

- [x] Every safety dashboard file in the folder is read. `SafetyImporter.cs`
- [x] Each event is kept on its own with its date, type, subtype, program impact, source, video
      link and review details. `SafetyImporter.cs`
- [x] Every event is kept, including those with no program impact; only the counts leave those
      out. `SafetyImporter.cs`
- [x] Safety events show on the Drivers grid only, never in the PDF report. `SafetyImporter.cs`
      Test: `src/main/performance/report/report.test.ts`, `e2e/performance-drivers.spec.ts`.

## 2. Drivers grid

### The table

- [x] One row per driver, with a tick box in the first column. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`.
- [x] Columns: Driver, Transporter ID, Status, Latest Week, Latest Tier, Latest Score, Latest Rank
      and Latest Packages. `MainWindow.xaml` Test: `e2e/performance-drivers.spec.ts`.
- [x] Latest Tier is shown in that tier's colour. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`, `src/renderer/pages/performance/perfText.test.ts`.
- [x] Rank reads as "place / out of how many" and is by Overall Score, then Packages Delivered to
      break ties, among drivers with a score that week. `DriverRepository.cs` Test:
      `packages/performance/src/analysis/analysis.test.ts`, `e2e/performance-drivers.spec.ts`.
- [x] Average columns over the chosen weeks: Score, Rank, Packages, CDF, DSB, Delivery Completion,
      POD, PSB and CED. `MainWindow.xaml` Test: `src/main/performance.test.ts`,
      `e2e/performance-drivers.spec.ts`.
- [x] An average leaves out weeks with no value, and shows a dash when there is nothing to average.
      `DriverRepository.cs` Test: `packages/performance/src/analysis/parity.test.ts`,
      `src/main/performance.test.ts`.
- [x] Score change column: the latest week's score minus the week before it, within the chosen
      weeks. `FleetRepository.cs` Test: `packages/performance/src/analysis/parity.test.ts`,
      `e2e/performance-drivers.spec.ts`.
- [x] Trend column: improving, declining or flat across the chosen weeks, with the word on hover.
      `FleetRepository.cs` Test: `packages/performance/src/analysis/parity.test.ts`,
      `e2e/performance-drivers.spec.ts`.
- [x] Safety columns: Program Impact total, Speeding, Sign Signal, Distraction, Following Distance
      and Seatbelt, counted over the chosen weeks. `MainWindow.xaml` Test:
      `src/main/performance.test.ts`, `e2e/performance-drivers.spec.ts`.
- [x] Safety counts leave out events with no program impact. `DriverRepository.cs` Test:
      `packages/performance/src/analysis/analysis.test.ts`.
- [x] A safety count above zero is a red link. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`.
- [x] Every column sorts by its number, not its text. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`, `src/renderer/components/DataGrid/sort.test.ts`.
- [x] With no drivers yet, the table says so and says how to bring some in. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`.

### Weeks and filters

- [x] From and To week pickers list every week brought in. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`.
- [ ] The weeks start as the newest 7 (or all, if fewer), and a choice that is still valid is kept
      after a refresh. `MainWindow.xaml.cs`
      Not ticked: on purpose, the weeks start as every week brought in, not the newest 7. The quick
      picks (Last week, Last 4, Last 8, Last 13, All) give a shorter range in one click. A choice
      that is still valid is kept (Test: `src/renderer/pages/performance/perfText.test.ts`).
- [x] Changing the weeks updates the averages, trends and safety counts straight away.
      `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts`.
- [x] A From week after the To week is refused with a plain message. `MainWindow.xaml.cs` Test:
      `e2e/performance-drivers.spec.ts`, `src/main/performance.test.ts`.
- [x] Status chips: Active (the start), Inactive, Offboarded, All. `MainWindow.xaml` Test:
      `e2e/performance-drivers.spec.ts`.
- [ ] Tier chips: All (the start), Platinum, Gold, Silver, Bronze. `MainWindow.xaml`
      Not ticked: there is no All chip for tiers. With no tier chip on, every tier shows, and more
      than one tier can be on at once (Test: `e2e/performance-drivers.spec.ts`).
- [ ] Activity chips: In latest week (the start), Has any data, All. `MainWindow.xaml`
      Not ticked: on purpose, the chips are Everyone (the start), Had a scorecard and No scorecard,
      and they look at the chosen weeks, not only the latest week (Test:
      `e2e/performance-drivers.spec.ts`).
- [x] A search box finds drivers by name or Transporter ID. `MainWindow.xaml.cs` Test:
      `e2e/performance-drivers.spec.ts`.
- [x] The bottom line says how many drivers are shown out of how many, and the weeks held.
      `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts`.
- [ ] **Refresh** reloads everything. `MainWindow.xaml`
      Not ticked: no Refresh button is needed. Every page updates by itself when new data comes in.

### Picking and acting on drivers

- [x] **Select all visible** ticks every driver shown; **Clear** unticks them; a count shows how
      many are ticked. `MainWindow.xaml` Test: `e2e/performance-drivers.spec.ts`.
- [x] **Generate PDFs** works on the ticked drivers, or on every driver shown when none are ticked,
      and asks first. `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts` (two buttons:
      Generate for selected, and Generate all shown).
- [x] **Email reports** works on the same drivers the same way. `MainWindow.xaml.cs`
      Two buttons, as for Generate: **Email selected** (the ticked drivers) and **Email everyone
      shown**. A list of who would get what comes up before anything is sent. Test:
      `e2e/performance-drivers.spec.ts`, `e2e/performance-drivers-extras.spec.ts`.
- [x] **Export** for the selected driver or for all drivers shown writes the check file.
      `MainWindow.xaml` Test: `e2e/performance-drivers.spec.ts`, `src/main/performance.test.ts`.
- [x] Double-clicking a row opens that driver's report without saving it anywhere.
      `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts`, `src/main/performance.test.ts`.
- [x] Right-clicking a row picks it and offers **Preview PDF** and **Email this report**.
      `MainWindow.xaml` Test: `e2e/performance-drivers.spec.ts`.

### Check file (export)

- [x] The check file uses the same column headings as Amazon's scorecard file, plus a Source File
      column saying which file each row came from. `DataExporter.cs` Test:
      `src/main/performance.test.ts`.
- [x] It has one row per driver per week, with every metric's value, tier, score and weight.
      `DataExporter.cs` Test: `src/main/performance.test.ts`,
      `packages/storage/src/perfAnalysis.test.ts`.
- [x] It opens cleanly in Excel, accents and dashes included. `DataExporter.cs` Test:
      `src/main/performance.test.ts`.
- [x] The suggested file name has the date and time in it. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`.
- [x] Afterwards it says how many drivers, weeks and rows were written, and offers to show the
      file in its folder. `MainWindow.xaml.cs` The message has a **Show in folder** button (the same
      after making reports). Test: `src/main/performance.test.ts`,
      `e2e/performance-drivers.spec.ts`, `e2e/performance-drivers-extras.spec.ts`, smoke check
      "Show in folder opens the reports folder and shows the check file".

### Safety events list

- [x] Clicking a red safety count opens that driver's events for the chosen weeks, for that one
      type, or all types from the Program Impact total. `SafetyDetailsWindow.xaml.cs` Test:
      `e2e/performance-drivers.spec.ts`, `src/main/performance.test.ts`.
- [x] The list shows week, date, type, subtype, program impact, source and review details, newest
      first. `SafetyDetailsWindow.xaml` Test: `e2e/performance-drivers.spec.ts`.
- [ ] Each event with a video has an **Open video** link. `SafetyDetailsWindow.xaml`
      Not ticked: the app does not open outside websites, so each video link is shown with a Copy
      button, to paste into the web browser (Test: `e2e/performance-drivers.spec.ts`).
- [x] A summary line says how many events and how many have video. `SafetyDetailsWindow.xaml.cs`
      Test: `e2e/performance-drivers.spec.ts`.

### Directory

- [x] A contact list from the roster: driver, Transporter ID, status, position, qualifications, ID
      expiry, phones and email. `DirectoryWindow.xaml` Test: `e2e/performance-directory.spec.ts`,
      `src/main/performance.test.ts`.
- [x] A search box looks through name, ID, email, phones, position and qualifications.
      `DirectoryWindow.xaml.cs` Test: `e2e/performance-directory.spec.ts`.
- [x] It says how many drivers are shown out of how many. `DirectoryWindow.xaml.cs` Test:
      `e2e/performance-directory.spec.ts`.
- [x] With no roster yet, it says to bring one in. `DirectoryWindow.xaml` Test:
      `e2e/performance-directory.spec.ts`.

## 3. Reports (the PDF)

### Making reports

- [x] One PDF per driver for the chosen weeks, saved in a folder you pick. `MainWindow.xaml.cs`
      Test: `src/main/performance.test.ts`, `scripts/smoke.mjs`.
- [x] A driver with no scorecard in those weeks is skipped and counted. `ReportGenerator.cs` Test:
      `src/main/performance.test.ts`, `scripts/smoke.mjs`.
- [x] The file name is the driver's name, Transporter ID and the weeks. `ReportGenerator.cs` Test:
      `src/main/performance/report/fileName.test.ts`, `src/main/performance.test.ts`.
- [x] Afterwards it says how many were made, how many skipped, and where. `MainWindow.xaml.cs` Test:
      `src/renderer/pages/performance/perfText.test.ts`, `e2e/performance-drivers.spec.ts`.
- [x] A preview opens the report in the computer's PDF viewer. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`, `scripts/smoke.mjs`.

### Every page

- [x] Letter-size pages. `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`,
      `src/main/performance/report/print.test.ts`.
- [x] The top of each page shows the driver's name, Transporter ID and the weeks covered.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] The foot of each page says "Page X of Y". `ReportGenerator.cs` Test:
      `src/main/performance/report/print.test.ts`.
- [x] Every week in the range gets its own column, even where that driver has no data for it.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] Metric cells show the value, the score in brackets and the weight in square brackets, in the
      tier's colours. `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] Each metric says whether higher or lower is better. `Models.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] Counts above zero are shown in the defect colours. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.

### Page 1: summary

- [x] Overall Score chart over the weeks, with each point's number on it. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] The chart is shaded in the tier bands when thresholds are in and colour is on.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] A legend explaining the three values in each cell, and what each safety and quality metric
      means. `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] The Overall thresholds table. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] Weekly detail: Overall Tier, Overall Score, Rank, Packages and the overall metrics.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] A metric with no data in any of the weeks is left out, except PSB, which always shows.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.

### Page 2: safety

- [x] The Safety thresholds table and the weekly safety metrics. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] The CED threshold row and CED's weekly row at the bottom. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.

### Pages 3 to 8

- [x] CDF: threshold row, weekly CDF row, the six feedback counts per week, then what each reason
      covers. `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] DSB: threshold row, weekly DSB row, the six behaviour counts per week, then what each one
      measures. `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] POD: threshold row, weekly POD row, opportunities, successes, bypasses, rejects, acceptance
      rate, and the nine reject reasons. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] POD acceptance rate is (successes + bypasses) / opportunities. `ReportGenerator.cs` Test:
      `packages/performance/src/models/models.test.ts`,
      `src/main/performance/report/report.test.ts`.
- [x] PSB: threshold row, weekly PSB row, the seven failure counts per week (a dash for a week with
      no file or where the driver was not in it), then what each one measures. `ReportGenerator.cs`
      Test: `src/main/performance/report/report.test.ts`.
- [x] DCR guide page: the exemption rules, the steps for each, best practices, and why a return can
      show "No RTS Code Selected". `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] DCR page: threshold row, weekly completion row, total returns, returns that counted, and the
      weekly totals (dispatched, delivered, returned, rescued, exempted). `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] DCR page: a list of each return that counted, with week, date, tracking ID, return code and
      notes, running onto more pages if needed. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.
- [x] A weekly completion figure with no tier from Amazon is given one from the thresholds, so the
      cell is still coloured. `ReportGenerator.cs` Test:
      `src/main/performance/report/report.test.ts`.

### Thresholds and preview on screen

- [x] The Metric Thresholds view lists each metric with its direction, the four cut-offs in tier
      colours and its weight. `ThresholdsWindow.xaml` Test: `e2e/performance-reports.spec.ts`,
      `src/main/performance.test.ts`.
- [x] With no thresholds yet, it says which file to bring in. `ThresholdsWindow.xaml` Test:
      `e2e/performance-reports.spec.ts`.
- [x] A preview on screen shows the report's tables for one driver at a time: scorecard, metrics,
      POD, CDF, DSB, PSB, DCR totals and the returns that counted. `MainWindow.xaml.cs` Test:
      `e2e/performance-reports.spec.ts`.
- [x] The preview steps through the same drivers that Generate would use, with **Prev**, **Next**,
      "Driver X of Y" and a jump-to-driver box. `MainWindow.xaml.cs` Test:
      `e2e/performance-reports.spec.ts`.
- [x] The preview follows the chosen weeks and uses the report colours. `MainWindow.xaml.cs` Test:
      `e2e/performance-reports.spec.ts`.
- [x] The preview says plainly when no drivers are picked or the weeks are not valid.
      `MainWindow.xaml.cs` Test: `e2e/performance-reports.spec.ts`.

## 4. Email

- [x] Each driver is emailed their own PDF for the chosen weeks. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`.
- [x] Before sending, it checks email is set up and offers to open the email settings if not.
      `EmailSender.cs` Test: `e2e/performance-drivers.spec.ts`, `src/main/performance.test.ts`.
- [x] Drivers with no email address on file are skipped and counted; if none have one, it says
      addresses come from the roster. `MainWindow.xaml.cs` Test: `src/main/performance.test.ts`,
      `e2e/performance-drivers.spec.ts`.
- [x] It asks first, saying the weeks, how many drivers, how many are skipped, and where a hidden
      copy goes. `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts`.
- [x] One login is used for the whole batch; if the login fails, nothing is sent. `EmailSender.cs`
      Test: `src/main/performance.test.ts`.
- [x] Progress shows as "Emailing X of Y". `MainWindow.xaml.cs` With a progress bar; making the
      reports counts up the same way ("Making report 3 of 12..."). Test:
      `src/main/performance.test.ts`, `e2e/performance-drivers-extras.spec.ts`, smoke check "making
      reports counts up for the page, ending on the total".
- [x] Afterwards: how many were sent, skipped for no data, skipped for no address, and which failed
      and why (the first ten). `MainWindow.xaml.cs` Test: `e2e/performance-drivers.spec.ts`,
      `src/renderer/pages/performance/perfText.test.ts`.
- [x] The PDF made for sending is deleted after it is sent. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`.
- [x] The subject and body come from the templates, with the driver's name and the weeks filled in.
      `EmailSender.cs` Test: `src/main/performance.test.ts`,
      `src/shared/performanceSettings.test.ts`.
- [x] The sender's name falls back to the from address when blank. `EmailSender.cs` Test:
      `src/main/performance/mailer.test.ts`.
- [x] A hidden copy of every email goes to the copy address when one is set. `EmailSender.cs` Test:
      `src/main/performance.test.ts`.
- [x] Login and secure-connection problems are explained in plain words with what to check.
      `EmailSender.cs` Test: `src/main/performance/mailer.test.ts`, `src/main/performance.test.ts`.
- [ ] **Send test email** sends a short message with no attachment to an address you type (your
      own to start), without saving first, and shows whether it worked. `EmailSettingsWindow.xaml`
      Not ticked: it saves any unsaved changes first, instead of sending without saving; the
      Settings page says so under the button. The rest is the same: no attachment, to the address
      you type (your own to start), and it says whether it worked (Test:
      `e2e/performance-settings.spec.ts`, `src/main/performance.test.ts`).

## 5. Settings

### Email settings

- [x] Fields: from address, from name, app password, hidden copy address. `EmailSettingsWindow.xaml`
      Test: `e2e/performance-settings.spec.ts`.
- [x] Advanced: mail server, port and username (blank username means the from address).
      `EmailSettingsWindow.xaml` Test: `e2e/performance-settings.spec.ts`,
      `src/main/performance.test.ts`, `src/main/performance/mailer.test.ts`.
- [x] Starts set for Gmail (smtp.gmail.com, port 587); port 465 uses a secure connection from the
      start. `EmailSender.cs` Test: `src/main/performance/mailer.test.ts`,
      `src/shared/performanceSettings.test.ts`.
- [x] Spaces pasted in the app password are taken out. `EmailSettingsWindow.xaml.cs` Test:
      `e2e/performance-settings.spec.ts`, `src/main/performance.test.ts`.
- [x] A port that is not a positive number is refused with a plain message.
      `EmailSettingsWindow.xaml.cs` Test: `e2e/performance-settings.spec.ts`.
- [x] Short help says how to get a Gmail app password. `EmailSettingsWindow.xaml` Test:
      `e2e/performance-settings.spec.ts`.
- [x] Subject and body templates that use {name}, {from} and {to}, with the old wording as the
      starting text. `PdfSettings.cs` Test: `e2e/performance-settings.spec.ts`,
      `src/main/performance.test.ts`, `src/shared/performanceSettings.test.ts`.
- [x] Cancel throws away changes; Save keeps them. `EmailSettingsWindow.xaml.cs` Test:
      `e2e/performance-settings.spec.ts`.

### Report colours

- [x] **Use color in PDF** on or off; off gives a black-and-white report for printing.
      `PdfSettingsWindow.xaml` Test: `e2e/performance-reports.spec.ts`,
      `src/main/performance/report/report.test.ts`.
- [x] Background and text colour for each tier, with the old colours as the starting ones.
      `PdfSettings.cs` Test: `e2e/performance-reports.spec.ts`, `src/main/performance.test.ts`.
- [x] Header bar background and text colour, and table border colour. `PdfSettingsWindow.xaml` Test:
      `e2e/performance-reports.spec.ts`, `src/main/performance/report/report.test.ts`.
- [x] Defect fill and text colour for counts above zero. `PdfSettingsWindow.xaml` Test:
      `e2e/performance-reports.spec.ts`, `src/main/performance/report/report.test.ts`.
- [x] A live preview of page 1 that changes as colours change, with zoom, fit width and 100%.
      `PdfSettingsWindow.xaml.cs` The zoom is remembered in this window. Test:
      `e2e/performance-reports.spec.ts`.
- [x] **Reset to defaults**, Cancel and Save. `PdfSettingsWindow.xaml` Test:
      `e2e/performance-reports.spec.ts`.

### Appearance

- [ ] Light or dark look for the app's screens; the reports keep their own colours.
      `AppearanceWindow.xaml`
      Not ticked: the app's own Settings choose light, dark or high contrast for every page, so this
      window is not needed; the reports keep their own colours. See section 9.
- [ ] An accent colour and an optional text colour, with a sample and a reset. `AppearanceWindow.xaml`
      Not ticked: replaced by the app's own themes and the A- and A+ text size buttons, which every
      page follows.

### Rule numbers

- [x] The compliance window for "expiring soon" (30 days to start). `PdfSettings.cs` Test:
      `e2e/performance-settings.spec.ts`, `src/shared/performanceSettings.test.ts`,
      `src/main/performance.test.ts`.
- [x] How many most improved and most declined drivers to show (5 to start). `PdfSettings.cs` Test:
      `e2e/performance-settings.spec.ts`, `src/shared/performanceSettings.test.ts`,
      `src/main/performance.test.ts`.
- [x] Weeks of falling score that flag a driver (3 to start). `PdfSettings.cs` Test:
      `e2e/performance-settings.spec.ts`, `src/shared/performanceSettings.test.ts`.
- [x] Weeks in a row of the same failure that flag a driver (3 to start). `PdfSettings.cs` Test:
      `e2e/performance-settings.spec.ts`, `src/shared/performanceSettings.test.ts`.

## 6. Auto-import

- [x] **Sync now** looks in every remembered folder and brings in only new or changed files.
      `AutoImporter.cs` Test: `src/main/performance.test.ts`.
- [x] **Auto-import on startup**, on to start, does the same each time the app opens.
      `MainWindow.xaml.cs` Test: `src/main/performance.test.ts`, `e2e/performance-imports.spec.ts`.
- [x] It covers scorecards, POD, CDF, DSB, PSB, DCR events, DCR totals, safety, and the one roster
      file picked last. `AutoImporter.cs` Test: `src/main/performance.test.ts`.
- [x] A file counts as already brought in when its name, size and last-changed time match the list
      of files brought in. `AutoImporter.cs` Test: `packages/storage/src/performance.test.ts`,
      `src/main/performance.test.ts`.
- [x] A file that fails is not marked as brought in, so it is tried again next time.
      `AutoImporter.cs` Test: `src/main/performance.test.ts`.
- [x] A kind with no folder remembered, or whose folder is gone, is passed over. `AutoImporter.cs`
      Test: `src/main/performance.test.ts`.
- [ ] It runs without freezing the window, and the import buttons wait until it is done.
      `MainWindow.xaml.cs`
      Not ticked: it runs in the background and the window does not freeze, but when it runs as the
      app opens, the import buttons are not greyed out. Pressing one then says "The app is already
      bringing in files. Try again in a moment." and nothing breaks (Test:
      `src/main/performance.test.ts`). When Sync now is pressed on the Imports tab, the buttons are
      greyed out until it is done (Test: `e2e/performance-imports.spec.ts`).
- [x] Afterwards a one-line summary: new files, rows, weeks, and whether there were warnings.
      `AutoImporter.cs` Test: `src/renderer/pages/performance/perfText.test.ts`,
      `src/main/performance.test.ts`, `e2e/performance-imports.spec.ts`.
- [x] Warnings open a list by kind of export, with each problem. `AutoImporter.cs` Test:
      `src/main/performance.test.ts`, `e2e/performance-imports.spec.ts`.
- [x] **Sync now** says "everything is already up to date" when nothing is new; on startup it stays
      quiet. `MainWindow.xaml.cs` On startup nothing pops up; the Imports tab shows when it last
      looked (`src/main/main.ts`). Test: `e2e/performance-imports.spec.ts`.

## 7. Data brought over

- [x] On first run the app offers to bring over the old app's data, only while the new app has none
      of its own. `Database.cs` Test: `e2e/performance-settings.spec.ts`,
      `src/main/performance.test.ts`.
- [x] Drivers, with their contact details and status. `Database.cs`
- [x] Weekly scorecards, with the file each came from. `Database.cs`
- [x] Each week's twelve metric values. `Database.cs`
- [x] The thresholds, with their week and when they were brought in. `Database.cs`
- [x] POD, CDF, DSB and PSB weekly counts. `Database.cs`
- [x] The weeks a PSB file was brought in. `Database.cs`
- [x] Each DCR return and each week's DCR totals. `Database.cs`
- [x] Each safety event. `Database.cs`
- [x] The list of files already brought in, so auto-import does not bring them in twice.
      `Database.cs`
- [x] Old databases made before the extra driver and scorecard columns were added still come over.
      `Database.cs`
- [x] The old app's data file is never changed. `Database.cs`

## 8. Dashboard inputs

The old Team Summary, Coaching, Compliance and Fleet Dashboard windows are replaced by a new
**Dashboard** page, designed from scratch. What is ported is the working-out behind them, so the
Dashboard shows the same numbers the old windows did.

**Replaced, not rebuilt** (Jonathan's decision of 2026-10-10). These are reference for what
information mattered, not for how it looked:

- Fleet Dashboard window, with its Team Summary PDF. `FleetDashboardWindow.xaml`,
  `TeamSummaryReportGenerator.cs`
- Coaching and At-Risk List window, with its coaching one-pager PDFs. `CoachingWindow.xaml`,
  `CoachingReportGenerator.cs`
- ID Expiration and Compliance window. `ComplianceWindow.xaml`
- The View menu that opened them. `MainWindow.xaml`

### Fleet

- [x] Fleet average Overall Score for each week in the range. `FleetRepository.cs`
- [x] The latest week, and how many drivers had a scorecard that week. `FleetRepository.cs`
- [x] How many drivers are in each tier in the latest week, best tier first. `FleetRepository.cs`
- [x] How many drivers are improving and how many declining across the range. `FleetRepository.cs`
- [x] Most improved and most declined: first against last scored week in the range, top N from
      settings; a driver needs two scored weeks to count. `FleetRepository.cs`
- [x] Failure counts for every POD, CDF, DSB and PSB reason across the range, for the whole fleet
      or one driver. `FleetRepository.cs`
- [x] The worst failure reasons fleet-wide. `FleetRepository.cs`
- [x] Each driver's score change and tier change between their last two scored weeks, and their
      trend across the range. `FleetRepository.cs`

### Coaching

- [x] Flag: currently Bronze. `CoachingEngine.cs`
- [x] Flag: dropped a tier since their previous scored week. `CoachingEngine.cs`
- [x] Flag: score fell every week for the last N scored weeks (N from settings).
      `CoachingEngine.cs`
- [x] Flag: the same failure reason in each of the last K weeks they have data for (K from
      settings). `CoachingEngine.cs`
- [x] Each flag carries its reason in words. `CoachingEngine.cs`
- [x] Bronze or a tier drop marks a driver High; anything else is Watch. `CoachingEngine.cs`
- [x] Each flagged driver gets the one metric losing the most weighted points in their latest week,
      with its score, weight and tier. `CoachingEngine.cs`
- [x] Flagged drivers are listed High first, then lowest score, then by name. `CoachingEngine.cs`

### Compliance

- [x] Each driver's ID expiry date is read from the roster's free text, trying several date
      layouts, and never fails. `IdExpirationParser.cs`
- [x] Expired (before today), expiring soon (within the window), valid, or unknown (blank or
      unreadable, never an alert). `ComplianceEvaluator.cs`
- [x] Days left, or days since it expired. `ComplianceEvaluator.cs`
- [x] Most urgent first, unknown last, then by name. `ComplianceEvaluator.cs`
- [x] Today's date is passed in, so the result can be tested. `ComplianceEvaluator.cs`

## 9. Deliberately different

These change on purpose, as the plan says. Tick each when the new way is in and tested.

- [x] The PDF is made from a web page inside the app instead of the old PDF tool, and the same page
      is the preview on screen. The content matches; the exact look may not. `ReportGenerator.cs`
      Test: `src/main/performance/report/report.test.ts`, `e2e/performance-reports.spec.ts`.
- [x] The Overall Score chart is drawn as part of that page instead of as a separate picture.
      `ReportGenerator.cs` Test: `src/main/performance/report/report.test.ts`.
- [x] The app password is kept safe by the computer's own safe storage instead of the Windows-only
      way. As before, it does not work if the settings are copied to another computer.
      `SecretProtector.cs` Test: `src/main/performance.test.ts`.
- [x] Settings live in the app's one settings file, not a second file in the old app's folder.
      `PdfSettings.cs` Test: `src/main/performance.test.ts`,
      `src/shared/performanceSettings.test.ts`.
- [x] Data lives in the app's one database, not a second one. `Database.cs` Test:
      `packages/storage/src/performance.test.ts`, `packages/storage/src/importWpa.test.ts`.
- [x] The old fixed starting folders on one person's computer are dropped; pickers start in the
      remembered folder or the usual place. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`.
- [x] A page never sees or names a folder path; the app remembers folders for it. `AutoImporter.cs`
      Test: `src/main/performance.test.ts`.
- [x] The look follows the app's light, dark and high contrast settings instead of the old
      Appearance window's own theme, accent and text colour. `ThemeManager.cs` Test:
      `e2e/shell-look.spec.ts`, `e2e/dashboard.spec.ts`.
- [x] Error messages are in plain words instead of the old technical error text, and the app's logs
      keep counts only, never a driver's name or ID. `MainWindow.xaml.cs` Test:
      `src/main/performance.test.ts`.
- [x] The windows become tabs on a **Performance** page (Drivers, Reports, Directory, Imports) and
      sections on the Settings page. `MainWindow.xaml` Test: `e2e/performance-drivers.spec.ts`,
      `e2e/performance-settings.spec.ts`.
