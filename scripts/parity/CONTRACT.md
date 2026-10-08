# Parity contract: the JSON both sides must write

This is the hand-off for the two agents porting the logic to TypeScript (2a: matching, links,
tenure, bring-over; 2b: van assignment, export layout, printing math). The old Python app is the
reference. A module is done when the TypeScript side writes the same JSON and
`npm run parity:diff` shows no difference for it.

```
npm run parity:python          # old app -> scripts/parity/expected/   (committed; made-up data)
(your code)                    # new core -> scripts/parity/actual/    (gitignored)
npm run parity:diff            # compare; exit 1 on any difference
node scripts/parity/diff.mjs 2026-09-11 vans     # one day, one module
node scripts/parity/diff.mjs --list              # what days and modules there are
```

Options: `--max N` / `--all` (how many differences to print per file), `--exact` (numbers must be
identical, not just within a millionth). Summary lines hold counts only; the lines under a file name
show path, expected and actual, which can include made-up fixture names.

Do not edit anything in `expected/` by hand. If you think the Python harness is wrong, say so in
your pull request under "Needs Jonathan" rather than changing it to fit.

## 1. Folders and files

```
scripts/parity/expected/days.json              describes the days (not compared)
scripts/parity/expected/<day>/<module>.json    one per day and module   (compared)
scripts/parity/expected/shared/helvetica.json  character widths         (compared)
scripts/parity/actual/...                      same layout, written by the TypeScript side
```

Days (named for the date the load-out sheet reads as, which the old app calls the load-out date):
`2026-09-01`, `2026-09-11`, `2026-09-14`. `days.json` says which fixture files belong to each, and
whether each is dated that day or only the nearest one (and why).

Modules per day: `inputs`, `matching`, `links`, `previous`, `routes`, `dwp`, `vans`, `export`,
`printing`, `rows`. Plus the one `shared/helvetica` file.

Agent 2a owns `inputs`, `matching`, `links`, `previous`, `routes`, `dwp` and `rows`. Agent 2b owns
`vans`, `export`, `printing` and `shared/helvetica`. They lean on each other: `vans` and `printing`
need 2a's matching and bring-over, and `rows` needs 2b's method labels and van badges. Both build the
day's state the same way (section 3), so put that builder in `packages/core` once and share it.

## 2. Rules for every file

- **Format.** UTF-8, two-space indent, keys sorted (by code point), `"key": value` with one space,
  a single `\n` at the end. The diff tool compares parsed JSON, so layout does not matter to it, but
  match it anyway so files can be compared byte for byte.
- **Row order.** Anything that is "per driver row" is in roster order (the order of the rows on the
  imported load-out sheet, with drivers added by route data appended at the end). Anything that is
  "per van" is in the fleet's order (the vehicle export's row order) unless the field says it is in
  the order a function returns. Lists keep the order the Python function returns them in.
- **`index` / `row_index`.** Zero-based position in the roster at the time the file was written.
- **Dates** are ISO text, `YYYY-MM-DD`. `date_label` is Python's `%A, %B %d %Y` in English, with the
  day zero-padded: `Tuesday, September 01 2026`.
- **Numbers.** Floats are rounded to 6 decimal places. A float that is a whole number is written as
  a whole number (`36.0` is written `36`), so TypeScript can write what `JSON.stringify` gives.
  Python's `round` and JavaScript's differ on ties; the diff tolerates a millionth by default.
- **Sets** are written as sorted lists. **Tuples** are lists. **Dicts** are objects with text keys.
- **Missing is `null`**, never left out. Text that is empty is `""`, not `null`. Every `DriverRow`
  field is text, even `pad`, `bags` and `ovs`.
- **Names, never paths.** File names appear, with no folder. Times of day and anything that changes
  between runs (such as "imported at") never appear.
- **A person** is `{ "name": ..., "transporter_id": ... }` ("AssociateRef"); **a van** is
  `{ "name": ..., "vin": ... }` ("VehicleRef"). `null` when there is none.
- **Today.** Every day's "today" is the load-out date. The old code asks the clock in two places
  (ID expiry and van registration checks). The Python harness replaces its `date` with one whose
  `today()` answers with the load-out date, so `check_text`, `driver_issues` and the print sheet's
  Check column all use it. Your code must take `today` as an input and never read the clock.

## 3. How each day's state is built (the recipe)

Both sides must reach the same state before anything is written. In Python this is `fresh(day)` in
`python_dump.py`, using `AppState` on a throwaway copy of `packages/fixtures/v1/loadout.db`.

1. Copy the database. `load_all()`: roster, associates, links, route data, DWP, vehicles, vehicle
   overrides, van affinity, LMR approvals, previous roster, vehicle priorities, tenure.
2. `import_associates(AssociateData.csv)`. Replaces the book; lifetime routes are re-applied from
   the tenure book; re-match.
3. `import_tenure` for each tenure file, in file-name order. Folds forward only (see `tenure.py`).
4. `import_vehicles(VehiclesData.xlsx)`. The fixture fleet is the database fleet (41 vans, checked
   equal), so this changes nothing but is what a normal morning does. Overrides and priorities are
   kept (they are keyed by VIN and stored apart).
5. `import_roster(<the day's load-out sheet>)`. Replaces today's roster; re-match. The database's
   previous roster is left alone.
6. For each route export kind in order `routes`, `itineraries`, `schedule`: if the day has a file,
   `import_route_data(kind, file)` (the schedule is read for the load-out date) and then pin PADs
   with `set_pads(kind, pads)`; if it has none, `clear_route_data(kind)` (the database holds an old
   schedule that must not leak in).
   - **PAD rule:** take the export's distinct dispatch times that are not blank, in clock order
     (`RouteDataSet.dispatch_times()`); the first gets PAD 1, the second 2, the third 3, the fourth 1,
     and so on.
7. If the day has a DWP file, `import_dwp(file)`. Importing alone changes nothing on the roster.

The **main run** (used by `matching`, `links`, `previous`, `dwp`, `vans`, `export`, `printing` and
`rows`) then does, writing as it goes:

1. Snapshot matching, links, tenure book and `previous_vans()` ("after import").
2. `apply_route_data("routes")` (this calls `add_route_only_drivers()` first). Snapshot matching,
   links and `previous_vans()` again ("after route bring-over").
3. DWP: record `dwp_day_status()` and `dwp_matched_count()`, run `apply_dwp()`, record both again.
4. `available_vehicles()` ("before"), then `assign_vans()`, then the rest of `vans`, `export`,
   `printing`, `rows` from the finished state.

The `routes` and `dwp` files also hold extra scenarios, each starting again from step 7 above.

## 4. The modules

Python names in `code` are functions or properties in `legacy/python/loadout_builder/`.

### 4.1 `inputs.json`

What went in, so you can check your importers fed you the same data. Source: the state after step 7.

| Field                                  | Source                                                             |
| -------------------------------------- | ------------------------------------------------------------------ |
| `today`                                | the load-out date                                                  |
| `loadout.file`, `.date`, `.row_count`  | file name; `roster.load_out_date`; `len(roster.rows)`              |
| `loadout.date_label`                   | `roster.date_label()`                                              |
| `associates.file`, `.count`            | file name; `len(associates.rows)`                                  |
| `associates.with_tenure`               | `associates.tenure_count`                                          |
| `tenure.files`, `.record_count`        | file names, in order; `len(tenure_book.records)`                   |
| `vehicles.file`, `.count`              | file name; `len(vehicles.rows)`                                    |
| `vehicles.operational`                 | `len(operational_vehicles())`                                      |
| `route_sources.<kind>.file`            | file name or `null`                                                |
| `route_sources.<kind>.day`             | `RouteDataSet.day`                                                 |
| `route_sources.<kind>.row_count`       | `len(rows)`                                                        |
| `route_sources.<kind>.source_total`    | `RouteDataSet.source_total`                                        |
| `route_sources.<kind>.pads`            | `RouteDataSet.pads` (time text to PAD number)                      |
| `dwp.file`, `.day`, `.row_count`       | file name or `null`; `DwpDataSet.day`; `len(rows)`                 |
| `previous_roster.date`, `.row_count`   | `previous_roster.load_out_date`; `len(previous_roster.rows)`       |
| `driver_links`                         | `len(links)`                                                       |
| `affinity_slots_held`                  | `len(affinity)`                                                    |
| `lmr_approved`                         | `len(lmr_approved)`                                                |
| `vehicle_priorities`, `vehicle_overrides` | counts                                                          |
| `print_layouts_saved`                  | `print_presets()` (the names; the working layout is not listed)    |

`<kind>` is `routes`, `itineraries`, `schedule`.

### 4.2 `matching.json`

Two snapshots with the same shape: `after_import` and `after_route_bring_over`.

| Field                 | Source                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `rows[]`              | one per roster row                                                                             |
| `rows[].index`, `.driver` | position; `row.driver`                                                                     |
| `rows[].key`          | `driver_key(driver)` (= `normalize_name`)                                                      |
| `rows[].name_key`     | `list(name_key(driver))`, `[first, last]`                                                      |
| `rows[].match`        | `match_for(row)`, else `null` (when there is no associate book)                                |
| `match.method`        | `Match.method`: `manual`, `exact`, `name`, `fuzzy`, `cleared`, `none`                          |
| `match.associate`     | `Match.associate` as AssociateRef, or `null`                                                   |
| `match.candidates[]`  | `Match.candidates` as AssociateRefs, in the order carried                                      |
| `match.driver_name`   | `Match.driver_name`                                                                            |
| `match.matched`, `.is_ambiguous`, `.needs_review`, `.label` | the `Match` properties and `label()`              |
| `match.fuzzy_ratio`   | for `method == "fuzzy"` only: `SequenceMatcher(None, normalize_name(driver), normalize_name(associate.name)).ratio()`; otherwise `null` |
| `summary`             | `summarise(matches)`: method to count. **Counted per distinct `driver_key`, not per row**: two rows whose names normalise alike are one entry in the old app's dict |
| `matched_count`, `review_count` | `matched_count()`, `review_count()` (same per-key counting)                           |
| `rostered_ids`        | `rostered_ids()`, sorted                                                                       |
| `associate_names[]`   | one per associate in book order: `{transporter_id, normalized: normalize_name(name), name_key}`|
| `associate_collisions[]` | `AssociateIndex.build(rows).collisions()`: `{key: [first, last], transporter_ids: [...]}` sorted by key |

`after_route_bring_over` is read after `apply_route_data("routes")`, so it includes people route data
added and the links that call pinned.

### 4.3 `links.json`

| Field                                  | Source                                                         |
| -------------------------------------- | -------------------------------------------------------------- |
| `after_import.links`, `after_route_bring_over.links` | `state.links` (key to Transporter ID, or `null` for "not an associate") |
| `...rows[]`                            | one per roster row                                             |
| `rows[].key`                           | `driver_key(driver)`                                           |
| `rows[].link_present`, `.link`         | `key in links`; `links.get(key)`                               |
| `rows[].associate`                     | `associate_for(row)` as AssociateRef or `null`                 |
| `rows[].tenure`                        | `associate.tenure` (int or `null` = unknown)                   |
| `rows[].tenure_label`                  | `associate.tenure_label()` (`""` if unknown)                   |
| `rows[].tenure_routes`                 | `associate.tenure_routes` (0 if unknown)                       |
| `tenure_book.count`                    | `len(records)`                                                 |
| `tenure_book.records`                  | Transporter ID to `{routes, year, week}`                       |
| `tenure_book.newest`                   | `[year, week]` or `null`                                       |
| `tenure_book.week_label`               | `week_label()`                                                 |

`tenure_book` is read after step 7: the database's counts with both tenure files folded in.

### 4.4 `previous.json`

| Field                                          | Source                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| `previous_roster.date`, `.row_count`           | `previous_roster.load_out_date`, `len(rows)`              |
| `previous_roster.rows_with_vin`                | rows with a non-empty `vin`                               |
| `previous_roster.route_source`                 | `previous_roster.route_source`                            |
| `after_import.previous_vans`                   | `previous_vans()` after step 7: Transporter ID to VIN     |
| `after_bring_over.previous_vans`               | `previous_vans()` after the route bring-over              |

`previous_vans()` re-matches yesterday's names with the same links and matching rules, so it can
change when bring-over adds associates or links.

### 4.5 `routes.json`

`scenarios` is an object with these keys (a kind with no file for the day, or "adopted" with no
weekly schedule, has only `{kind, mode, skipped: "<reason>"}`):

- `routes/by_time`, `itineraries/by_time`, `schedule/by_time`: start from step 7, call
  `apply_route_data(kind)`.
- `routes/adopted`, `itineraries/adopted`: start from step 7, then `set_pads(kind, {})` and
  `adopt_schedule_pads(kind)` (copies the weekly schedule's PAD onto each row by Transporter ID),
  then `apply_route_data(kind)`. Needs a weekly schedule for the day.

| Field                                   | Source                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `kind`, `mode`                          | as above                                                                |
| `pads_set`                              | the export's PAD map just before bring-over (`RouteDataSet.pads`)       |
| `adopt_result`                          | `adopt_schedule_pads` return `[copied, scheduled_but_no_pad, not_on_schedule]`, else `null` |
| `entry_pads_after_adopt`                | each export row's `pad` (text) after the adopt, else `null`             |
| `result.*`                              | `RouteApplyResult`: `kind, filled, dispatch_times, route_codes, service_types, pads, no_associate, not_in_export, duplicates, added_drivers, needs_review, skipped` |
| `result.added_drivers`, `.needs_review` | the two lists `add_route_only_drivers()` returns (it runs inside `apply_route_data`) |
| `roster_route_source`                   | `roster.route_source` afterwards                                         |
| `roster_rows_before`, `roster_rows_after` | `len(roster.rows)`                                                    |
| `rows_after[]`                          | every roster row afterwards: `driver, shift_type, routes, wave_time, pad, service_type` |
| `associates_added[]`                    | associates appended to the book by the call, as `[name, transporter_id, position, [qualifications]]` |
| `associates_changed[]`                  | `{index, before, after}` for existing associates whose name, ID, position or qualifications changed |
| `links_added`                           | links present afterwards that were not present before (key to ID)      |

### 4.6 `dwp.json`

| Field                                   | Source                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `dataset.day`                           | `DwpDataSet.day` (from the file name; `null` when it does not say)     |
| `dataset.rows[]`                        | `DwpEntry`: `route_code, bags, ovs, staging`, in sheet order           |
| `dataset.duplicate_codes`               | `duplicate_codes()`                                                    |
| `after_route_bring_over.before`         | `{day_status: dwp_day_status(), matched_count: dwp_matched_count()}` after the route bring-over, before applying |
| `after_route_bring_over.apply_result`   | `DwpApplyResult`: `filled, staging, bags, ovs, no_route_code, not_in_sheet, cleared, skipped` |
| `after_route_bring_over.after`          | the same two read-outs after applying                                  |
| `after_route_bring_over.rows_after[]`   | every roster row: `driver, routes, staging_location, bags, ovs`        |
| `on_imported_roster`                    | the same `{before, result, rows_after}` for `apply_dwp()` on a fresh state with no route bring-over (the sheet's own Routes column only) |
| `reapply_other_sheet`                   | route bring-over, `apply_dwp()`, then `import_dwp(<the first other DWP file by name>)` and `apply_dwp()` again: `{file, file_day, before, result, rows_after}`. This is where `cleared` is non-zero |

Day status is `ok`, `unknown` (the file name has no usable date) or `mismatch`. `apply_dwp` does not
check the day itself; the screens do. The harness applies regardless.

### 4.7 `vans.json`

All from the main run, after route and DWP bring-over, around one call to `assign_vans()`.

| Field                                   | Source                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `assignments[]`                         | one per driver who needs a van, in roster order (`row.needs_van`), the order of `AssignmentResult.assignments` |
| `.row_index`, `.driver`                 | roster position; `row.driver`                                           |
| `.assignment.assigned`                  | `Assignment.assigned`                                                   |
| `.assignment.vehicle`                   | `Assignment.vehicle` as VehicleRef, or `null`                           |
| `.assignment.method`, `.method_label`   | `Assignment.method` (`affinity-primary`, `affinity-secondary`, `previous-day`, `service-type`, `vehicle-family`, `qualified-only`, `none`) and `method_label` |
| `.assignment.reason`                    | `Assignment.reason` (the why-not text; `""` when assigned)              |
| `.candidate.associate`                  | `Candidate.associate` as AssociateRef or `null`                         |
| `.candidate.service_type`, `.wave_time` | `Candidate.service_type`, `row.wave_time`                               |
| `.candidate.family`                     | `Candidate.family` (`service_family`)                                   |
| `.candidate.needed_qualification`       | `Candidate.needed_qualification`                                        |
| `.candidate.tenure`                     | `Candidate.tenure` (lifetime routes, 0 if unknown)                      |
| `.candidate.clock_key`                  | `clock_key(wave_time)` as `[0 or 1, text]`                              |
| `.eligible_vins`                        | VINs of the assignable vans this driver passes the skill and LMR gates for (`assignment._eligible`), sorted. Judged on the whole assignable pool, before any van is taken |
| `result`                                | `AssignmentResult`: `considered, vans_available, assigned (count), unassigned (count), loose, by_method` |
| `roster_after[]`                        | every roster row after the call: `driver, vehicle, vin, assign_method`  |
| `fleet[]`                               | every van in fleet order: `vin, name, service_type, service_tier, ownership, operational, effective_operational (is_operational), overridden (is_overridden), priority (vehicle_priority), category, family, required_qualification, is_rental, is_step_van, manual_only, order_rank` |
| `assignable_vehicles`                   | `assignable_vehicles()`, VINs, in the order returned                    |
| `operational_vehicles`                  | `operational_vehicles()`, VINs                                          |
| `lmr_vehicles`                          | `lmr_vehicles()`, VINs                                                  |
| `available_vehicles_before`, `_after`   | `available_vehicles()` before and after `assign_vans()`, VINs           |
| `lmr_approved`                          | `lmr_approved`, sorted Transporter IDs                                  |
| `overridden_count`                      | `overridden_count()`                                                    |

Remember `assign_vans()` blanks `vehicle`, `vin` and `assign_method` on every roster row first, so
`available_vehicles_before` is read from the roster as route and DWP bring-over left it (the sheet
may carry vans).

### 4.8 `export.json`

From the finished main run (`roster` = the state's roster).

| Field                                   | Source                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `date_label`                            | `roster.date_label()`                                                   |
| `carrying_dwp`                          | `export.carrying_dwp(roster)`                                           |
| `default_filename.plain`, `.with_dwp`   | `export.default_filename(roster, False / True)`                         |
| `layout.plain`, `layout.with_dwp`       | `export.layout(False / True)`: `[{heading, weight, field}]`. `field` is the `DriverRow` attribute the column reads (found by reading a row whose every field holds its own name), or `null` for the blank spacers |
| `rows.plain`, `rows.with_dwp`           | `export.rows_for(roster, False / True)`: one list of cell text per driver, **sorted by `driver.lower()`** (stable), empty cells `""` |

### 4.9 `printing.json`

| Field                          | Source                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `date_label`                   | `roster.date_label()`                                                          |
| `print_rows[]`                 | `print_rows()`, roster order: `{key, values}`. `key` is `id:<Transporter ID>` or `name:<driver_key>`. `values` has these 18 fields, all text: `driver, shift_type, transporter_id, tenure, vans, check, routes, wave_time, pad, service_type, vehicle, vin, assign_method, device, staging_location, bags, ovs, bag` |
| `specs`                        | an object keyed by layout name (below)                                         |

Keys of `specs`: `default` (`default_spec()`), `working` (`print_spec()`: the database's working
layout, else the default), `preset:<name>` (each `print_preset(name)`), and five layouts the harness
builds to push the page math: `synthetic:everything-landscape-no-fit`,
`synthetic:everything-squeezed-big`, `synthetic:grouped-by-pad-vans-only`,
`synthetic:narrow-stretched-a4`, `synthetic:tick-boxes-leave-offs`. The exact settings of each are in
the file under `spec`, so you can feed `spec` straight back in; the last one leaves off the first two
drivers' keys and the first shift type, which depends on the day.

Each entry:

| Field                     | Source                                                                       |
| ------------------------- | ---------------------------------------------------------------------------- |
| `source`                  | a note on where the layout came from (not compared in meaning, but it is compared, so copy it) |
| `spec`                    | `asdict(PrintSpec)`: `columns[] {kind, field, heading, weight, align_override}, paper, orientation, scale, fit_one_page, stretch, center_h, center_v, show_title, title, note, show_page_numbers, grid, stripes, repeat_header, sort_by, sort_reverse, group_break, excluded_shifts, excluded_drivers, vans_only` |
| `columns[]`               | per column: `label` (`PrintColumn.label`), `kind_label`, `width` (`PrintColumn.width`), `align` (`PrintColumn.align`) |
| `geometry`                | `geometry(spec)`: `page_w, page_h, margin, font_size, row_h, header_h, title_h, scale`, plus `usable_w`, `usable_h` |
| `printing_keys`           | keys of `spec.rows_for(print_rows)`, in printing order                       |
| `column_widths`           | `column_widths(spec, geo, spec.rows_for(print_rows))`: what the sheet prints at |
| `column_widths_no_rows`   | `column_widths(spec, geo, ())`: the layout editor's fallback                 |
| `bands`                   | `bands(spec, column_widths, geo)`: lists of column positions                 |
| `band_count`              | `band_count(spec, spec.rows_for(print_rows))`                                |
| `band_count_no_rows`      | `band_count(spec)`                                                           |
| `pages[]`                 | `paginate(spec.rows_for(print_rows), spec, geo)`: `{band, columns, first_of_band, group, row_keys}` |
| `page_count`              | `page_count(print_rows, spec)` (takes **all** rows and filters them itself)  |
| `default_filename`        | `printing.default_filename(spec, date_label)`                                |
| `title_for`               | `printing.title_for(spec, date_label)`                                       |

Widths come from `_measure`: the width of the text in Helvetica (bold for headings) at the
geometry's font size, which is the sum of the per-character widths in `shared/helvetica.json`
(thousandths of the font size, no kerning) times `size / 1000`. Text goes through `_printable` first
(curly quotes and dashes become plain ones; anything else outside Latin-1 loses its accent or
becomes `?`). The old code measured with fpdf2's built-in Helvetica table, so use that table, not
another font's.

### 4.10 `shared/helvetica.json`

`{ "regular": { "<code point>": width }, "bold": { ... } }` for code points 32 to 255:
`_measure(chr(code), 1000.0, bold)`. Whole numbers.

### 4.11 `rows.json`

`today` plus `rows[]`, one per roster row after the main run (so it includes added drivers and the
van the assigner gave them):

| Field                    | Source                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| `index`, `driver`        | position; `row.driver`                                                    |
| `check_text`             | `check_text(row)` (the Check column, uses `today`)                        |
| `driver_issues`          | `driver_issues(row, today)`                                               |
| `assign_method_label`    | `assign_method_label(row)`                                                |
| `van_badges`             | `van_badges(associate_for(row))` (adds `LMR` for approved drivers)        |
| `match_method`           | the row's `Match.method`, or `null`                                       |
| `needs_van`              | `row.needs_van`                                                           |
| `id_state`               | `associate.id_state(today)`: `unknown, expired, expiring, ok`; `null` with no associate |
| `days_until_id_expiry`   | `associate.days_until_id_expiry(today)` or `null`                         |
| `missing_for_shift`      | `list(associate.missing_for_shift(row.shift_type))`; `[]` with no associate |

### 4.12 `days.json`

`days[]` of `{day, today, files {associates, loadout, tenure[], vehicles}, main_route_export, routes,
itineraries, schedule, dwp}`, where each of the last four is `{file, file_day, days_away, exact,
reason}`. `notes[]` explains the choices. The diff tool does not compare it.

## 5. Traps (read before you port)

- **Match counts are per key.** `match_roster` returns a dict keyed by `driver_key`; `summarise`,
  `matched_count` and `review_count` count dict entries, not roster rows.
- **`difflib.SequenceMatcher.ratio()`** has to be reproduced exactly (junk heuristic is off below 200
  characters, so plain longest-matching-block recursion). The cutoff is `0.88`.
- **Python sorts are stable.** `sorted(..., key=...)` keeps ties in input order; so must you. The
  van order key is `(-tenure, clock_key(wave_time), driver.lower())`; the pick key is in
  `assignment.plan`. `driver.lower()` is Python's, which differs from `toLowerCase()` for a few
  characters; fixtures only hold plain names.
- **`sort_key` is a natural sort** (digits compare as numbers, numbers before text, clock times
  before both, blanks last, then `reverse` flips all of it). See `models.sort_key`.
- **`check_text` and the print sheet's Check column** use `today`. Nothing may read the clock.
- **Associate and vehicle mutation.** `add_route_only_drivers` appends to the associate book, sets a
  default `EDV` qualification, fills in missing IDs and pins links. Later steps (`previous_vans`,
  matching, `driver_issues`) see those changes.
- **`previous_vans()` is cached in Python** until a re-match or a change to the previous roster; the
  values written are what a fresh computation gives at that moment.
- **Python `round()`** is applied by the writer, not by the logic. Compute in full precision and round
  only when writing.
- **`dataclasses.asdict`** for `PrintSpec` writes every field, in definition order, even when
  default; the diff tool compares keys, not order.
