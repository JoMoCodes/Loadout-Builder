# Parity checklist: everything the old Loadout Builder does

**Tick a box only when a test or the parity harness proves it.**

This is the contract for the new app. Every line below is something the old Python version
does (written up in [`legacy/python/README.md`](../legacy/python/README.md), which is the
spec). The new app must do all of it, or the line must be moved to "Deliberately dropped" at
the bottom with a reason Jonathan has approved. Matching, linking and van assignment follow the
old rules exactly. They are ported, not improved.

How to read it: pages are in the same order as the old README. Lines are written in plain
words, one behaviour per box. If a line has several parts, each part should have a test.

Keep this file honest: when a phase proves a line, tick it in the same pull request and say
which test or harness check proved it.

---

## 1. Load Out page

The page has four tabs.

- [x] There are four tabs: **Roster**, **Print**, **Available Vans** and **Previous Roster**.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "the page has four tabs, and remembers the one you were on". The Print tab holds a plain placeholder until the Print tab work lands.

### 1.1 Previous Roster tab

- [x] The Previous Roster is yesterday's sheet, kept so drivers can stay in the same cab.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Previous Roster shows yesterday, greys out those without a van, and filters", and the smoke test: "Move Data to Previous Roster copies the day across".
- [x] **Move Data to Previous Roster** (on the Roster tab) copies today's roster across.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "copies today to the Previous Roster and leaves today alone, then clears it", `apps/desktop/e2e/load-out.spec.ts`: "Move Data to Previous Roster asks before replacing the one kept", and the smoke test: "Move Data to Previous Roster copies the day across".
- [x] Moving data across leaves today's roster untouched.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "copies today to the Previous Roster and leaves today alone, then clears it", and the smoke test: "Move Data to Previous Roster copies the day across".
- [x] **Clear Previous Roster** empties it.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "copies today to the Previous Roster and leaves today alone, then clears it", `e2e/page-pattern.spec.ts`: "a command runs, and the page follows when the app says the data changed", and the smoke test: "Clear Previous Roster asks, clears it, and the page follows".
- [x] Van assignment reads it: a driver who had a van last time and is working again gets that
      same van back, as long as it is free and suits today's route.
      Proved by the parity diff `vans` on all three days ("previous-day") and `assignment.test.ts`: "works through affinity, last time, service type, family and qualification in that order".
- [ ] The Previous Roster is saved and is still there after closing and reopening the app.
      _The saving half is checked by `packages/storage/src/store.test.ts`: "keeps the previous
      roster apart from today and survives reopening the file". The app half is checked in
      phase 3._

### 1.2 Roster tab

#### What a row is

- [x] The Roster is today's roster, one row per driver.
      Proved by the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (47 rows, row for row) and `apps/desktop/src/main/handlers/loadOut.test.ts`: "ends with the roster the old app made on 2026-09-01".
- [x] Each row is anchored to the driver's associate record.
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.
- [x] **Vans**, **Lifetime Routes** and the Transporter ID come from the associate record, not
      from the load-out sheet (the sheet carries none of them).
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "ends with the roster the old app made on 2026-09-01" (Vans per row against `rows.json`) and `apps/desktop/e2e/load-out.spec.ts`: "the Roster shows the old columns in the old order, with the header the old app had".
- [x] The Lifetime Routes count is shown on the row, beside the wave time.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "the Roster shows the old columns in the old order, with the header the old app had" (the old column order, which keeps it with the badges, the same row as the wave time).
- [x] **Matched On** shows why a driver got their van (for example "primary affinity", "same
      van as last time", "service type"). It sits next to Vehicle and VIN.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "the Roster shows the old columns in the old order..." (next to Vehicle and VIN), and by `apps/desktop/src/main/handlers/loadOut.test.ts` and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (every row's Matched On against `rows.json`, "same van as last time" included).
- [ ] Matched On is saved on the row, so it is still there after closing the app, without
      running the assignment again.
      _The saving half is checked by `packages/storage/src/persistence.test.ts`: "everything the
      app keeps is still there". The app half is checked in phase 3._
- [x] Moving a van by hand (reassign, swap, or giving one to an empty cell) changes both rows
      involved to "given by hand".
      Proved by `state/vans.test.ts`: "swaps a route, van and DWP numbers together, and marks both by hand".
- [x] Taking a van away empties its Matched On too.
      Proved by `state/vans.test.ts`: "swaps a route, van and DWP numbers together, and marks both by hand".

#### Toolbar and menu actions

- [x] **Import Sheet** (or Ctrl+O) loads a load-out sheet and replaces the current roster.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Import Sheet (and Ctrl+O) asks before replacing the roster", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (the sheet comes in through the button).
      Ctrl+O works from every page, as the old window's shortcut did: proved by `apps/desktop/e2e/shortcuts-and-drops.spec.ts`: "Ctrl+O works from any page: it opens Load Out and runs Import Sheet" and the smoke test: "Ctrl+O and Ctrl+I work from another page".
- [x] Importing asks first before it replaces the roster.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Import Sheet (and Ctrl+O) asks before replacing the roster", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)".
- [x] **Bring Over Route Data** fills Wave Time, PAD, Routes and Service Type from an imported
      route export, then brings the DWP over as well.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over Route Data asks which export, then brings the DWP over after a day check", `apps/desktop/src/main/handlers/loadOut.test.ts`: "brings route data and the DWP over, assigns vans, and clears them again", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)".
- [x] **Bring Over DWP** fills Staging, Bags and OVS, matched on route code. It is also its own
      button, for when the DWP arrives after the route data is already over.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over DWP on its own can be stopped at the day check", and `apps/desktop/src/main/handlers/loadOut.test.ts`: "brings route data and the DWP over, assigns vans, and clears them again".
- [x] **Assign Vans** fills the Vehicle and VIN columns from the fleet.
      Proved by the parity diff `vans` on all three days (`roster_after`) and `state/vans.test.ts`: "assigns afresh, clearing every row first".
- [x] **Clear Roster** empties the roster but keeps associate data and manual links.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "clears the roster but keeps the associates and the manual links", and `apps/desktop/e2e/load-out.spec.ts`: "Clear Roster asks first; the More menu clears vans and manual links".
- [x] Filter by shift type.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "filters: shift type, search and Needs attention", and `pages/loadOut/rules.test.ts`: "the shift filter".
- [x] Filter with free-text search.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "filters: shift type, search and Needs attention".
- [x] **Needs attention** filter shows only flagged rows.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "filters: shift type, search and Needs attention", and `apps/desktop/e2e/data-grid.spec.ts`: "Needs attention shows only flagged rows, and chips show colour with words" (on the Roster tab).
- [x] **Export Roster** (toolbar, or File > Export Roster...) writes the printed roster as
      `.pdf` or `.xlsx`.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "Export Roster and Export with DWP say what they wrote, or why not" (the buttons on the Roster tab's toolbar), `apps/desktop/src/main/handlers/print.test.ts`: "Export Roster writes every driver to the file chosen", and the smoke test: "in demo mode the sheets are written as PDF and Excel files where chosen". There is no File menu in the new app; the toolbar button is the way in.
- [x] **Export with DWP** (toolbar, or File > Export with DWP...) writes the same sheet with
      Bags, OVS and Staging.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "Export Roster and Export with DWP say what they wrote, or why not" (on the Roster tab's toolbar) and `apps/desktop/src/main/handlers/print.test.ts`: "Export with DWP points at Bring Over DWP when nobody carries bags, OVS or staging".

#### Columns and tables on the Roster

- [x] Dragging a heading sideways moves that column.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a reload" (on the shared table every page uses).
- [x] Dragging the edge between two headings resizes a column.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a reload".
- [x] Column order and widths are saved per table and come back next time the app opens.
      _The saving half is checked by `packages/storage/src/persistence.test.ts` ("everything the
      app keeps is still there") and the "column layout" tests in `store.test.ts`._
      The table half is proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a
      reload", and `DataGrid/layout.test.ts` ("keeps one entry per table and gives it back").
      The database half is wired: `layout:get` and `layout:set` keep order and widths in the saved
      data (proved by the start-up check "the table layout comes back after a restart"), and
      `databaseLayoutStore` hands them to the table. The Roster tab mounts the table with it
      (under the old name "roster"), and `data-grid.spec.ts` now drives that real tab through
      `layout:get` and `layout:set`.
- [x] Right-clicking a heading offers **Reset column order and widths**.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "right-click menus: a cell offers only its own actions, a heading offers the reset".
- [x] A click on a heading that does not move still sorts by that column.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "sorts the way the old app did".
- [x] A drag never sorts by accident (a heading click only counts if you let go on the heading
      you pressed).
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a reload" (the dragged column is not sorted).
- [x] Dragging a heading down into the rows and letting go cancels the move.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "dragging a heading down into the rows and letting go changes nothing".
- [x] Columns you have not touched size themselves to their contents on every redraw.
      Proved by `DataGrid/filter.test.ts`: "columns sized to their contents".
- [x] A column you dragged or resized stays exactly where you put it.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a reload".
- [x] **Addition, not in the old app: hidden columns.** The old app could not hide a column. The
      new table has a **Columns** menu and a **Hide** item on the heading menu. Which columns are
      hidden is kept per table on this computer only (the window's own storage), not in the saved
      data (there is no table for it, and the saved data's layout tables are the old app's).
      Approved by Jonathan on 2026-10-08: hidden columns stay, kept per computer only. The 2.0.0
      What's-new note says so.

#### Right-click menus on cells

- [x] Right-click offers only actions that make sense for the column clicked.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "right-click menus use the old wording, and only where they fit".
- [x] Double-click does the same thing the menu would.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Remove from the roster asks first, then sends the row and the snapshot it came from" (double-click) and `apps/desktop/e2e/data-grid.spec.ts`: "the keyboard moves around the table" (Enter on a Routes cell).
- [x] **Driver** cell: take the driver off the roster, and whatever they were holding goes with
      them.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Remove from the roster asks first, then sends the row and the snapshot it came from", and `apps/desktop/src/main/handlers/loadOut.test.ts`: "takes a driver off the roster".
- [x] **Transporter ID** cell: link to an associate by hand, or go back to automatic matching.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "the link window: suggestions first, search, link, not an associate", and `apps/desktop/src/main/handlers/loadOut.test.ts`: "links by hand, marks as not an associate, and goes back to automatic matching".
- [x] **Routes** cell: hand the work to someone else.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this route: asks, lists drivers with no work first, and swaps with the others", and `apps/desktop/src/main/handlers/loadOut.test.ts`: "hands a route over with its van, and marks both rows as given by hand".
- [x] **Service Type** cell: hand the work to someone else (this works too because the weekly
      schedule has no route codes).
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "right-click menus use the old wording, and only where they fit" (Reassign this route... on Service Type) and `pages/loadOut/rules.test.ts`: "the pickers".
- [x] Handing work over moves the wave time, service type, PAD, van, and the DWP's staging,
      bags and OVS together, because they describe the route and not the driver.
      Proved by `state/vans.test.ts`: "swaps a route, van and DWP numbers together, and marks both by hand".
- [x] **Vehicle** or **VIN** cell: **Reassign this van...** and **Unassign this van** where there
      is a van.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "right-click menus use the old wording, and only where they fit", "Reassign this van lists only drivers with a route, those without a van first", "Unassign this van, and Assign a Van from the free ones, best fit first", and `apps/desktop/src/main/handlers/loadOut.test.ts`: "swaps two vans, takes one away, and gives a free one by hand".
- [x] **Vehicle** or **VIN** cell: **Assign a Van...** where the cell is empty.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Unassign this van, and Assign a Van from the free ones, best fit first".

#### Pickers (who takes this route or van)

- [x] When reassigning a route, drivers with no route are listed first.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this route: asks, lists drivers with no work first, and swaps with the others" and `pages/loadOut/rules.test.ts`: "lists drivers with no work first for a route, then everyone else by name".
- [x] When reassigning a van, routes still waiting for a van are listed first.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this van lists only drivers with a route, those without a van first" and `pages/loadOut/rules.test.ts`: "lists only drivers with a route for a van, those without a van first".
- [x] Everyone else follows by name, greyed out.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this route: asks, lists drivers with no work first, and swaps with the others" (greyed rows) and `pages/loadOut/rules.test.ts`: "the pickers".
- [x] Picking someone from the top of the list is a plain move.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this route: asks, lists drivers with no work first, and swaps with the others" ("now has nothing") and `apps/desktop/src/main/handlers/loadOut.test.ts`: "hands a route over with its van, and marks both rows as given by hand".
- [x] Picking a greyed-out person is a swap: the two trade and neither is lost.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this van lists only drivers with a route, those without a van first" ("Swapped vans") and `apps/desktop/src/main/handlers/loadOut.test.ts`: "swaps two vans, takes one away, and gives a free one by hand".
- [x] The van menu only lists drivers who have a route.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this van lists only drivers with a route, those without a van first" and `pages/loadOut/rules.test.ts`.

#### Assign a Van (by hand)

- [x] Lists every free van, best fit first.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Unassign this van, and Assign a Van from the free ones, best fit first" and `pages/loadOut/rules.test.ts`: "lists every free van, best fit first, saying how it fits".
- [x] Says how each van fits: "Matches the route", "Qualified, other service type", "Not
      approved for LMR" or "Not EDV qualified".
      Proved by `pages/loadOut/rules.test.ts`: "lists every free van, best fit first, saying how it fits" (all four).
- [x] Flags a poor fit rather than hiding the van (self-owned vans that automatic assignment
      refuses to touch can be handed out here).
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Unassign this van, and Assign a Van from the free ones, best fit first" (the self-owned van is listed, marked Manual and flagged).

#### Columns that come from the associate data

- [x] **Vans** shows what the driver is cleared to drive as badges: CDV, EDV, SV, DOT.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **Vans** adds an LMR badge for drivers on the LMR approved list.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app"); also the parity diff `printing` (`print_rows` Vans) and `state/vans.test.ts`: "adds LMR to the badges of an approved driver".
- [x] **Check** shows "OK" or what is wrong.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Check says "Not Step Van qualified" where that applies.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] Check says "ID expires in Nd" for an ID about to expire.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Check says "ID expired Nd ago" for an expired ID.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Check says "Inactive associate" where that applies.
      Proved by the parity check (`rows.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Check says "No associate found" where that applies.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] Problems are coloured red and warnings amber.
      Proved by `DataGrid/filter.test.ts` ("the Check column colours, as the old app had them") and `apps/desktop/e2e/data-grid.spec.ts` ("chips show colour with words"). Shown as chips with words and an icon, never colour alone.

#### Columns that come from route data

- [x] **Wave Time** is the dispatch time from whichever export was taken, and lands in the
      sheet's own Wave Time column.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **PAD** is the PAD assigned to that time on the Route Data page.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **Routes** is the route code, where the export has one.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **Service Type** is Amazon's route type (finer than Shift Type, and it can disagree with
      it, because the sheet is written the night before and the route data on the day).
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").

#### Bringing route data over

- [x] Any single export is enough.
      Proved by the parity check: `routes.json` brings each export over on its own, on all three days.
- [x] If only one export is imported, the button takes it.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over Route Data takes the one export there is without asking".
- [x] If more than one export is imported, it asks which to use (their times are on different
      clocks).
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over Route Data asks which export, then brings the DWP over after a day check" and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (three exports, Routes picked).
- [x] The header next to the shift breakdown names which export was taken.
      Proved by `pages/loadOut/rules.test.ts`: "names the day, the file, the shift mix, the vans, the source and the matching".
- [ ] Bringing over again replaces what was there, so you can switch sources freely.
- [x] Only values the export actually holds are written. For example, taking the weekly
      schedule after Routes moves the dispatch times but leaves route codes in place.
      Proved by the parity check: `routes.json`, the weekly schedule scenario on 2026-09-01 and 2026-09-14.
- [x] The join is on Transporter ID, so a driver has to be anchored to an associate first.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Anyone the export does not list is left untouched.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [ ] Before anything is written, the sheet's date is checked against the roster's date.

#### On-Road Experience types

- [ ] **On-Road Experience: Rider** has a service type but needs no van, and is skipped by van
      assignment entirely.
- [ ] A Rider's scheduler shift type (for example a trainer type) is left alone.
- [x] **On-Road Experience: Driver** does take a van.
      The rule itself is checked by `serviceType.test.ts`: "who needs a van". The assignment run is checked in phase 2.
      Proved by the parity diff `vans` on all three days: the fixture days carry On-Road Experience drivers, and they are given vans.
- [x] Wherever an On-Road Experience Driver turns up in any loaded route export, Bring Over
      Route Data adds them to the associate list and to the roster (name, Transporter ID,
      service type as their position, route, wave time and PAD).
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] A manual link pins the new associate and roster row together.
      Proved by the parity check (`routes.json` and `matching.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [ ] Their Shift Type reads **ORE**, filling a blank without replacing anything.
- [x] They start with the EDV qualification, which is enough to be given a van.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] Their status is left blank, not guessed.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] If a record already exists with no qualifications at all, EDV is filled in the same way.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] Qualifications that came from the associate export are never touched.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] A blank status is treated as unknown, not inactive (no "Inactive associate" flag).
      Proved by `appState.test.ts`: "the day state, against the old app".

#### Bringing the DWP over

- [x] **Staging** is filled from the DWP (the load-out sheet's own Staging column comes through
      empty).
      Proved by the parity check (`dwp.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **Bags** is filled from the DWP. It is not the same as **Bag**, the load-out sheet's own
      yes/no column.
      Proved by the parity check (`dwp.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] **OVS** is filled from the DWP.
      Proved by the parity check (`dwp.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] The DWP joins on route code, never on Transporter ID.
      Proved by the parity check (`dwp.json` on all three days) and `appState.test.ts` ("the day state, against the old app").
- [x] Route data has to be over first, since the load-out sheet has no route of its own.
      Proved by the parity check: `dwp.json`, "on_imported_roster", on all three days.
- [x] Bring Over Route Data runs the DWP pass last, for that reason.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over Route Data asks which export, then brings the DWP over after a day check" and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)".
- [x] Case and spacing do not matter when matching a route code (`cx 8` finds `CX8`).
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] A blank cell in the DWP sheet leaves what is on the roster alone.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] A row the DWP has nothing for is emptied (staging, bags and OVS), because those numbers
      belong to a route the driver no longer has.
      Proved by the parity check: `dwp.json`, "reapply_other_sheet", on all three days.
- [x] The status line says how many rows were cleared.
      Proved by `pages/loadOut/rules.test.ts`: "says what the DWP brought over, and how many it cleared".
- [x] Before anything is written, the DWP's day is checked against the load-out date (see 3.2).
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over DWP on its own can be stopped at the day check", `pages/loadOut/rules.test.ts`: "asks about a DWP sheet that may be another day's", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (that sheet's day is unknown, so it asks).

### 1.3 Exporting a sheet to print (the two fixed exports)

- [x] **Export Roster** writes a `.pdf` or an `.xlsx`; the file extension chosen in the save
      dialog decides which.
      Proved by `apps/desktop/src/main/print/write.test.ts`: "the format comes off the extension", `apps/desktop/src/main/handlers/print.test.ts`: "Export Roster writes every driver to the file chosen", and the smoke test: "in demo mode the sheets are written as PDF and Excel files where chosen".
- [x] The printed sheet is not the Roster table. It has five columns: **Driver**, **Vehicle**,
      **Shift Type**, **Routes**, **PAD**.
      Proved by the parity diff `export` on all three days (`layout.plain`) and `export.test.ts`: "lays out both versions".
- [x] There is a blank column on each side, to write in.
      Proved by the parity diff `export` on all three days (`layout.plain`).
- [x] Every cell is boxed, so an empty one is somewhere to put a pen.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `export-plain` and `export-dwp`, every box.
- [x] Empty cells print blank, not with the table's dash.
      Proved by the parity diff `export` on all three days (`rows`) and `export.test.ts`: "prints every driver in name order, ignoring case".
- [x] **Export with DWP** writes the same page with **Bags**, **OVS** and **Staging** straight
      after Routes (order: Driver, Vehicle, Shift Type, Routes, Bags, OVS, Staging, PAD, blank).
      Proved by the parity diff `export` on all three days (`layout.with_dwp`) and `export.test.ts`: "lays out both versions".
- [x] In the DWP version the leading blank column is dropped and the trailing one stays.
      Proved by the parity diff `export` on all three days (`layout.with_dwp`).
- [x] A driver the DWP had nothing for is still on the page, with those three cells blank.
      Proved by the parity diff `export` on all three days (`rows.with_dwp`) and `export.test.ts`: "prints every driver in name order, ignoring case".
- [x] The three DWP columns are read off the roster, not back out of the DWP tab.
      Proved by the parity diff `export` on all three days (`rows.with_dwp`, read off the roster rows).
- [x] Asking to export with DWP before anything has been brought over says so, instead of
      printing three blank columns.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "Export with DWP points at Bring Over DWP when nobody carries bags, OVS or staging", and `apps/desktop/e2e/print-tab.spec.ts`: "Export Roster and Export with DWP say what they wrote, or why not".
- [x] Export with DWP stops if no driver carries any of the three, and points at **Bring Over
      DWP**.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "Export with DWP points at Bring Over DWP when nobody carries bags, OVS or staging".
- [ ] Driver, Vehicle and Staging columns are sized never to trim a value.
      _The new export draws exactly what the old one did (the print parity test, `export-plain` and `export-dwp`). On the made-up days a few long made-up names are trimmed in the DWP version, in both apps, so this is not ticked._
- [x] Shift Type can be cut short with an ellipsis (for example a long "ATTN NEEDED" type).
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `export-dwp` (a long shift type comes out as `Operations Man...` in both).
- [x] Column widths are measured against the real data at the size it prints.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `export-plain`, `export-dwp`, every box and every column's place.
- [x] In the `.xlsx`, anything that is a plain number (van numbers, PADs, bags, OVS) is written
      as a number.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days) (every workbook cell's value and type) and `apps/desktop/src/main/print/write.test.ts`: "keep identifiers as text and plain numbers as numbers in the workbook".
- [x] Identifiers that are not plain numbers stay text (for example `ET5720`, `655103 (LMR)`,
      `STG.G02`, `CX16`).
      Proved by `apps/desktop/src/main/print/write.test.ts`: "keep identifiers as text and plain numbers as numbers in the workbook", and the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days).
- [x] A value with a leading zero stays text.
      Proved by `apps/desktop/src/main/print/write.test.ts`: "keep identifiers as text and plain numbers as numbers in the workbook".
- [x] Both exports always write every driver, in name order, whatever the tab is filtered or
      sorted to.
      Proved by the parity diff `export` on all three days (`rows`) and `export.test.ts`: "prints every driver in name order, ignoring case".
- [x] The save dialog offers a file name with the day on it: `Load Out - <weekday>, <month> <day>
      <year>`, or `Load Out with DWP - ...` for the other one.
      Proved by the parity diff `export` on all three days (`default_filename`) and `export.test.ts`: "names the file after the day".
- [x] The two exports are named differently so the name says which one you are holding.
      Proved by the parity diff `export` on all three days (`default_filename`).
- [x] The headings repeat at the top of every page.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `export-plain`, `export-dwp`, the text on every page.
- [x] Printing the `.xlsx` gives the same page as the `.pdf` (fit to width, header row
      repeating).
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): the workbook's page setup (one page wide, the heading row repeating) is the old app's.

---

## 2. Print tab

The columns, page and who prints are the user's to set. The two fixed exports above stay fixed.

### 2.1 What the tab starts with

- [x] It opens on the same five columns as Export Roster, with a blank column either side.
      Proved by the parity diff `printing` on all three days (`specs.default`).
- [x] **Print Page** straight away gives the handout people already know.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `default`, and `apps/desktop/e2e/print-tab.spec.ts`: "opens on the handout people know".
- [x] Everything changed on the tab is saved against the tab and is still there tomorrow.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "is kept, read back the way a saved layout is", and `apps/desktop/e2e/print-tab.spec.ts` (every change is saved).
- [x] What prints in a cell is exactly what the Roster table shows in it. Check, Vans and
      Matched On included.
      _The Print tab reads the core's own print rows (`print:rows`, checked against `AppState.printRows` by `apps/desktop/src/main/handlers/print.test.ts`; the rows themselves by the parity diff `printing`)._
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "prints in every cell what the Roster table shows in it, from the same records" (every column, every row of a fixture day, Check, Vans and Matched On included). The one difference is the old app's too: the table shows "PAD 1", the sheet prints "1".
- [x] The Print tab and the Roster read the same records, with no separate working out.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "prints in every cell what the Roster table shows in it, from the same records": both come from the same day state in the main process, and the Print tab is mounted on the Load Out page beside the Roster (`apps/desktop/e2e/load-out.spec.ts`: "the page has four tabs...").

### 2.2 Columns

- [x] The left-hand panel lists the printed columns, top to bottom being left to right.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, rename, move, set a width, and take one off".
- [x] **Add...** offers every column the Roster tab has (18), with ones already on the sheet
      greyed out.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ..." (18 columns, the ones on the sheet greyed).
- [x] **Write-in** adds an empty box column.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] **Tick box** adds a column with an empty square.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:long-title-by-pad`, `synthetic:tick-boxes-leave-offs` (the squares), and `apps/desktop/e2e/print-tab.spec.ts`.
- [x] Adding a tick box asks what it is for (for example Keys, Badge, Checked In).
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] Double-clicking a column renames it; leaving the name empty puts the original heading
      back.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] **Move Up** and **Move Down** reorder columns.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] Each column is measured against its widest cell or its heading, whichever is longer, in
      the font the sheet prints in.
      Proved by the parity diff `printing` on all three days (`column_widths`) and `shared/helvetica`; `printing.test.ts`: "measuring text".
- [x] The Width figure beside each column is the width it will really come out at, in points.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`: "shows the width each column really prints at" (against the parity diff's `column_widths`).
- [x] The figure changes when the scale, paper or roster does.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`: "changes the figure when the scale, the paper or the roster does".
- [x] "auto" shows beside a column nobody has fixed.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts` and `apps/desktop/e2e/print-tab.spec.ts`.
- [x] **Width** fixes one column at a number of the user's own.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`: "moves nothing when the number shown is typed back, and fixes the width otherwise", and `apps/desktop/e2e/print-tab.spec.ts`.
- [x] **Auto** hands the column back to the measurement.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] Typing back the number shown moves nothing.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts` and `apps/desktop/e2e/print-tab.spec.ts`: "columns: add a tick box, ...".
- [x] A column on auto is capped at 40% of the page, but only when it has to share the page.
      Proved by the parity diff `printing` on all three days (`column_widths`) and `printing.test.ts`: "shares the width out without squeezing a heading off".
- [x] A two-column sheet with half the page blank is not capped or trimmed.
      Proved by the parity diff `printing` on all three days (`synthetic:narrow-stretched-a4`) and `printing.test.ts`: "measures the default sheet off its rows".
- [x] A width set by hand is never capped.
      Proved by `printing.test.ts`: "shares the width out without squeezing a heading off".
- [x] The room a heading needs is never capped, so adding a column cannot make another wider.
      Proved by the parity diff `printing` on all three days (`column_widths` on every layout).
- [x] **Align** sets a column left, centre or right, or **Default** for its usual setting.
      Proved by the parity diff `printing` on all three days (`columns[].align`) and `printing.test.ts`: "reads label, kind, width and alignment".
- [x] Van numbers are centred by default under their heading.
      Proved by the parity diff `printing` on all three days (`synthetic:narrow-stretched-a4`, the Print Vans columns).

### 2.3 Page setup

- [x] Paper: Letter, Legal, A4 or Tabloid.
      Proved by the parity diff `printing` on all three days (`geometry`) and `printing.test.ts`: "works the page out from the spec".
- [x] Orientation: portrait or landscape.
      Proved by the parity diff `printing` on all three days (`geometry`) and `printing.test.ts`: "works the page out from the spec".
- [x] Scale: 40 to 200 percent, moving type and columns together.
      Proved by the parity diff `printing` on all three days (`geometry`, `column_widths`) and `printing.test.ts`: "works the page out from the spec".
- [x] Order by: driver, wave, PAD, route, van, shift or service type, with **Reverse**.
      Proved by the parity diff `printing` on all three days (`printing_keys`) and `printing.test.ts`: "who prints, and in what order".
- [x] Page breaks: one run of pages, or a fresh page per PAD, wave, shift or staging.
      Proved by the parity diff `printing` on all three days (`pages`) and `printing.test.ts`: "starts a new page for each group and fills each page".
- [x] Title and an optional note under it.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:no-boxes-centred-down`, `draw:long-title-by-pad`, `synthetic:grouped-by-pad-vans-only`.
- [x] Page numbers (`Page 2 of 9`), and "columns continued" where the sheet spills sideways.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:numbers-only-spill`, `synthetic:everything-landscape-no-fit`.
- [x] A table that already fits the page prints exactly as measured.
      Proved by the parity diff `printing` on all three days (`column_widths`).
- [x] **Keep all columns on one page** squeezes a too-wide table down to fit.
      Proved by the parity diff `printing` on all three days (`synthetic:everything-squeezed-big`) and `printing.test.ts`: "squeezes every column onto one page when asked".
- [x] With it off, columns keep their width and the overflow goes onto extra pages.
      Proved by the parity diff `printing` on all three days (`synthetic:everything-landscape-no-fit`) and `printing.test.ts`: "spills sideways otherwise".
- [x] Overflow pages repeat the first column at the left.
      Proved by the parity diff `printing` on all three days (`bands`) and `printing.test.ts`: "spills sideways otherwise, repeating the first column".
- [x] Overflow pages are marked "columns continued".
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:numbers-only-spill`.
- [x] The read-out at the top of the tab says how many page-widths the sheet comes to.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`: "says how many page-widths a sheet spills onto".
- [x] **Stretch narrow tables to the full width** pulls a narrow table out to fill the page
      (off by default).
      Proved by the parity diff `printing` on all three days (`synthetic:narrow-stretched-a4`) and `printing.test.ts`: "stretches a narrow table only when asked".
- [x] **Centre across the page** puts a narrow block in the middle.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `vans` (on), `synthetic:narrow-stretched-a4` (off).
- [x] **Centre down the page** is a separate switch from centring across.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:no-boxes-centred-down`.
- [x] Squeezing never squeezes a heading off its own column (a column never ends up under the
      width its heading needs, for example PAD never prints as "P...").
      Proved by the parity diff `printing` on all three days (`column_widths`) and `printing.test.ts`: "shares the width out without squeezing a heading off".
- [x] The width taken back to protect headings comes off columns that had room to spare.
      Proved by `printing.test.ts`: "shares the width out without squeezing a heading off".
- [x] Data still trims with an ellipsis, as on the fixed exports.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:tiny-columns`, `synthetic:everything-squeezed-big`, and `apps/desktop/src/main/print/write.test.ts`: "trimming a cell to its column".
- [x] Switches for page numbers, repeated headings, boxes round every cell and shaded
      alternate rows.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:no-boxes-centred-down`, `draw:numbers-only-spill`, `synthetic:grouped-by-pad-vans-only`.
- [x] The day is on the page whatever the title says.
      Proved by the parity diff `printing` on all three days (`title_for`) and `printing.test.ts`: "names the file and the title line".
- [x] Title, note and page numbers are three separate switches.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `synthetic:grouped-by-pad-vans-only` (note, no title), `draw:numbers-only-spill` (numbers only), `draw:no-head` (none).
- [x] Where pages break by PAD or by wave, the group name prints beside the title (for example
      `Load Out - <day>   -   PAD 2`).
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:long-title-by-pad`, `draw:no-boxes-centred-down`, and `apps/desktop/e2e/print-tab.spec.ts`: "page setup changes the read-out".
- [x] The group name is drawn as its own piece, so a long title cannot cut it off.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:long-title-by-pad` (a long title trimmed, the PAD kept).

### 2.4 Who prints

- [x] Shift types and drivers are each a list you click to take somebody off the sheet.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "who prints: a shift type off greys its drivers, and a greyed name says why".
- [x] Both lists hold what is left off, not what is on, so a new shift type or driver prints by
      default.
      Proved by the parity diff `printing` on all three days (`synthetic:tick-boxes-leave-offs`) and `printing.test.ts`: "leaves off by name, by shift and for having no van".
- [x] Both lists are saved with the layout.
      Proved by `printing.test.ts`: "saves a layout the way Python writes it".
- [x] Drivers are filed under their Transporter ID where they have one, and their normalised
      name where they do not (the same key a manual link uses).
      Proved by the parity diff `printing` on all three days (`print_rows[].key`) and `state/vans.test.ts`: "fills every field of every row, keyed by ID where there is one".
- [x] An exclusion survives importing tomorrow's sheet.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "keeps who is left off when tomorrow's sheet is brought in".
- [x] Switching a shift type off greys out everyone on it in the driver list.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "who prints: a shift type off greys its drivers, ...".
- [x] A driver whose shift type is off is off, whatever their own switch says.
      Proved by `printing.test.ts`: "leaves off by name, by shift and for having no van".
- [x] **Only drivers holding a van** greys out the van-less in the same way.
      Proved by `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`: "says why a driver is off ..." and `apps/desktop/e2e/print-tab.spec.ts`: "the search only narrows the list; ...".
- [x] Neither of those touches the drivers' own switches; switching the shift type back on
      restores them with their old settings.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "who prints: a shift type off greys its drivers, ...".
- [x] Clicking a greyed-out name says why it is greyed.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "who prints: a shift type off greys its drivers, ...".
- [x] The search box only narrows what is on screen. A name hidden by search is still on the
      sheet.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "the search only narrows the list; None and All mean every driver".
- [x] **All** means every driver, not only the ones visible.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "the search only narrows the list; ..." and `apps/desktop/src/renderer/pages/loadOut/print/logic.test.ts`.

### 2.5 The three buttons

- [x] **Print Page** writes the sheet as the tab is set up.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "ask where to save, offering the old file name, and write the PDF there", and the smoke test: "in demo mode the sheets are written as PDF and Excel files where chosen".
- [x] **Print Vans** writes who and which van: two columns and nothing else, a narrow block at
      the width the contents ask for, van numbers centred, in the middle of the page.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `vans`, and `apps/desktop/src/main/handlers/print.test.ts`: "cut the sheet down for Print Vans".
- [x] Print Vans is always in van-number order, whatever the tab is ordered by.
      Proved by `apps/desktop/src/main/print/write.test.ts`: "Print Vans: is the tab's own page and people, ...", and the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `vans`.
- [x] Print Vans includes only drivers actually holding a van, and the status line says how many
      were left off.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "cut the sheet down for Print Vans", and `apps/desktop/e2e/print-tab.spec.ts`: "Print Page, Print Vans and Preview ...".
- [x] Print Vans still follows the paper, the scale, and the shift types and drivers left off.
      Proved by `apps/desktop/src/main/print/write.test.ts`: "Print Vans: is the tab's own page and people, ...".
- [x] Van order reads the way the number reads: `55`, `56`, `551894`, `614110 (N)`,
      `655071 (LMR)`, `ET5213`.
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `vans` (the drivers in the old app's order), and `clock.test.ts`: "sortKey".
- [x] That order is the app's own rule, not Excel's (Excel would put the `(N)` and `(LMR)` vans
      in a block at the bottom).
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `vans` (the workbook rows in the old app's order).
- [x] **Preview** writes the same sheet somewhere temporary and opens it.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "Preview writes one throwaway PDF and opens it". The tab also shows the page as it will print, drawn from the same marks as the PDF.
- [x] Print Page and Print Vans write `.pdf` or `.xlsx`, the extension deciding.
      Proved by `apps/desktop/src/main/handlers/print.test.ts` and `apps/desktop/src/main/print/write.test.ts`: "the format comes off the extension".
- [x] In `.xlsx`, a tick box is the character `☐` in a cell, and Excel spills wide columns its
      own way (these two differences are expected).
      Proved by the print parity test (`apps/desktop/src/main/print/parity.test.ts`: the old app's own writers against the new ones on all three days): `draw:long-title-by-pad`, `synthetic:tick-boxes-leave-offs` (workbook cells).
- [ ] **File > Print Page...** and **File > Print Vans...** do the same two things from the menu
      and switch to the tab on the way.
      _The new app has no menu bar. The two buttons are on the Print tab; a menu entry (if wanted) comes with the Load Out page._

### 2.6 Saved layouts

- [x] **Save As...** names what is on the tab: columns, page setup and who is left off.
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "saves, lists, loads and deletes named layouts; Reset keeps them", and `apps/desktop/e2e/print-tab.spec.ts`: "saved layouts: ...".
- [x] A saved layout comes back from the box beside the button.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "saved layouts: save as, load, delete, and reset keeps them".
- [x] Several layouts can sit side by side (for example Yard Sheet, Dispatch Master, Check-in
      Sheet).
      Proved by `apps/desktop/src/main/handlers/print.test.ts`: "saves, lists, loads and deletes named layouts; ...".
- [x] **Reset Layout** puts the tab back to the sheet it started with and keeps saved layouts.
      Proved by `apps/desktop/src/main/handlers/print.test.ts` and `apps/desktop/e2e/print-tab.spec.ts`: "saved layouts: ...".
- [x] A saved layout is reconciled when read back: a field a later version no longer has is
      dropped.
      Proved by the parity diff `printing` on all three days (`specs.working`, `specs.preset:*`) and `printing.test.ts`: "reads a saved layout back, dropping what it cannot honour".
- [x] An unrecognised paper falls back to Letter.
      Proved by `printing.test.ts`: "works the page out from the spec" and "reads a saved layout back".
- [x] A scale outside 40 to 200 is clamped.
      Proved by `printing.test.ts`: "reads a saved layout back, dropping what it cannot honour".
- [x] A layout saved by an older version comes back as much of itself as still makes sense,
      with no error at start-up.
      Proved by `printing.test.ts`: "reads a saved layout back, dropping what it cannot honour".

### 2.7 Available Vans tab

- [x] Shows the operational vans nobody on the roster is holding.
      Proved by the parity diff `vans` on all three days (`available_vehicles_before`, `_after`) and `state/vans.test.ts`: "counts a van as taken by its name or its VIN".
- [x] It updates the moment a van is assigned, grounded or freed.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "swaps two vans, takes one away, and gives a free one by hand" (the van turns free and taken in the snapshot the tab draws from) and `apps/desktop/e2e/load-out.spec.ts`: "Available Vans lists the free vans, marks hand-assign-only ones Manual, and filters".
- [x] Hand-assign-only vans are marked **Manual**.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Available Vans lists the free vans, marks hand-assign-only ones Manual, and filters" and `pages/loadOut/rules.test.ts`: "counts what is free, what is out, the mix, and the hand-assign-only vans".

---

## 3. Route Data page

The Amazon exports that say who has scheduled work and when they dispatch.

### 3.1 Sub-tabs and files

- [x] One sub-tab per export, each with its own file, table and PADs.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "has a tab for each export and one for the DWP sheet, and says what an empty one wants", and the Electron smoke check (`apps/desktop/scripts/smokeOtherPages.mjs`), which brings in each export on its own tab.
- [x] **Routes** reads `Routes_<station>_<date>.xlsx`; dispatch time comes from Planned
      Departure Time; it also carries route code, service type and route progress.
      Proved by `routedata.test.ts`: "Routes and Itineraries fixtures" and "route export scenarios".
- [x] **Itineraries** reads `Itineraries_<station>_<date>.xlsx`; dispatch time comes from
      Planned Departure Time when present (the morning export has none yet); it carries route
      code, route duration and route progress.
      Proved by `routedata.test.ts`: "Routes and Itineraries fixtures" and "route export scenarios".
- [x] The afternoon Itineraries file also adds VIN and actual departure.
      Proved by `routedata.test.ts`: scenario "afternoon export with VIN and actual departure".
- [x] **Weekly Schedule** reads `Week-<n>-Schedule.xlsx`; dispatch time is the start time inside
      each day cell; it carries the rostered block length.
      Proved by `routedata.test.ts`: "weekly schedule fixtures" and the schedule scenarios.
- [x] **DWP** reads `DWP_DSP-<code>_<date>.xlsx` (see 3.2).
      Proved by `dwp.test.ts`: "DWP fixtures".
- [x] The morning Itineraries workbook keeps its rows on a "Pre Dispatch" sheet behind an empty
      first sheet; the import scans every sheet for the header row, so either file works.
      Proved by `routedata.test.ts`: scenario "morning export on a second sheet, duration split off".
- [x] The "(440 mins)" Amazon packs into the service type is split off into a **Route
      Duration** column, leaving the type clean for van matching.
      Proved by `routedata.test.ts`: the same scenario, and the Itineraries fixture's route durations.
- [x] The first three sub-tabs are keyed by Transporter ID, so they anchor straight to
      associates with no name matching.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "shows an export with the old columns, a header that counts, and the old colours" (rows are checked against the associate list by Transporter ID, not by name) and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "Route Data tables".
- [x] Rows whose ID has no associate record are coloured amber.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "shows an export with the old columns, a header that counts, and the old colours" and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "colour rows as the old page did".
- [x] Rows with no PAD yet are greyed.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "shows an export with the old columns, a header that counts, and the old colours" and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "colour rows as the old page did".
- [x] The day of a route export is read from its file name.
      Proved by `routedata.test.ts`: fixture days, and the "file name" scenarios.

### 3.2 DWP

- [x] The DWP sits on this page because it is read for the same day.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "has a tab for each export and one for the DWP sheet, and says what an empty one wants".
- [x] It carries no dispatch times and no PADs.
      Proved by `dwp.test.ts`: "DWP fixtures" (sample rows hold only the four fields).
- [x] It is keyed by route code, not Transporter ID (a person can appear on several lines, a
      route code appears once).
      Proved by `models.test.ts`: "DWP data sets".
- [x] Only four columns are kept: route code, Bags, OVS and Staging.
      Proved by `dwp.test.ts`: "DWP fixtures".
- [x] A file missing any of the four is refused as not being the sheet asked for.
      Proved by `dwp.test.ts`: scenario "a column is missing".
- [x] **Import DWP** and **Clear** are the whole of the tab, plus a search box and a **Not on
      the roster** filter.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "the DWP tab says how many drivers matched, calls out a route listed twice and greys what is not on the roster" (search box and **Not on the roster**), "importing a DWP sheet says how many routes came in...", "clearing the DWP sheet asks first".
- [x] The header says how many of the roster's drivers it matched.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "the DWP tab says how many drivers matched..." and, against the harness numbers, `apps/desktop/src/main/handlers/pageViews.test.ts`: "are worded the way the old pages worded them".
- [x] Rows that match nothing on the roster are greyed.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "the DWP tab says how many drivers matched..." and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "the DWP tab".
- [x] A route code listed twice is called out. The first line wins.
      Called out in the header and in the import message: `apps/desktop/e2e/route-data.spec.ts`: "the DWP tab says how many drivers matched..." and "importing a DWP sheet...". The first line winning is the core: `models.test.ts`: "compares route codes without caring about case or spacing, first line winning".
- [x] The sheet's day is read only from the file name, since nothing inside the sheet says.
      Proved by `dwp.test.ts`: "the day a DWP file is for".
- [x] `DWP_DSP-<code>_08-14-2026` reads as August 14th 2026.
      Proved by `dwp.test.ts`: "the day a DWP file is for".
- [x] A file name with a date that matches the roster's day goes straight through.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "a DWP sheet for the roster's own day goes straight over, with no question" and `pages/loadOut/rules.test.ts`: "asks about a DWP sheet that may be another day's".
- [x] A file name with a different day asks before bringing over.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over DWP on its own can be stopped at the day check" and "Bring Over Route Data asks which export, then brings the DWP over after a day check".
- [x] A name like `<code> DWP 7.6` is unknown (could be any year) and asks first.
      Proved by the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (that day's sheet is named "XXXX DWP 9.2"; the check waits for the question "Is this the right day's DWP sheet?", checks it says the day cannot be told, and only then answers yes) and `dwp.test.ts`: "the day a DWP file is for".
- [x] A name with no date at all is unknown and asks first.
      Proved by `dwp.test.ts`: "the day a DWP file is for" (no date reads as unknown) and `pages/loadOut/rules.test.ts`: "asks about a DWP sheet that may be another day's" (unknown asks, in the old words).
- [x] A name that does not say the date plainly is treated as unknown, never interpreted.
      Proved by `dwp.test.ts`: "the day a DWP file is for".
- [x] A number that is not a real date (such as `13-40-2026`) reads as unknown.
      Proved by `dwp.test.ts`: "the day a DWP file is for".
- [x] Answering no to the question leaves the roster exactly as it was.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over DWP on its own can be stopped at the day check" (no command is sent).

### 3.3 Shared routes

- [x] A route worked by more than one person arrives as one line with names and IDs joined by a
      pipe sign.
      Proved by `routedata.test.ts`: scenarios "shared routes, placeholders, clock spellings" and the "shared" counts of the fixtures.
- [x] Importing asks who each shared route belongs to rather than guessing.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "bringing a file in asks who shared routes belong to, then which PAD each time is in".
- [x] Both names are kept either way.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "sets who a shared route belongs to, and only for the table the page saw" (the joined names and IDs are unchanged after the choice).
- [x] The row reads `<name>   (+1 more)` and is coloured amber.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "shows an export with the old columns, a header that counts, and the old colours". Like the old page, a shared route with no PAD yet is grey first and turns amber once it has one (`apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "colour rows as the old page did").
- [x] Right-clicking the Driver or Transporter ID column reopens the choice.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "right-clicking the Driver column of a shared route reopens the choice, and says when there is none".
- [x] Skipping the prompt costs nothing.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "skipping both windows costs nothing, and says how to come back to them".
- [x] Itineraries write names as `First,Last` and Routes as `First Last`; both read the same.
      Proved by `routedata.test.ts`: scenario "morning export on a second sheet, duration split off".

### 3.4 Assigning PADs

- [x] Importing lists the distinct dispatch times found and asks which PAD each belongs in.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "bringing a file in asks who shared routes belong to, then which PAD each time is in" and the Electron smoke check, which assigns PADs through the window on all three days.
- [x] The mapping is made by hand, never inferred.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "Assign PADs reopens the window with what was chosen, and asks before leaving a time empty" (a time starts on None until someone chooses).
- [x] Skipping the dialog leaves rows unassigned until **Assign PADs** is pressed.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "skipping both windows costs nothing, and says how to come back to them".
- [x] **Assign PADs** reopens the dialog at any time.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "Assign PADs reopens the window with what was chosen..." and "double-clicking a row opens the PAD window too".
- [x] Assignments are saved.
      _Proved by `packages/storage/src/store.test.ts`: "round-trips a dataset with its PAD
      assignments" and "saves PAD assignments on their own"._
- [x] A fresh import clears the assignments.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "pins dispatch times to PADs, and a fresh start clears them again".

### 3.5 PADs from the schedule

- [x] The morning Itineraries tab has a **PADs from Schedule** button.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "has a tab for each export..." (only the Itineraries tab has the button).
- [x] It copies each driver's PAD from the Weekly Schedule tab, joined on Transporter ID.
      Proved by the parity check (`routes.json`, the "adopted" scenarios on 2026-09-01 and 2026-09-14) and `appState.test.ts`.
- [x] The status bar says how many came over, how many are scheduled but unassigned there, and
      how many are not on the schedule at all.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "PADs from Schedule says how many came over...", `apps/desktop/src/main/handlers/dataPages.test.ts`: "copies PADs from the schedule, stopping with the old words when it cannot", and the Electron smoke check, whose counts are the harness's `adopt_result` for 2026-09-01 and 2026-09-14 (`routes.json`).
- [x] Re-grabbing restates every row.
      Proved by `appState.test.ts`: "the day state, against the old app".
- [x] Confirming the Assign PADs dialog afterwards replaces the copied PADs with what the dialog
      says.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "replaces PADs copied from the schedule with what the PAD window says afterwards".

### 3.6 Keeping the clocks apart

- [x] Each export keeps its own PAD map (a schedule start time is when the associate reports; a
      planned departure is when the van leaves).
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps a PAD map for each export, since the clocks differ".
- [x] PAD 1 on one tab is not necessarily PAD 1 on another.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps a PAD map for each export, since the clocks differ".

### 3.7 Weekly schedule reading

- [x] The schedule is read for the load-out date only, matched against day headings such as
      `Tue, 04/Aug`.
      Proved by `routedata.test.ts`: "weekly schedule fixtures" and scenario "the year in the day does not matter".
- [x] With no roster loaded, it reads today.
      `routedata.test.ts`: "the weekly schedule without a day" shows the reader defaults to today. The app's choice of day (the load-out date, else today) is checked in phase 2.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "reads the weekly schedule for today when no roster is loaded", and `apps/desktop/e2e/route-data.spec.ts`: "has a tab for each export..." (the tab says which day it reads for).
- [x] Asking for a day the file does not cover says which days it does have.
      Proved by `routedata.test.ts`: "refuses" tests of the weekly schedule fixtures.
- [x] A day cell holds the service type and the start time together; both are split out.
      Proved by `routedata.test.ts`: scenario "Tuesday: blocks, bullets, shared names and a headcount".
- [x] The "Total Rostered" row is the export's own headcount; where it disagrees with the
      number of filled cells, the page shows it next to the row count.
      Proved by `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "show the export's own headcount beside the row count where it disagrees" (the header note reads "export header says N").
- [x] The grid is what is read, not the headcount row.
      Proved by `routedata.test.ts`: scenarios "Tuesday: blocks..." and "Monday has nobody but a headcount".

---

## 4. Assigning vans

**Assign Vans** fills the Vehicle and VIN columns.

### 4.1 Who needs a van

- [x] Who needs a van is decided by Service Type, and only Service Type.
      The rule itself is checked by `serviceType.test.ts`: "who needs a van". The assignment run is checked in phase 2.
      Proved by the parity diff `vans` on all three days (who is in `assignments`).
- [x] A driver on a route-shaped shift type but with no service type does not get a van.
      The rule itself is checked by `serviceType.test.ts`: "who needs a van" (does not look at the shift type). The assignment run is checked in phase 2.
      Proved by the parity diff `vans` on all three days: two of the fixture days have such drivers, and none is given a van.
- [x] A driver with a service type but a different shift type (for example a lead) does get
      one.
      The rule itself is checked by `serviceType.test.ts`: "who needs a van" (does not look at the shift type). The assignment run is checked in phase 2.
      Proved by the parity diff `vans` on all three days: every fixture day has such drivers, and they are considered.
- [ ] Riders are skipped (see 1.2).
      The rule itself is checked by `serviceType.test.ts`: "who needs a van". The assignment run is checked in phase 2.

### 4.2 The order of rules

- [x] **Skill and clearance are absolute:** a driver without the Step Van qualification is never
      put in a step van.
      Proved by the parity diff `vans` on all three days (`eligible_vins`) and `assignment.test.ts`: "holds skill and the LMR list as hard gates".
- [x] A Last Mile Rental never goes to anyone off the LMR approved list.
      Proved by the parity diff `vans` on all three days and `assignment.test.ts`: "holds skill and the LMR list as hard gates".
- [x] A grounded van is not in the pool at all.
      Proved by the parity diff `vans` on all three days (`assignable_vehicles`, with the fixture database's grounded vans) and `state/vans.test.ts`: "keeps an override only where it differs from the export".
- [x] A self-owned van is not in the pool at all (handed out by hand).
      Proved by the parity diff `vans` on all three days (`assignable_vehicles`) and `state/vans.test.ts`: "keeps an override only where it differs from the export".
- [x] Nothing below this step can override any of it.
      Proved by `assignment.test.ts`: "never lets priority open a van the skill gate has closed" and the parity diff `vans` on all three days.
- [x] **The right kind of van:** the service type the route asked for is matched exactly first.
      Proved by the parity diff `vans` on all three days ("service-type") and `assignment.test.ts`: "works through affinity, last time, service type, family and qualification in that order".
- [x] Where the fleet has no word for the service type, the vehicle family answers (for
      example a nursery route takes an electric van).
      Proved by the parity diff `vans` on all three days ("vehicle-family") and `assignment.test.ts`: the same test.
- [x] Only after both fail does it fall back to a van the driver is merely qualified for.
      Proved by the parity diff `vans` on all three days ("qualified-only") and `assignment.test.ts`: the same test.
- [x] Fallback assignments are reported separately.
      Proved by the parity diff `vans` on all three days (`result.loose`) and `assignment.test.ts`: the same test.
- [x] **Affinity:** a driver's primary van wins, then their secondary, but only if it suits the
      work they have today (judged on family).
      Proved by the parity diff `vans` on all three days ("affinity-primary") and `assignment.test.ts`: the same test.
- [x] **Continuity:** the van on the Previous Roster comes after affinity.
      Proved by the parity diff `vans` on all three days ("previous-day") and `assignment.test.ts`: the same test.
- [x] Where affinity cannot be honoured outright, vans are preferred in this order: the
      driver's own, then anything going spare, and only last one belonging to somebody who is in
      today.
      Proved by `assignment.test.ts`: "leaves a van held by somebody in today until last".
- [x] A van whose holders are all off today counts as going spare, in the same band as a van
      nobody has claimed.
      Proved by `assignment.test.ts`: "leaves a van held by somebody in today until last".
- [x] **Van priority:** of the vans a driver could take, the highest Priority number goes first.
      Proved by the parity diff `vans` on all three days (the fixture database's priorities) and `assignment.test.ts`: "lets priority beat the name order".
- [x] A van with no priority number sits below every van that has one.
      Proved by `assignment.test.ts`: "lets priority beat the name order" and "reads a priority the way Python reads a float".
- [x] Priority outranks the general vehicle order.
      Proved by `assignment.test.ts`: "lets priority beat the name order, and an unclaimed van beat a claimed one".
- [x] Priority never opens a van that skill or the LMR list has closed.
      Proved by `assignment.test.ts`: "never lets priority open a van the skill gate has closed".
- [x] Priority never takes a van off a driver who is in today.
      Proved by `assignment.test.ts`: "never lets priority take a van off a driver who is in today".
- [x] Where two vans have the same priority, or neither has one, the one nobody has a claim on
      goes first.
      Proved by `assignment.test.ts`: "lets priority beat the name order, and an unclaimed van beat a claimed one".
- [x] **Vehicle order:** step vans, then branded, then rentals.
      Proved by `assignment.test.ts`: "orders vans by kind, then name length, then name".
- [x] **A stable tiebreak** is used, not a random pick: running it twice on the same data gives
      the same answer.
      Proved by the parity diff `vans` on all three days (the same answer as the old app on every day) and `assignment.test.ts`: "orders vans by kind, then name length, then name".

### 4.3 Tenure

- [x] Tenure is lifetime routes delivered, from the Tenured Workforce export.
      Proved by the parity check (`links.json`, its tenure book, on all three days) and `appState.test.ts` ("loads everything back the way it was saved, with tenure folded only forward").
- [x] Drivers are served most routes first.
      Proved by the parity diff `vans` on all three days and `assignment.test.ts`: "puts the highest-priority van with the most experienced driver".
- [x] Within an equal count, whoever leaves soonest gets first pick.
      Proved by `assignment.test.ts`: "reads an unknown count as brand new, and lets the clock decide a tie".
- [x] Where two drivers hold a slot on the same van and both are in today, the more experienced
      one keeps it.
      Proved by `assignment.test.ts`: "lets the more experienced of two holders keep the van".
- [x] The other driver falls through to the rest of the order.
      Proved by `assignment.test.ts`: "lets the more experienced of two holders keep the van".
- [x] The highest-priority van lands with the most experienced driver who can take it.
      Proved by `assignment.test.ts`: "puts the highest-priority van with the most experienced driver".
- [x] An unknown count reads as brand new.
      Proved by `assignment.test.ts`: "reads an unknown count as brand new, and lets the clock decide a tie".
- [x] With no counts imported at all, everybody ties and the dispatch clock decides.
      Proved by `assignment.test.ts`: "reads an unknown count as brand new, and lets the clock decide a tie".

### 4.4 The run

- [x] It is a full recompute: every row is emptied before the run.
      Proved by the parity diff `vans` on all three days (`roster_after`) and `state/vans.test.ts`: "assigns afresh, clearing every row first".
- [x] Grounding a van moves its driver.
      Proved by the parity diff `vans` on all three days (grounded vans in the fixture database stay out of the run).
- [x] A driver who loses their route loses the van with it.
      Proved by `state/vans.test.ts`: "assigns afresh, clearing every row first".
- [x] **File > Clear Van Assignments** empties the Vehicle and VIN columns.
      _The rule is checked by `state/vans.test.ts`: "swaps a route, van and DWP numbers together, and marks both by hand". The menu comes in phase 4._
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "brings route data and the DWP over, assigns vans, and clears them again" and `apps/desktop/e2e/load-out.spec.ts`: "Clear Roster asks first; the More menu clears vans and manual links". The new app has no menu bar, so it sits in the Roster tab's More menu.
- [x] The run ends with a read-out: who got what, and on what basis.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Assign Vans shows what the run did, with anyone not placed first" and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)" (the read-out gives the old counts).
- [x] Anyone it could not place is listed first, with the reason.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Assign Vans shows what the run did, with anyone not placed first", `pages/loadOut/rules.test.ts`: "says what Assign Vans did, and the read-out puts anyone not placed first", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)".
- [x] It never invents an assignment: a driver with no qualified van free is left empty.
      Proved by the parity diff `vans` on all three days (`reason`) and `assignment.test.ts`: "names the gate that closed".
- [x] The basis of each assignment stays on the roster in Matched On.
      Proved by the parity diff `vans` on all three days (`roster_after[].assign_method`).

---

## 5. Vehicle Data page

### 5.1 Vehicle Management tab

- [x] Imports the fleet from `VehiclesData.xlsx`.
      Proved by `vehicles.test.ts`: "vehicle export fixture".
- [x] **Vehicle** (`vehicleName`) is the value that ends up in the Vehicle column.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "shows the fleet with the old columns, status words, and colours with words" (the Vehicle column is the name).
- [x] **Status**: Operational or Grounded, and editable.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "shows the fleet with the old columns..." and "Ground / Return flips the ticked vans...".
- [x] **Service Type** uses the same vocabulary as the route exports.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Status and Service drop-downs narrow the fleet" (the drop-down lists the fleet's own service types) and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "the Vehicle Management table".
- [x] **Category**: Step Van, Rental Van or Branded Van.
      Proved by `vehicles.test.ts`: "vehicle export fixture" and `models.test.ts`: "vehicles".
- [x] **Assign**: Auto, or Manual for a self-owned van (never auto-assigned).
      Proved by the parity diff `vans` on all three days (`fleet[].manual_only`, `assignable_vehicles`).
- [x] **Priority**: a number set by the user, highest first.
      The number is set here: `apps/desktop/e2e/vehicle-data.spec.ts`: "Set Priority asks for a whole number, refuses words, and empty takes the number away" and `apps/desktop/src/main/handlers/dataPages.test.ts`: "sets a priority number, empties it, and refuses words". Highest first is the van assignment, proved by the parity diff `vans` (25 priorities held).
- [x] Priority is kept apart from the export, so a re-import does not wipe it.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps affinity, statuses set here and LMR approval when the fleet is cleared and brought back" (the priority comes back with the fleet).
- [x] Make / Model, Plate, Year and Ownership identify the van.
      Proved by `vehicles.test.ts`: "vehicle export fixture" sample rows.
- [x] **Registration** is flagged amber inside 45 days and red once expired.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "shows the fleet with the old columns, status words, and colours with words" and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "flags a registration amber inside 45 days and red once expired".
- [x] **Note** says why a van is grounded or when a rental is due back.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "shows the fleet with the old columns..." and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "writes the note, the assign word and the ownership as the old page did".
- [ ] **VIN** fills the roster's VIN column.
- [x] **Ground / Return** flips the selected vans.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Ground / Return flips the ticked vans, and with none ticked the one you are on" and "pressing Ground / Return twice puts the van back, reading the van as it is now". Several vans are picked with the tick boxes in the first column, since the new table follows one row at a time.
- [x] Double-clicking a row also flips it.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "double-clicking a van flips it, and the right-click menu has the old three items".
- [x] Grounding is stored apart from the export and marked "(set here)".
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "grounds and returns vans, keeping the change apart from the export" and `apps/desktop/e2e/vehicle-data.spec.ts`: "shows the fleet with the old columns...".
- [x] Re-importing tomorrow's vehicle data does not quietly put a grounded van back on the road.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps a grounded van grounded through a new import, and goes back with \"match the export\"".
- [x] **Match the export again** (right-click) drops the local status.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "double-clicking a van flips it, and the right-click menu has the old three items" and `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps a grounded van grounded...".
- [x] Setting a van back to what the export already says removes the override instead of
      storing a no-op.
      Proved by `state/vans.test.ts`: "keeps an override only where it differs from the export".
- [x] Vehicle rows are read by header name, with a duplicate VIN dropped and anything not
      plainly "OPERATIONAL" treated as grounded.
      Proved by `vehicles.test.ts`: scenario "title rows, dates, statuses, duplicates and blanks".
- [x] **Clear Vehicles** empties the fleet but keeps affinity, grounding and LMR approval.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps affinity, statuses set here and LMR approval when the fleet is cleared and brought back", `apps/desktop/e2e/vehicle-data.spec.ts`: "Clear Vehicles asks, and says what is kept", and the Electron smoke check.

### 5.2 Van Affinity tab

- [x] Each van has two preferred drivers and two backups.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Van Affinity shows two preferred drivers and two backups for each van".
- [x] A driver holds at most one van of each kind.
      Proved by `state/vans.test.ts`: "gives up a slot of the same kind when taking another".
- [x] Double-clicking a driver column fills it.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "double-clicking a driver column opens the window, which starts on active drivers who hold nothing".
- [x] Right-clicking a driver column assigns or empties it.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "right-click assigns or empties a slot, and says so when it is already empty".
- [x] Both work off where the pointer is (there is no toolbar button for either).
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "right-click assigns or empties a slot..." (the menu offers the items only on a driver column; elsewhere the old nudges show) and "Clear All asks first, and \"Group by vehicle\" off is read only" (no toolbar button for either).
- [x] Taking a primary slot when you already hold one elsewhere moves you.
      Proved by `state/vans.test.ts`: "gives up a slot of the same kind when taking another".
- [x] When that happens the old slot empties and the status bar says what was given up.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "moves a driver who takes a second slot of the same kind, and says what was given up" and `apps/desktop/e2e/vehicle-data.spec.ts`: "double-clicking a driver column opens the window..." (the status line says what was given up).
- [x] **Group by vehicle** shows one row per associate with their primary and secondary van.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "the driver side shows each associate's primary and secondary van". The old page shows one row per van while the box is ticked and one row per associate when it is cleared; the new page does the same.
- [x] That grouped view is read-only (assignments are made on the vehicle side).
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Clear All asks first, and \"Group by vehicle\" off is read only".

### 5.3 LMR Approved Drivers tab

- [x] Shows who may take a Last Mile Rental out.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "LMR Approved Drivers lists who may take a rental, with the rental vans in the header".
- [x] It is a separate clearance from qualifications: being EDV qualified does not put you in a
      rental.
      Proved by `assignment.test.ts`: "holds skill and the LMR list as hard gates".
- [x] Any number of associates can be selected.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Approve and Remove work on every ticked associate, and say who changed".
- [x] Assignment treats the list as a hard gate.
      Proved by the parity diff `vans` on all three days (`eligible_vins`) and `assignment.test.ts`: "holds skill and the LMR list as hard gates".
- [x] If only rentals are left, unapproved drivers are reported as unassigned with that reason.
      Proved by `assignment.test.ts`: "names the gate that closed".
- [x] Double-click or space toggles approval.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "double-click toggles approval; the right-click menu does the same for the ticked rows" and "Space toggles approval for the row you are on...".
- [x] The right-click menu and the toolbar do the same for a whole selection.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "Approve and Remove work on every ticked associate..." and "double-click toggles approval; the right-click menu does the same for the ticked rows".

### 5.4 What survives

- [x] Affinity, grounding and LMR approval are keyed by VIN or Transporter ID, not by name.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps affinity, statuses set here and LMR approval when the fleet is cleared and brought back" (every command names a van by VIN and a driver by Transporter ID) and `packages/storage/src/persistence.test.ts`.
- [x] All three survive a re-import and **Clear Vehicles**.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "keeps affinity, statuses set here and LMR approval when the fleet is cleared and brought back" and "keeps a grounded van grounded through a new import...", and the Electron smoke check (Clear Vehicles, then bringing the fleet back).

---

## 6. Associates page

- [x] Shows the anchor records: Transporter ID, qualifications, ID expiration, contact details
      and status.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "shows the old columns, the counts, and the ID state as a chip with words".
- [x] **On Load Out** marks who is on today's sheet.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "shows the old columns..." and "filters by status, one qualification, the load out, and the search box".
- [x] Filter by status.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "filters by status, one qualification, the load out, and the search box".
- [x] Filter by a single qualification.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "filters by status, one qualification, the load out, and the search box".
- [x] Filter by search.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "filters by status, one qualification, the load out, and the search box".
- [x] Narrow to today's load out.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "filters by status, one qualification, the load out, and the search box".
- [x] Imports the associate export by header name, joining on the "Name and ID" and
      TransporterID columns.
      Proved by `associates.test.ts`: "associate export fixture" and the associate scenarios.
- [x] A file that is not an associate export is refused with a message that lists the headers
      found.
      Proved by `associates.test.ts`: scenarios "not an associate export", "only the transporter column is missing", "long and odd headers".
- [x] An Excel file picked by mistake is refused with a message saying so.
      Proved by `associates.test.ts`: scenario "an Excel file saved as csv".
- [x] A duplicate Transporter ID in the export is dropped.
      Proved by `associates.test.ts`: scenario "aliases, quotes, duplicates, blanks, qualifications and dates".
- [x] Qualifications are split on commas, squeezed of stray spaces and de-duplicated.
      Proved by `associates.test.ts`: the same scenario.
- [x] ID expiration dates are read in the formats the export uses.
      Proved by `associates.test.ts`: the same scenario.
- [x] **Clear Associates** empties the list but keeps lifetime route counts.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "clears the list but keeps the lifetime route counts" and `apps/desktop/e2e/associates.spec.ts`: "Clear Associates asks first, says what is kept, and then empties the list".
- [x] **Ctrl+I** (File > Import Associate Data...) imports the associate list, from any page.
      Proved by `apps/desktop/e2e/shortcuts-and-drops.spec.ts`: "Ctrl+I works from any page: it opens Associates and runs Import Associates" and the smoke test: "Ctrl+O and Ctrl+I work from another page". The new app has no menu bar; the key opens the Associates page and runs its Import Associates button (which asks before replacing a list).

### 6.1 Lifetime Routes (tenure)

- [x] **Lifetime Routes** is the app's measure of tenure.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "shows the old columns..." (the Lifetime Routes column) and "Lifetime Routes shows the newest-week rule, what is kept, and who has no count yet".
- [x] It comes from its own file: **Import Tenure** (or File > Import Tenure Data...) reads the
      Tenured Workforce export.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "Import Tenure says how many drivers have a count, through which week, and how many associates are covered". The button is on the Associates tab and the Lifetime Routes tab; the File menu entry is the shell's (section 10).
- [x] The file is a weekly history; only each driver's most recent week counts.
      Proved by `tenure.test.ts`: scenario "latest week wins; spellings and number formats".
- [x] The export misspells its own anchor column ("Trabsporter ID"); both spellings work.
      Proved by `tenure.test.ts`: that scenario, and "the correct spelling of the anchor column".
- [x] A count like `1,234` or `43.0` reads as a number; a negative or odd value is skipped.
      Proved by `tenure.test.ts`: "reading a count".
- [x] A malformed row does not sink the file.
      Proved by `tenure.test.ts`: scenarios "latest week wins..." and "no usable rows".
- [x] The header says how current the data is (for example "Week 34, 2026").
      Proved by `tenure.test.ts`: "tenure fixtures" (the week label) and `models.test.ts`: "tenure books".
- [x] The status bar says how many associates it covered.
      Proved by `apps/desktop/e2e/associates.spec.ts`: "Import Tenure says how many drivers have a count..." and `apps/desktop/src/renderer/pages/pageHelpers.test.ts`: "say what a Tenured Workforce file did, and when it was older than what is kept".
- [x] Counts are keyed by Transporter ID and stored apart from the associate export.
      _Proved by `packages/storage/src/persistence.test.ts`: "tenure and associates are stored
      apart"._
- [x] Re-importing associate data does not wipe counts, and neither does **Clear Associates**.
      _Proved by `packages/storage/src/persistence.test.ts`: "re-importing or clearing associates
      does not touch route counts"._
- [x] Re-importing tenure data folds in rather than replaces.
      Proved by the parity check (`links.json`, its tenure book, on all three days) and `appState.test.ts` ("loads everything back the way it was saved, with tenure folded only forward").
- [x] A driver missing from this week's file keeps the count a previous file gave them.
      Proved by the parity check (`links.json`, its tenure book, on all three days) and `appState.test.ts` ("loads everything back the way it was saved, with tenure folded only forward").
- [x] Each count is stamped with the week it was read in.
      Proved by `tenure.test.ts`: "tenure fixtures" sample records.
- [x] Counts only ever move forward: an older export picked by mistake never rolls anybody
      back, and the status bar says so.
      Proved by `apps/desktop/src/main/handlers/dataPages.test.ts`: "says when an older Tenured Workforce file was brought in after a newer one", `apps/desktop/e2e/associates.spec.ts`: "an older Tenured Workforce file says the newer counts were kept", and the Electron smoke check.
- [ ] More routes wins a van two drivers hold between them, and picks first from what is free.
- [x] A blank count reads as brand new.
      Proved by `models.test.ts`: "associates" (an unknown count reads as 0).
- [x] **Addition, not in the old app: Clear Lifetime Routes.** A button on the Lifetime Routes
      tab forgets every count and where they came from, after asking first. The associate list
      and the roster are kept. Approved by Jonathan on 2026-10-08.
      Proved by `packages/storage/src/store.test.ts` ("clears every count and the source..."),
      `packages/core/src/state/appState.test.ts` ("clears the lifetime route counts and keeps the
      associates and the roster"), `apps/desktop/src/main/handlers/dataPages.test.ts` ("clears the
      lifetime route counts and keeps the associate list") and
      `apps/desktop/e2e/shortcuts-and-drops.spec.ts` ("Clear Lifetime Routes asks first, starting on
      No, and keeps the associate list").

---

## 7. How the two files are bridged (matching)

- [x] The load-out sheet and the associate export are joined by walking from strictest to
      loosest and recording which rule fired.
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.
- [x] **manual**: a hand link always wins.
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.
- [x] **exact**: identical after normalising (case, accents, punctuation, Jr/III, doubled
      spaces).
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.
- [x] **name**: same first and last name, middle names and initials ignored.
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.
- [x] **fuzzy**: close enough on the full name, to allow for typos (similarity at or above
      0.88), flagged as **Verify match**.
      Proved by `matching.test.ts` (the similarity score is checked against Python's) and `appState.test.ts` ("Verify match" in the Check text).
- [x] **none**: nothing found, or several candidates. It is never guessed.
      Proved by `matching.test.ts`: "matchDriver".
- [x] Several candidates for one name are reported with the candidates, so the user decides.
      Proved by `matching.test.ts`: "matchDriver".
- [x] Fuzzy matching looks among people sharing the surname first.
      Proved by `matching.test.ts`: "matchDriver".
- [x] A hand link to an associate no longer in the export falls through to automatic matching.
      Proved by `matching.test.ts`: "matchDriver".
- [x] Clearing a link ("cleared") means no associate, on purpose.
      Proved by `matching.test.ts`: "matchDriver".
- [x] Manual links are stored by normalised driver name, so they carry over to tomorrow's sheet.
      Proved by the parity check (`links.json` on all three days) and `appState.test.ts` ("loads everything back the way it was saved...").
- [x] **File > Clear Manual Links** resets all of them.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "forgets every manual link" and `apps/desktop/e2e/load-out.spec.ts`: "Clear Roster asks first; the More menu clears vans and manual links" (in the Roster tab's More menu).
- [x] **Match automatically** on one row resets just that driver.
      Proved by `apps/desktop/src/main/handlers/loadOut.test.ts`: "links by hand, marks as not an associate, and goes back to automatic matching" and `apps/desktop/e2e/load-out.spec.ts`: "the link window: suggestions first, search, link, not an associate".
- [x] The match summary counts drivers per method for the header.
      Proved by the parity check (`matching.json` on all three days) and `matching.test.ts`.

---

## 8. Importers and files

Rules that apply to every file the app reads.

- [x] Every importer finds columns by header name, not position, so extra title rows or
      reordered columns still parse.
      Proved by The scenarios "header names with other spellings" (load-out), "headers in another order and case" (tenure), "other header spellings and column order" (vehicles), and the title-row scenarios of the other importers.
- [ ] If Excel or OneDrive has a file locked, the app reads a temporary copy instead.
- [x] Times are normalised to the form `9:50am` before they are grouped, so `9:50 AM` does not
      become a second dispatch time.
      Proved by `routedata.test.ts`: scenario "shared routes, placeholders, clock spellings".
- [x] **Load-out sheet:** finds the header row (a row with Driver and ShiftType).
      Proved by `loadout.test.ts`: "load-out sheet fixtures" and its scenarios.
- [x] The load-out date comes from the title line (for example "Load Out Export for Tuesday,
      August 04th 2026"), or else from the file name.
      Proved by `loadout.test.ts`: "load-out sheet fixtures" and the date scenarios.
- [x] Placeholders like "No data", "n/a" and a dash are read as empty (except in Status).
      Proved by `loadout.test.ts`: scenario "title date, spacer rows, placeholders and cell kinds".
- [x] Rows with no driver (spacers, footers) are skipped.
      Proved by `loadout.test.ts`: the same scenario.
- [x] Each importer shows a plain message when the file is the wrong kind, empty, or has a
      header row but no data rows.
      Proved by The refusal scenarios in all six importer test files.
- [x] **DWP, Routes, Itineraries and Schedule** read the first sheet that carries the header
      (the schedule reads its "Rostered Work Blocks" sheet).
      Proved by the Electron smoke check (`apps/desktop/scripts/smokeOtherPages.mjs`), which brings in the made-up DWP, Routes, Itineraries and Weekly Schedule files through the Route Data tabs and finds the harness's row counts on all three days, and by the importers' own tests (`dwp.test.ts`, `routedata.test.ts`).
- [x] Amazon placeholders in route files ("Missing", "n/a" and so on) are read as empty.
      Proved by `routedata.test.ts`: scenario "shared routes, placeholders, clock spellings".

---

## 9. Layout persistence and tables

### 9.1 Everything that survives a restart

- [ ] Roster, associates, manual links, route data, DWP data, PAD assignments, vehicles,
      grounding, priorities, affinity, LMR approvals, tenure, print layouts, the Previous
      Roster and column layouts are all saved and come back when the app reopens.
      _The saving half is checked by `packages/storage/src/persistence.test.ts`: "everything the
      app keeps is still there". The app half is checked in phase 3._

### 9.2 Tables

- [x] Every column on every table sorts: click the heading, click again to reverse.
      The shared table sorts this way, proved by `apps/desktop/e2e/data-grid.spec.ts`: "sorts the way the old app did", and `DataGrid/sort.test.ts`.
      Page 4c's ten tables (Route Data four, Vehicle Data four, Associates two) are proved by `apps/desktop/e2e/data-pages-tables.spec.ts`: "the Route Data tables sort by heading and keep their layout under their own names", and the same for Vehicle Data and Associates.
      The Load Out tables are proved by `apps/desktop/e2e/data-grid.spec.ts`: "sorts the way the old app did" (the Roster) and `apps/desktop/e2e/load-out.spec.ts`: "Available Vans and Previous Roster sort by heading and keep their layout under their own names". Every data table in the app is now the shared table. The picker windows sort by heading too, as the old ones did (`apps/desktop/e2e/load-out.spec.ts`).
- [x] **Reset** returns a table to the page's own order.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "sorts the way the old app did" (Reset at the end).
- [x] Columns are sized to their contents, measured against the whole table, so they hold still
      while a search narrows it.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "the search box narrows the table", and `DataGrid/filter.test.ts`.
- [x] The Roster's columns can be dragged into any order and resized, kept per table.
      Proved by `apps/desktop/e2e/data-grid.spec.ts`: "a dragged and resized column stays put after a reload", on the real Roster tab, kept through `layout:get` and `layout:set` under the old name "roster".
- [x] That drag-and-resize ability works on any other table, not only the Roster.
      The shared table has it, proved by `apps/desktop/e2e/data-grid.spec.ts` (now on the Roster tab).
      Page 4c's tables keep their layout under their own names (`apps/desktop/e2e/data-pages-tables.spec.ts`: "a column dragged on one of these tables stays put after a reload").
      The Load Out tables keep their layout under their own names (`apps/desktop/e2e/load-out.spec.ts`: "Available Vans and Previous Roster sort by heading and keep their layout under their own names"). With page 4c's test above, every data table in the app is covered. The picker windows and the Print tab's column list are not data tables and, as in the old app, have no dragging.
- [x] Sorting reads a column the way its contents read: `9:50am` comes before `10:20am`.
      Proved by `clock.test.ts`: "sortKey".
- [x] Van `51` sorts before `619454`, before `655103 (LMR)`.
      Proved by `clock.test.ts`: "sortKey".
- [x] Empty cells sink to the bottom.
      Proved by `clock.test.ts`: "sortKey".
- [ ] The sort rule is shared with the Print tab, so a handout is in the same order as the
      screen it came off.
- [ ] The two pickers open in their own order (suggested matches first, active associates
      first) and sort only once a heading is clicked.

---

## 10. Dialogs and menus

- [x] **Link dialog:** picks an associate for a driver by hand.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "the link window: suggestions first, search, link, not an associate".
- [x] **Roster pick dialog:** who takes this route or van instead.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Reassign this route: asks, lists drivers with no work first, and swaps with the others" and "Reassign this van lists only drivers with a route, those without a van first".
- [x] **Van pick dialog:** which free van, best fit first.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Unassign this van, and Assign a Van from the free ones, best fit first".
- [x] **Shared route dialog:** who a multi-driver route belongs to.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "bringing a file in asks who shared routes belong to..." and "right-clicking the Driver column of a shared route reopens the choice...".
- [x] **PAD dialog:** dispatch time to PAD.
      Proved by `apps/desktop/e2e/route-data.spec.ts`: "bringing a file in asks who shared routes belong to..." and "Assign PADs reopens the window with what was chosen...".
- [x] **Source dialog:** which export the roster takes route data from.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Bring Over Route Data asks which export, then brings the DWP over after a day check" and "Bring Over Route Data takes the one export there is without asking", `pages/loadOut/rules.test.ts`: "describes each route export in the source window", and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)". One window, opened by Bring Over Route Data on the Load Out page.
- [x] **Driver dialog:** associate to van affinity slot.
      Proved by `apps/desktop/e2e/vehicle-data.spec.ts`: "double-clicking a driver column opens the window, which starts on active drivers who hold nothing" and "a click on a heading sorts the driver window; it stays in its own order until then".
- [x] **Assign dialog:** what a van assignment run did.
      Proved by `apps/desktop/e2e/load-out.spec.ts`: "Assign Vans shows what the run did, with anyone not placed first" and the smoke test: "a fixture day on the Load Out page ends as the old app did (2026-09-01)".
- [ ] File menu: Import Sheet, Import Tenure Data, Export Roster, Export with DWP, Print Page,
      Print Vans, Clear Van Assignments, Clear Manual Links.

---

## 11. The app shell (new in v2)

The window around the pages. The old app had a menu bar and tabs; the new one has a left menu.
The pages inside are ticked in sections 1 to 10 as they are built. These lines are proved by
the app smoke test (`apps/desktop/scripts/smoke.mjs`), which starts the built app and clicks
through it; the check names below are the ones it prints.

- [x] The left menu has Home, Load Out, Route Data, Vehicle Data, Associates, Previous Roster,
      How to use, Features log and Settings, and every page opens.
      Proved by the smoke test: "the left menu lists every page, in order" and "page opens: ...".
- [x] The menu works with the keyboard: Tab moves between items and Enter opens one.
      Proved by the smoke test: "the menu works with Tab and Enter".
- [x] The page you were on comes back the next time the app opens.
      Proved by the smoke test: "the last page, theme and text size are remembered".
- [x] Colours can be Light, Dark or High contrast, chosen in Settings, and are remembered.
      Proved by the smoke test: "theme: light, dark and high contrast change the page" and "the
      last page, theme and text size are remembered".
- [x] **A-** and **A+** at the top make the text smaller and bigger, a middle button puts it back,
      and the size is remembered.
      Proved by the smoke test: "text size: A+, A- and reset change the size" and "the last
      page, theme and text size are remembered".
- [x] **What's new** shows once after an update and not again.
      Proved by the smoke test: "What's new shows after an update, once" and "What's new does
      not show a second time". The note for the current version is required by
      `packages/core/src/releaseNotes.test.ts`.
- [x] The Features log page lists every release note.
      Proved by the smoke test: "the Features log lists the note for this version".
- [x] Settings shows the app version.
      Proved by the smoke test: "Settings shows the app version".
- [x] Settings has **Open data folder**, which opens the folder that holds the saved data.
      Proved by the smoke test: "Open data folder opens the data folder".
- [x] Settings has a **Demo mode** switch that shows made-up drivers and vans instead of the real
      saved data, and the real data is back when it is turned off.
      Proved by the smoke test: "Demo mode loads made-up data, then goes away" and
      `apps/desktop/src/main/dataSource.test.ts`.
- [x] The saved data opens when the app starts, and the start-up log says how many tables it has
      (a count, never names).
      Proved by the smoke test: "the main process opened the saved data and counted its tables".
- [x] The window opens at the size and place it was left at.
      Proved by the smoke test: "the window comes back at the size and place it was left at" and
      `apps/desktop/src/main/windowState.test.ts`.
- [ ] A small note at the top of the window says when an update is being checked, downloaded or
      ready, with a **Restart to update** button.
      The words are checked by `apps/desktop/src/renderer/shell/shell.test.ts`: "update pill".
      Still to prove: a real update from a GitHub Release (phase 6 install test).
- [x] Home has a **first-day checklist** with five steps (driver list, vans, today's load-out
      sheet, route data, assign vans and print). Each step ticks itself off when the app sees it
      done, has a one-line reason, a button that does it and a **?** that says where to get the
      file. A bar shows how many are done. It hides itself once all five are done; **Show the
      checklist again** is on How to use (and in Help and Settings). **Try it with made-up data**
      turns on demo mode.
      Proved by `apps/desktop/src/renderer/help/checklist.test.ts` (which steps are done, what each
      button does), `apps/desktop/src/renderer/help/printed.test.ts` (printing ticks the last step),
      `apps/desktop/e2e/help-checklist.spec.ts` (ticks as the data changes, buttons press the page's
      own import, the ? note, hides when done, comes back from How to use) and the smoke test: "the
      first-day checklist shows on a fresh start, with nothing ticked" and "demo mode ticks the
      first two steps of the checklist".
- [x] Each page (Home, each Load Out tab, Previous Roster, Route Data, Vehicle Data, Associates,
      Settings) has a short **tour** of 3 to 6 steps over its real buttons, with Back, Next, Skip
      and "Step 2 of 5". It runs by itself the first time the page opens, once per person;
      **Help > Take the tour of this page** runs it again. Esc skips, Enter goes on. It can be
      turned off in Settings. The tooltips are readable in all three themes and at the biggest
      text size.
      Proved by `apps/desktop/src/renderer/help/tours.test.ts`,
      `apps/desktop/e2e/help-tours.spec.ts` (first visit, not the second, Take the tour, Esc,
      Enter, each Load Out tab, turned off, contrast in three themes at 100% and 150%) and the
      smoke test: "Help > Take the tour runs the page tour, and Esc skips it".
- [x] **How to use** has a normal day step by step, what the colours and chips mean, shortcuts and
      dropping files, what to do when something goes wrong (wrong-day DWP, driver not found, no
      van and why, a file that will not open, ID expiry), the checklist and tours, and **Ask a
      question**, which warns that the forum is public and opens it in the browser. Only the help
      forum and the app's release pages can be opened.
      Proved by `apps/desktop/e2e/help-page.spec.ts` (jump-to buttons, folded problems, pictures,
      Ask a question), `apps/desktop/src/shared/links.test.ts` and
      `apps/desktop/src/main/handlers/app.test.ts` (only allowed links open), and the smoke test:
      "Ask a question opens the help forum, and only allowed links open".

---

## Deliberately dropped

A line moves here only with a reason Jonathan has approved, written next to it.

### The old menu bar

The new app has no menu bar. Jonathan answered on 2026-10-08:

- [x] **Ctrl+I** (File > Import Associate Data...) is restored as a shortcut. It works from
      every page (see section 6). Approved 2026-10-08.
- [x] **F5** (File > Reload) is not needed: the app reads the saved data again by itself after
      every change. Dropped, approved 2026-10-08.
- [x] **Help > About** lives in Settings: the app's name, its version and a short line on what
      it does. Approved 2026-10-08.
      Proved by the smoke test: "Settings shows the app version" (the version and the About line).

## Approved additions (2026-10-08)

Things the new app does that the old one did not, or does a little differently. Jonathan read
each one and said keep it on 2026-10-08.

- [x] **Hidden columns** in every table, kept per computer only (section 1.2).
- [x] **The driver panel**: picking a driver on the Roster shows their associate record, badges
      and issues beside the table.
- [x] **The More button** on the Roster toolbar holds Clear Van Assignments and Clear Manual
      Links (the old File menu had them).
- [x] **Tick-box picking**: the Vehicle Data tables pick several rows with a tick box in the first
      column, since the new table follows one row at a time.
- [x] **The two Vehicle Management buttons** (Match All to Export and Clear Priorities), each
      asking first.
- [x] **The associate replace question**: importing an associate list asks before it replaces the
      one there.
- [x] **The DWP same-day line**: the DWP tab says whether the sheet is the roster's day.
- [x] **Curly apostrophes print** as they are, on the PDF and in Excel.
- [x] **Print buttons on the Print tab only** (Print Page, Print Vans, Preview), with Export
      Roster and Export with DWP on the Roster toolbar.
- [x] **Drag and drop**: a file dropped on the page that uses it is brought in, as if picked with
      the Import button (the same questions are asked first). Load Out's Roster tab takes the
      load-out sheet; Route Data takes each export on its own tab and the DWP sheet on the DWP
      tab; Vehicle Management takes the vehicle list; Associates takes the associate export on
      its tab and the Tenured Workforce file on Lifetime Routes. The tab lights up with words
      while a file is over it. A file of the wrong kind is refused in plain words, and a drop
      anywhere else does nothing.
      Proved by `apps/desktop/src/main/fileDrop.test.ts`, `apps/desktop/src/main/stateHost.test.ts`
      ("reads a dropped file through its token..." and "refuses a dropped file of the wrong
      kind..."), `apps/desktop/src/preload/preload.test.ts`, `apps/desktop/e2e/shortcuts-and-drops.spec.ts`,
      and the smoke test: "a load-out sheet dropped on the Roster tab comes in; a wrong file is
      refused" (a real file from the disk).
- [x] **Ctrl+P** on the Load Out page runs Print Page.
      Proved by `apps/desktop/e2e/print-tab.spec.ts`: "Ctrl+P on the Load Out page runs Print Page
      from any tab, and says so on the one status line".
- [x] **Questions before taking something away**: Clear Van Assignments and Unassign this van ask
      first, and Assign Vans asks first when a van was given by hand. Every red question starts
      on No, so Enter never clears anything by accident.
      Proved by `apps/desktop/e2e/load-out.spec.ts` ("Unassign this van...", "Clear Roster asks
      first...", "Remove from the roster asks first..."), `apps/desktop/e2e/shortcuts-and-drops.spec.ts`
      ("Assign Vans asks first when a van was given by hand"), `page-pattern.spec.ts`,
      `associates.spec.ts` and `vehicle-data.spec.ts` (Clear Previous Roster, Clear Associates
      and Clear Vehicles start on No).
- [x] **Clear Lifetime Routes** (section 6.1).
