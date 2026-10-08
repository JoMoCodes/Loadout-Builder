"""Proves the made-up files still import: runs the old app's own readers on each real file and
on its made-up copy, and compares the counts.

    python -I packages/fixtures/check_importers.py

Run it from the repo root. It needs the real files listed in .private/sources.json, so it only
works on the computer that has them. It prints counts and pass/fail only - never a name.

An optional argument adds a folder to Python's search path first (for a computer that is
missing a library the readers import).
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "packages" / "fixtures"
LEGACY = ROOT / "legacy" / "python"

for extra in sys.argv[1:]:
    sys.path.insert(0, extra)
sys.path.insert(0, str(LEGACY))

from loadout_builder import associates, dwp, importer, routedata, tenure, vehicles  # noqa: E402
from loadout_builder.models import ROUTE_ITINERARIES, ROUTE_ROUTES, ROUTE_SCHEDULE  # noqa: E402

sources = json.loads((ROOT / ".private" / "sources.json").read_text(encoding="utf-8"))
station = sources.get("stationCode", "")
dsp_code = sources.get("dspCode", "")

results: list[tuple[str, str, object, object]] = []


def fake_path(folder: str, real: str) -> Path:
    name = Path(real).name
    if station:
        name = name.replace(station, "XXX1")
    if dsp_code:
        name = name.replace(dsp_code, "XXXX")
    name = name.replace(" (5)", "")
    return FIXTURES / folder / name


def compare(label: str, real_value: object, fake_value: object) -> None:
    results.append(("same" if real_value == fake_value else "DIFFERENT", label, real_value, fake_value))


def attempt(label: str, real_call, fake_call) -> None:
    try:
        real_value = real_call()
    except Exception as error:  # the message could quote a cell, so only the type is shown
        real_value = f"error:{type(error).__name__}"
    try:
        fake_value = fake_call()
    except Exception as error:
        fake_value = f"error:{type(error).__name__}"
    compare(label, real_value, fake_value)


# Load-out sheets: row count and the date read from the title or file name.
for real in sources["loadoutSheets"]:
    fake = fake_path("loadout-sheets", real)
    attempt(
        f"load-out sheet {Path(fake).name}",
        lambda r=real: (lambda x: (len(x.rows), str(x.load_out_date)))(importer.import_loadout_sheet(r)),
        lambda f=fake: (lambda x: (len(x.rows), str(x.load_out_date)))(importer.import_loadout_sheet(f)),
    )

# Matching: how many drivers match each way (exact, first + last, fuzzy, none) must not change,
# since the made-up names keep the same shape as the real ones.
from loadout_builder import matching  # noqa: E402

fake_associates = FIXTURES / "associates" / "AssociateData.csv"
for real in sources["loadoutSheets"]:
    fake = fake_path("loadout-sheets", real)
    attempt(
        f"matching on {Path(fake).name}",
        lambda r=real: matching.summarise(
            matching.match_roster(
                importer.import_loadout_sheet(r).rows,
                associates.import_associate_data(sources["associates"]).rows,
            )
        ),
        lambda f=fake: matching.summarise(
            matching.match_roster(
                importer.import_loadout_sheet(f).rows,
                associates.import_associate_data(fake_associates).rows,
            )
        ),
    )

# Associate export.
real = sources["associates"]
fake = FIXTURES / "associates" / "AssociateData.csv"
attempt(
    "associate export",
    lambda: len(associates.import_associate_data(real).rows),
    lambda: len(associates.import_associate_data(fake).rows),
)

# Tenure exports.
for real in sources["tenure"]:
    fake = fake_path("tenure", real)
    attempt(
        f"tenure {Path(fake).name}",
        lambda r=real: len(tenure.import_tenure_export(r).records),
        lambda f=fake: len(tenure.import_tenure_export(f).records),
    )

# Routes and itineraries.
for key, kind, folder in (("routes", ROUTE_ROUTES, "routes"), ("itineraries", ROUTE_ITINERARIES, "itineraries")):
    for real in sources[key]:
        fake = fake_path(folder, real)
        attempt(
            f"{kind} {Path(fake).name}",
            lambda r=real, k=kind: (lambda x: (len(x.rows), str(x.day)))(routedata.import_route_export(k, r)),
            lambda f=fake, k=kind: (lambda x: (len(x.rows), str(x.day)))(routedata.import_route_export(k, f)),
        )

# Weekly schedules: each read for a day the file covers.
schedule_days = {"Week-38-Schedule.xlsx": date(2026, 9, 14), "Week-36-Schedule.xlsx": date(2026, 9, 1)}
for real in sources["schedules"]:
    fake = fake_path("schedules", real)
    day = schedule_days.get(Path(real).name, date(2026, 9, 14))
    attempt(
        f"schedule {Path(fake).name}",
        lambda r=real, d=day: (lambda x: (len(x.rows), x.source_total))(routedata.import_route_export(ROUTE_SCHEDULE, r, d)),
        lambda f=fake, d=day: (lambda x: (len(x.rows), x.source_total))(routedata.import_route_export(ROUTE_SCHEDULE, f, d)),
    )

# DWP sheets: row count and the day read off the file name.
for real in sources["dwp"]:
    fake = fake_path("dwp", real)
    attempt(
        f"dwp {Path(fake).name}",
        lambda r=real: (lambda x: (len(x.rows), str(x.day)))(dwp.import_dwp_sheet(r)),
        lambda f=fake: (lambda x: (len(x.rows), str(x.day)))(dwp.import_dwp_sheet(f)),
    )

# Vehicles: there is no real export, so the made-up list is compared with the vehicles table of
# the made-up database (which the anonymiser already checked against the real one).
import sqlite3  # noqa: E402

connection = sqlite3.connect(f"file:{(FIXTURES / 'v1' / 'loadout.db').as_posix()}?mode=ro", uri=True)
database_count = connection.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
connection.close()
attempt(
    "vehicle list (made-up list vs the made-up database's vehicles table)",
    lambda: database_count,
    lambda: len(vehicles.import_vehicle_data(FIXTURES / "vehicles" / "VehiclesData.xlsx").rows),
)

worst = 0
for verdict, label, real_value, fake_value in results:
    print(f"{verdict:9} {label}: real={real_value} fake={fake_value}")
    if verdict != "same":
        worst = 1
print()
print("All importers agree on the made-up files." if worst == 0 else "Some importers disagree. See above.")
sys.exit(worst)
