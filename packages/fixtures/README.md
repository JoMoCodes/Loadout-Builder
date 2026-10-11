# Fixtures: made-up test files

Everything in this folder is **made up**. Each file is shaped exactly like a real export
(Load-out sheet, associate list, routes, itineraries, weekly schedule, DWP, tenure, vehicle
list, and the old version's database), but every driver name, Transporter ID, VIN, plate,
email and phone number has been swapped for an invented one, and the station code is `XXX1`.

`manifest.json` lists every invented name, ID and VIN, and where each file came from. **When
you need a name for an example, a test, a comment or a help page, pick one from
`manifest.json`.** The privacy scan only lets invented IDs and VINs through if they are
listed there.

| Folder | What it holds |
| --- | --- |
| `loadout-sheets/` | Load-out exports from three different days |
| `associates/` | The associate (driver) export |
| `tenure/` | Tenured Workforce exports (lifetime routes) |
| `routes/`, `itineraries/` | The two Amazon route exports |
| `schedules/` | Weekly schedule workbooks |
| `dwp/` | DWP sheets (the day is in the file name) |
| `vehicles/` | The vehicle list. No real export existed, so it was built from the old database |
| `v1/` | A rebuilt copy of the old version's database, for testing the one-time import |

## Making new ones

Real files stay outside this repo. `.private/sources.json` (ignored by git, so it never leaves
your computer) lists where they are. Then:

```bash
npm run fixtures
```

Run from the repo root. The script reads the real files, writes the made-up copies here, rewrites
`manifest.json`, and checks its own work: the structure matches the real files, no real value
remains, and the privacy scan passes. It prints counts only, never names. The same real value always
becomes the same invented value, in every file, because the invented values come from a private
seed in `.private/seed.txt`.

To prove the made-up files still read the same way in the old Python app, run
`python -I packages/fixtures/check_importers.py` from the repo root on the computer that has the
real files.

Never copy a real file in here by hand.

## Hand edits

Two edits were made to `v1/loadout.db` by hand, after `npm run fixtures` wrote it, so that nothing
personal is in it. `npm run fixtures` does not redo them (the file paths are now made up the same way
by the script itself), so if you remake the database, run them again with any SQLite tool, then run
`npm run parity:python`, `python3 -I scripts/parity/print/python_print.py` and
`npx tsx scripts/parity/print/extract.ts` to refresh the expected files that carry the layout name.

```sql
-- The saved print layout was named after a real person. Give it a made-up name.
UPDATE print_layouts SET name = 'Morning crew' WHERE name <> '';

-- Where each file "came from" is shown as a made-up Downloads path with no user name in it.
-- The file name is kept; the folder in front of it becomes %USERPROFILE%\Downloads\.
UPDATE roster_meta SET source_file = '%USERPROFILE%\Downloads\'
  || replace(source_file, rtrim(source_file, replace(source_file, '\', '')), '');
-- (the same line for associates_meta, route_meta, vehicles_meta, previous_roster_meta, tenure_meta)
```

## The Weekly Performance files

`performance/` holds made-up copies of the weekly exports the old Weekly Performance App read:
the driver roster, the scorecard thresholds, and ten weeks each of scorecards, CDF, DSB, PSB,
DCR, DCR totals and Safety files, plus the POD reports. The weeks are the newest ten that have a
scorecard; a kind with no file in those weeks (the PSB exports stop earlier) gets its own newest
ten weeks instead, and the script says so when it runs. The station code in the file names is
`XXX1`, and the files line up with each other: the same made-up driver has the same name and ID
in every one of them (but not the same as in the other fixture folders, which were made with a
different seed).

| Folder | What it holds |
| --- | --- |
| `performance/roster/`, `performance/thresholds/` | The driver list and the scorecard thresholds |
| `performance/scorecards/` | One weekly scorecard per week |
| `performance/cdf/`, `performance/dsb/`, `performance/psb/` | Customer feedback, delivery-scan and pickup exports |
| `performance/dcr/`, `performance/dcr-totals/` | Returned-package rows and the weekly totals |
| `performance/safety/` | Safety events (made-up VINs, links to example.com) |
| `performance/pod/` | POD reports, drawn from scratch as PDFs with the same layout as the real ones |

To remake them, list the real files in `.private/sources-performance.json` (ignored by git), have
the POD rows written to `.private/pod-rows.json`, then run from the repo root:

```bash
npm run fixtures:performance
```

It writes the made-up copies, merges the new files, people, IDs and VINs into `manifest.json`
without touching what is already there, and checks its own work (same headers and row counts as
the real files, no real value left, privacy scan passed). It prints counts only. Its seed lives in
`.private/seed-performance.txt`, separate from the one the other fixtures used. Tracking numbers,
event, stop and group IDs become made-up values of the same shape; free-text notes become one
generic sentence; the real POD PDFs are never copied, only their row layout is reused.
