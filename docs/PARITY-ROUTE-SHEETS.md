# Parity checklist: everything Route Sheet Distributor does

**Tick a box only when the feature exists in Loadout Builder and a test proves it.**

This is the list of everything the old Route Sheet Distributor (release 1.5.2) does that a person
can see or use, taken line by line from section 2 of
[`docs/RSD-MIGRATION-PLAN.md`](RSD-MIGRATION-PLAN.md). A phase ticks a row when the feature exists
and is tested, and says which test. A row marked **changed** is one of the deliberate differences
Jonathan approved in section 3 of the plan, with the item number. A row still unticked at the end
needs a reason under "Needs Jonathan" in the pull request.

The core (reading the PDF, deciding who gets each page, the email, the export files) is checked two
ways: the old app's own tests have twins in `packages/route-sheets/src/**/*.test.ts` with the same
names, and `npm run parity:rsd:diff` runs the old code and the new package over the same synthetic
route sheets and must show no difference (`scripts/parity/rsd/`).

---

## 1. Bringing files in

- [ ] **Changed (item 1).** The Associate Data `.csv` is not imported here. Matching reads the
      Associates page's list (the same export). Test: phase 2 host test.
- [ ] The "driver list is over a month old" reminder (amber, one calendar month after the import),
      on the Associates page and the Route Sheets page's driver-list card. Rule: `addMonth`.
      Test: 'Associate Data: due for a new import one calendar month after it was imported'
      (`packages/route-sheets/src/runs/rules.test.ts`, the rule); the pages in phase 3.
- [ ] **Changed (item 2).** The Routes export is not imported here. Matching reads the Route Data
      page's loaded Routes export, with every pipe-joined Transporter ID and name on a shared
      route; a title row above the header is skipped by the Route Data reader. Test: phase 2 host
      test proves the join gives the parity harness's distribution.
- [ ] **Changed (item 2).** When the loaded route data is the Itineraries or Weekly Schedule
      export, it is used the same way when it carries Transporter IDs; the page says which file
      it is using and asks for the Routes export when none is loaded. Test: phase 2 and 3.
- [ ] Route sheet PDF: one route per page; a long route spills onto a second page; blank pages are
      skipped; a page with no route code is reported. Test: 'PDF: a long route whose tables spill
      onto the next page is read as one sheet, and blank pages are skipped'
      (`packages/route-sheets/src/parser/pdf.test.ts`); parity `sheets.json`.
- [ ] Two PDF layouts: headings in one run or split into runs; the lost "fl" ligature in
      "overflow". Test: 'PDF: headings split into separate runs ("24" + "bags", "ETDT ·" + service)
      are still read'; parity for both `<day>` and `<day>-split-runs`.
- [ ] Drag the PDF onto the window. **Changed (items 1 and 2):** only the PDF is dropped here; the
      Routes export is dropped on the Route Data page. Test: phase 3 page test.
- [ ] **Changed (items 1 and 2).** "PDFs are read first so a Routes file dropped with them lands
      in the same run" and "a Routes file that shares no route codes with the open PDF starts a
      new run" no longer apply: the route data is the Route Data page's. A PDF whose route codes
      share nothing with the loaded route data is still shown, with every route "in the PDF but
      not on the Routes file". Test: phase 2 host test.

## 2. The number check

- [ ] Bag rows match the "N bags" heading, rows are numbered 1..N, overflow rows add up to the
      "N overflow" heading, bags + overflow = Total Packages, Commercial Packages present. Test:
      'PDF: reads header, bags, overflow and totals exactly as printed', 'PDF: numbers that do not
      add up fail the check', 'PDF: every synthetic fixture page passes the number check except the
      one meant to fail'; parity `sheets.json` (`check.problems`).
- [ ] Blank cells stay blank, are never shifted, and are reported as notes. Test: 'PDF: a blank
      Sort Zone stays blank (row is not shifted) and is reported as a note', 'PDF: parser works
      from positioned items without widths (fallback path)'.

## 3. Distribute

- [ ] Counts along the top (ready, need a decision, no exact match, no route sheet, not sending,
      missing email). Rule: `countStates`; parity `distribution.json` (`counts`). Page: phase 3.
- [ ] **Changed (item 3).** "Pad for each wave" is replaced by the pads the Route Data page knows,
      matched by clock value; the box stays only for a wave time that matches no dispatch time.
      Rule: 'Distribute: lists each wave time in clock order with its route count and pad'
      (`waves`, `padFor`); the join in phase 2; the page in phase 3.
- [ ] Ready to send. Test: 'Distribute: exact single match is ready; everything else needs a
      person to decide'; parity.
- [ ] Choose who gets these route sheets: a route listing two or more drivers; the green
      Suggested tag (only active match, or only one not listed elsewhere); Accept all suggestions.
      Test: the same twin (`suggestion`, `suggestionReason`); parity (`inputs.json` decisions
      accept suggestions); Accept all in phase 2.
- [ ] No exact match, with the reason (not in the driver list, INACTIVE, no Transporter ID,
      numbers did not add up, page found but tables unreadable, in the PDF but not on the Routes
      file). Test: the same twin (`headline` for each case); parity (the INACTIVE and missing-ID
      twists in `inputs.json`).
- [ ] Choose someone from a drop-down and Assign; Don't send. Test: 'Distribute: manual
      assignment resolves an exception'; decisions in parity; the page in phase 3.
- [ ] On the Routes file but missing from the PDF. Test: the exact-match twin (`no-sheet`); parity.
- [ ] People who won't get a route sheet, and why; anyone getting more than one. Test:
      'Distribute: explains who gets no route sheet and why; flags people getting several'; parity
      (`people`).
- [ ] All routes in one table; Change undoes a choice. Page: phase 3.
- [ ] The name check warns when the Routes file name and the driver list name disagree; matching
      is always by ID. Test: 'Name check tolerates middle names but catches a different person';
      parity (`issues` with `Name check:`).

## 4. Sheets

- [ ] Click a route, see exactly the email the driver gets: route, staging, pad, wave and date
      boxes; the date in a maroon box with the full day name; bag table with colour swatches;
      overflow table; totals. Test: 'Email HTML escapes values and marks blank cells', 'Email: the
      pad shows as its own box and in the subject only when one is set', 'Email: the pad is a tall
      box on the right, beside the route, staging, wave and date', 'Email: the Date box shows the
      full day name, with the date on the line under it', 'Email: the greeting says the full day
      name too; the subject keeps it short', 'Email: the date stands out in a maroon box with
      white writing and a big, bold label', 'Email: the words in every box at the top are
      centered, side to side and top to bottom'; parity `emails.json` (same bytes).
- [ ] A note when the page could not be read, telling the driver to use the attached PDF. Test:
      'Email: when the page failed its number check, the email tells the driver to use the
      attached PDF'; parity.
- [ ] Send email; Copy for email (rich clipboard); Open email draft (`.eml`, opens unsent, page
      attached); Copy + open mail app (`mailto:`); Save PDF page; View original page; Mark as
      sent; a tick after any of them. Rules: 'EML draft opens as unsent with recipients, HTML body
      and PDF attachment', 'Export: the PDF a driver gets carries both pages of a long route';
      parity `eml/*.eml`. Buttons: phase 2 channels and phase 3 page.
- [ ] Email all: asks first, one email per driver over one login, each success saved at once, a
      plain-words tally; routes with no address are left out and said so. Rules: 'Runs: ...' send
      problem and unsent rules (`sendProblem`, `unsentRoutes`); the sending in phase 2.
- [ ] Export all: a folder with an email draft and a PDF per ready route, every PDF, and a
      summary as HTML and CSV. Rules: 'Service: import in any order, persist decisions, export
      drafts' (file names, `planExportAll`), 'Service: pads are saved with the run, trimmed,
      cleared with a blank, and put on the email and summary' (the summary columns); parity
      `summary.html`, `summary.csv`. Writing the folder: phase 2.

## 5. History

- [ ] **Changed (item 7).** Every day's work is saved with its choices, sent marks and pads, keyed
      by station, date and cycle, in the app's database; the PDF beside it. Rule: `runIdFor`,
      `runLabel` ('Service: import in any order...' twin). Storage: phase 2.
- [ ] Reopen an older day; New run; Delete a run (asks first). Phase 2 and 3.
- [ ] **Changed (item 8).** No "clear earlier days?" question: runs older than 30 days are removed
      quietly when the app opens. Rule: 'Runs: runs older than 30 days are the ones removed when
      the app opens' (`staleRunIds`). Phase 2 host.
- [ ] A re-import drops the decisions that no longer fit (a chosen driver who left the route);
      hand-made and skipped decisions stay. Rule: 'Runs: decisions that no longer fit the routes
      file are dropped' (`pruneDecisions`).
- [ ] **Changed (item 7).** Open and Change the output folder are gone; the data folder is in
      Settings and Export all asks for a folder. Nothing to test.

## 6. Email settings

- [ ] **Changed (item 4).** Gmail address, 16-letter App Password (spaces removed, sealed with the
      computer's safe storage, never shown again), optional BCC, Send test, in Settings > Email,
      shared with Weekly performance. Phase 2.
- [ ] Plain-words explanations for every SMTP failure (wrong password, 2-Step off, no connection,
      daily limit). Phase 2 (the app's mailer).

## 7. Shell

- [ ] **Changed (item 5).** Light or dark, High contrast, text size, What's new, Features log,
      How to use, "?" help pictures, Open data folder are the app's own. Phase 3 adds the How to
      use section, the tour, the Home checklist step and the What's-new note.
- [ ] **Changed (item 10).** Nothing is brought over from the old app; the first open of the Route
      Sheets page says where the old app's work now lives when its folder exists. Phase 2 and 3.

## 8. The old app's own tests

Every test in the old `test/core.test.js` (35 tests at release 1.5.2) and what became of it.

| Old test | Twin or reason |
| --- | --- |
| PDF: reads header, bags, overflow and totals exactly as printed | twin, `parser/pdf.test.ts` |
| PDF: a blank Sort Zone stays blank (row is not shifted) and is reported as a note | twin |
| PDF: numbers that do not add up fail the check | twin |
| PDF: parser works from positioned items without widths (fallback path) | twin |
| PDF: headings split into separate runs ("24" + "bags", "ETDT ·" + service) are still read | twin |
| PDF: a long route whose tables spill onto the next page is read as one sheet, and blank pages are skipped | twin (the attachment check is 'Export: the PDF a driver gets carries both pages of a long route') |
| Email: when the page failed its number check, the email tells the driver to use the attached PDF | twin, `email/render.test.ts` |
| Associates: parses, collapses double spaces, uppercases IDs, flags duplicates | not ported (item 1): the Associates page reads the export |
| Routes: splits pipe-separated Transporter IDs and names in order | not ported (item 2): the Route Data page reads the export; the phase 2 join test checks the split |
| Name check tolerates middle names but catches a different person | twin, `matcher/names.test.ts` |
| Distribute: exact single match is ready; everything else needs a person to decide | twin, `matcher/distribute.test.ts` |
| Distribute: explains who gets no route sheet and why; flags people getting several | twin |
| Distribute: manual assignment resolves an exception | twin |
| Email HTML escapes values and marks blank cells | twin |
| EML draft opens as unsent with recipients, HTML body and PDF attachment | twin, `export/*.test.ts` |
| Service: import in any order, persist decisions, export drafts | the pure half is a twin (run id, export file names); the rest is the phase 2 host test |
| Mailer: Gmail defaults use STARTTLS on 587; 465 uses TLS from the start | phase 2 (the app's mailer) |
| Mailer: explains what is missing and turns SMTP errors into plain words | phase 2 |
| Email settings: App Password is stored encrypted, Gmail spaces removed, unreadable blobs count as not set | phase 2 (item 4: the app's Email settings) |
| Email all: sends one email per ready route with its PDF page, marks each sent, skips what it cannot send | phase 2 |
| Email all: a rejected login stops the batch before anything is sent | phase 2 |
| What's new: notes cover the running version and pick the versions in between | not ported (item 5): the app's own What's new and its release note test |
| What's new: shown once after an update, never on a fresh install | not ported (item 5) |
| Associate Data: due for a new import one calendar month after it was imported | the rule is a twin, `runs/rules.test.ts`; the reminder on the pages is phase 3 |
| New day: asks once per day, clears only runs from earlier days, keeps the Associate Data | not ported (item 8); replaced by 'Runs: runs older than 30 days are the ones removed when the app opens' |
| Output folder: changing it moves the saved runs, and the app keeps using it after a restart | not ported (item 7) |
| Display: defaults, text size steps stop at the ends, unknown values are ignored | not ported (item 5) |
| Distribute: lists each wave time in clock order with its route count and pad | twin |
| Email: the pad shows as its own box and in the subject only when one is set | twin |
| Email: the pad is a tall box on the right, beside the route, staging, wave and date | twin |
| Email: the Date box shows the full day name, with the date on the line under it | twin |
| Email: the greeting says the full day name too; the subject keeps it short | twin |
| Email: the date stands out in a maroon box with white writing and a big, bold label | twin |
| Email: the words in every box at the top are centered, side to side and top to bottom | twin |
| Service: pads are saved with the run, trimmed, cleared with a blank, and put on the email and summary | the summary half is a twin; saving pads with the run is phase 2 |
