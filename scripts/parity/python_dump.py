"""Parity harness, Python half: run the old app's logic on the made-up fixtures and write JSON.

    python3 -I scripts/parity/python_dump.py

For each "fixture day" this builds the old app's state the way the screens do - an AppState on a
throwaway copy of packages/fixtures/v1/loadout.db, then the day's files imported through the same
AppState methods the buttons call - and writes one JSON file per module into
scripts/parity/expected/<day>/. The TypeScript port writes the same files into
scripts/parity/actual/ and scripts/parity/diff.mjs compares the two.

Read scripts/parity/CONTRACT.md for the exact shape of every file. Nothing here ports any logic: it
only calls the old code and writes down what came out. Real data never comes near this script: the
only inputs are the made-up files in packages/fixtures/ and the output holds no paths, no times of
day, and nothing else that changes from one run to the next.

Choices made here (also written into expected/days.json):

- The associate list is imported from the associate export (as a normal morning does), then both
  tenure exports, then the vehicle list, then the day's load-out sheet. Links, van affinity, LMR
  approvals, vehicle priorities and overrides, print layouts and the previous roster come from the
  database copy untouched. The database's own roster, route data and associate list are replaced
  by the imports, exactly as importing replaces them in the app.
- Route exports with no file for the day are cleared (the database holds an old Weekly Schedule that
  would otherwise leak in from another week).
- PADs: the app asks the user to pin each dispatch time to a PAD. The harness does that the same way
  every time: the distinct non-blank dispatch times of an export, in clock order, take PAD 1, 2, 3,
  1, 2, 3 and so on. Blank times are left unassigned.
- "Today" is the load-out date. The old code asks the computer's clock in two places (ID expiry
  checks and vehicle registration checks), so this script swaps the old code's `date` for a
  look-alike whose today() answers with the load-out date. That is the only shim.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from dataclasses import asdict
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "packages" / "fixtures"
OUT = Path(__file__).resolve().parent / "expected"
sys.path.insert(0, str(ROOT / "legacy" / "python"))

from loadout_builder import assignment, export, matching, models, printing, state as state_module  # noqa: E402
from loadout_builder.assignment import Candidate, needs_van  # noqa: E402
from loadout_builder.dwp import import_dwp_sheet  # noqa: E402
from loadout_builder.importer import import_loadout_sheet  # noqa: E402
from loadout_builder.matching import AssociateIndex, driver_key, name_key, normalize_name  # noqa: E402
from loadout_builder.models import (  # noqa: E402
    FIELD_NAMES,
    ROUTE_ITINERARIES,
    ROUTE_ROUTES,
    ROUTE_SCHEDULE,
    ROUTE_SOURCES,
    DriverRow,
    clock_key,
)
from loadout_builder.routedata import RouteDataImportError, import_route_export  # noqa: E402
from loadout_builder.state import AppState  # noqa: E402
from loadout_builder.storage import Store  # noqa: E402


# ------------------------------------------------------------------ today

class _FixedDate(date):
    """A date that knows what day 'today' is. See the note at the top."""

    fixed: date = date(2000, 1, 1)

    @classmethod
    def today(cls) -> date:  # type: ignore[override]
        return cls.fixed


models.date = _FixedDate  # type: ignore[attr-defined]
state_module.date = _FixedDate  # type: ignore[attr-defined]


# ---------------------------------------------------------------- the days

# One entry per load-out sheet. The day is the date the sheet itself reads as (its title), which is
# what the old app calls the load-out date. Everything else is the file that belongs to that day, or
# the nearest one when none is dated that day. The reason is written down so nobody has to guess.
DAYS = [
    {
        "loadout": "2026_09_02_15_27_loadout_sheet.xlsx",
        "routes": ("Routes_XXX1_2026-09-01_12_20 (CDT).xlsx", "dated the same day"),
        "itineraries": (
            "Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx",
            "the only itineraries file there is, so the nearest",
        ),
        "schedule": ("Week-36-Schedule.xlsx", "the week that covers the day"),
        "dwp": (
            "XXXX DWP 9.2.xlsx",
            "named 9.2 with no year, which matches the sheet's file date; the app reads its day as unknown",
        ),
    },
    {
        "loadout": "2026_09_11_17_37_loadout_sheet.xlsx",
        "routes": (
            "Routes_XXX1_2026-09-01_12_20 (CDT).xlsx",
            "nearest: ten days away, against fourteen for the other",
        ),
        "itineraries": (
            "Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx",
            "the only itineraries file there is, so the nearest",
        ),
        "schedule": (None, "neither weekly schedule covers this day, so there is none"),
        "dwp": ("DWP_DSP-XXXX_09-11-2026.xlsx", "dated the same day"),
    },
    {
        "loadout": "2026_09_14_12_15_loadout_sheet.xlsx",
        "routes": (
            "Routes_XXX1_2026-09-25_09_54 (CDT).xlsx",
            "nearest: eleven days away, against thirteen for the other",
        ),
        "itineraries": (
            "Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx",
            "the only itineraries file there is, so the nearest",
        ),
        "schedule": ("Week-38-Schedule.xlsx", "the week that covers the day"),
        "dwp": (
            "DWP_DSP-XXXX_09-11-2026.xlsx",
            "nearest: 09-11 and 09-17 are both three days away, so the earlier one; the app calls it the wrong day",
        ),
    },
]

FOLDERS = {
    ROUTE_ROUTES: "routes",
    ROUTE_ITINERARIES: "itineraries",
    ROUTE_SCHEDULE: "schedules",
    "dwp": "dwp",
    "loadout": "loadout-sheets",
}
ASSOCIATES_FILE = FIXTURES / "associates" / "AssociateData.csv"
VEHICLES_FILE = FIXTURES / "vehicles" / "VehiclesData.xlsx"
TENURE_FILES = sorted((FIXTURES / "tenure").glob("*.csv"), key=lambda p: p.name)
DB_FILE = FIXTURES / "v1" / "loadout.db"
MAIN_KIND = ROUTE_ROUTES  # the export the main run brings over, as the Load Out button does first


class Day:
    def __init__(self, spec: dict) -> None:
        self.spec = spec
        self.loadout = FIXTURES / FOLDERS["loadout"] / spec["loadout"]
        sheet = import_loadout_sheet(self.loadout)
        self.date: date = sheet.load_out_date
        self.id = self.date.isoformat()
        self.files: dict[str, Path | None] = {}
        for kind in (ROUTE_ROUTES, ROUTE_ITINERARIES, ROUTE_SCHEDULE, "dwp"):
            name = spec[kind][0]
            self.files[kind] = FIXTURES / FOLDERS[kind] / name if name else None


# --------------------------------------------------------------- the state


class Ctx:
    def __init__(self, day: Day) -> None:
        self.day = day
        self.tmp = Path(tempfile.mkdtemp(prefix="parity-"))
        shutil.copy(DB_FILE, self.tmp / "loadout.db")
        self.store = Store(self.tmp / "loadout.db")
        self.state = AppState(self.store)

    def close(self) -> None:
        self.store.close()
        shutil.rmtree(self.tmp, ignore_errors=True)


def pads_by_time(dataset) -> dict[str, int]:
    """Distinct non-blank dispatch times in clock order take PAD 1, 2, 3, 1, 2, 3..."""
    times = [text for text, _ in dataset.dispatch_times() if text]
    return {text: index % 3 + 1 for index, text in enumerate(times)}


def fresh(day: Day) -> Ctx:
    """The app after a normal morning's imports, before anything is brought over."""
    _FixedDate.fixed = day.date
    ctx = Ctx(day)
    st = ctx.state
    st.load_all()
    st.import_associates(ASSOCIATES_FILE)
    for path in TENURE_FILES:
        st.import_tenure(path)
    st.import_vehicles(VEHICLES_FILE)
    st.import_roster(day.loadout)
    for kind, _ in ROUTE_SOURCES:
        path = day.files[kind]
        if path is None:
            st.clear_route_data(kind)
        else:
            st.import_route_data(kind, path)
            st.set_pads(kind, pads_by_time(st.route_set(kind)))
    if day.files["dwp"] is not None:
        st.import_dwp(day.files["dwp"])
    return ctx


# ----------------------------------------------------------- serialisers


def norm(value):
    """Make a value ready for the JSON file. See CONTRACT.md, "Rules"."""
    if isinstance(value, bool) or value is None or isinstance(value, (int, str)):
        return value
    if isinstance(value, float):
        rounded = round(value, 6)
        return int(rounded) if rounded == int(rounded) else rounded
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (set, frozenset)):
        return sorted(norm(item) for item in value)
    if isinstance(value, (list, tuple)):
        return [norm(item) for item in value]
    if isinstance(value, dict):
        return {str(key): norm(item) for key, item in value.items()}
    raise TypeError(f"cannot write {type(value).__name__} to JSON")


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(norm(payload), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def row_fields(row: DriverRow, fields=FIELD_NAMES) -> dict:
    return {name: getattr(row, name) for name in fields}


def assoc_ref(associate):
    if associate is None:
        return None
    return {"name": associate.name, "transporter_id": associate.transporter_id}


def vehicle_ref(vehicle):
    if vehicle is None:
        return None
    return {"name": vehicle.name, "vin": vehicle.vin}


def match_ref(match, name: str):
    if match is None:
        return None
    ratio = None
    if match.method == "fuzzy" and match.associate is not None:
        ratio = SequenceMatcher(
            None, normalize_name(name), normalize_name(match.associate.name)
        ).ratio()
    return {
        "associate": assoc_ref(match.associate),
        "candidates": [assoc_ref(a) for a in match.candidates],
        "driver_name": match.driver_name,
        "fuzzy_ratio": ratio,
        "is_ambiguous": match.is_ambiguous,
        "label": match.label(),
        "matched": match.matched,
        "method": match.method,
        "needs_review": match.needs_review,
    }


def vehicle_full(st: AppState, vehicle) -> dict:
    return {
        "category": vehicle.category,
        "effective_operational": st.is_operational(vehicle),
        "family": vehicle.family,
        "is_rental": vehicle.is_rental,
        "is_step_van": vehicle.is_step_van,
        "manual_only": vehicle.manual_only,
        "name": vehicle.name,
        "operational": vehicle.operational,
        "order_rank": vehicle.order_rank,
        "overridden": st.is_overridden(vehicle),
        "ownership": vehicle.ownership,
        "priority": st.vehicle_priority(vehicle),
        "required_qualification": vehicle.required_qualification,
        "service_tier": vehicle.service_tier,
        "service_type": vehicle.service_type,
        "vin": vehicle.vin,
    }


# ---------------------------------------------------------------- modules


def inputs_module(ctx: Ctx) -> dict:
    """What went in. Names of files only; counts of everything."""
    st, day = ctx.state, ctx.day
    sources = {}
    for kind, _ in ROUTE_SOURCES:
        data = st.route_set(kind)
        sources[kind] = {
            "day": data.day,
            "file": day.files[kind].name if day.files[kind] else None,
            "pads": data.pads,
            "row_count": len(data.rows),
            "source_total": data.source_total,
        }
    return {
        "affinity_slots_held": len(st.affinity),
        "associates": {
            "count": len(st.associates.rows),
            "file": ASSOCIATES_FILE.name,
            "with_tenure": st.associates.tenure_count,
        },
        "driver_links": len(st.links),
        "dwp": {
            "day": st.dwp.day,
            "file": day.files["dwp"].name if day.files["dwp"] else None,
            "row_count": len(st.dwp.rows),
        },
        "lmr_approved": len(st.lmr_approved),
        "loadout": {
            "date": st.roster.load_out_date,
            "date_label": st.roster.date_label(),
            "file": day.loadout.name,
            "row_count": len(st.roster.rows),
        },
        "previous_roster": {
            "date": st.previous_roster.load_out_date,
            "row_count": len(st.previous_roster.rows),
        },
        "print_layouts_saved": st.print_presets(),
        "route_sources": sources,
        "tenure": {
            "files": [p.name for p in TENURE_FILES],
            "record_count": len(st.tenure_book.records),
        },
        "today": day.date,
        "vehicle_overrides": len(st.vehicle_overrides),
        "vehicle_priorities": len(st.vehicle_priorities),
        "vehicles": {
            "count": len(st.vehicles.rows),
            "file": VEHICLES_FILE.name,
            "operational": len(st.operational_vehicles()),
        },
    }


def matching_snapshot(st: AppState) -> dict:
    rows = []
    for index, row in enumerate(st.roster.rows):
        rows.append(
            {
                "driver": row.driver,
                "index": index,
                "key": driver_key(row.driver),
                "match": match_ref(st.match_for(row), row.driver),
                "name_key": list(name_key(row.driver)),
            }
        )
    book = AssociateIndex.build(st.associates.rows)
    return {
        "associate_collisions": [
            {
                "key": list(key),
                "transporter_ids": [a.transporter_id for a in group],
            }
            for key, group in sorted(book.collisions().items())
        ],
        "associate_names": [
            {
                "name_key": list(name_key(a.name)),
                "normalized": normalize_name(a.name),
                "transporter_id": a.transporter_id,
            }
            for a in st.associates.rows
        ],
        "matched_count": st.matched_count(),
        "review_count": st.review_count(),
        "rostered_ids": st.rostered_ids(),
        "rows": rows,
        "summary": st.match_summary(),
    }


def links_snapshot(st: AppState) -> dict:
    rows = []
    for index, row in enumerate(st.roster.rows):
        key = driver_key(row.driver)
        associate = st.associate_for(row)
        rows.append(
            {
                "associate": assoc_ref(associate),
                "driver": row.driver,
                "index": index,
                "key": key,
                "link": st.links.get(key),
                "link_present": key in st.links,
                "tenure": associate.tenure if associate else None,
                "tenure_label": associate.tenure_label() if associate else "",
                "tenure_routes": associate.tenure_routes if associate else 0,
            }
        )
    return {"links": dict(st.links), "rows": rows}


def tenure_book_snapshot(st: AppState) -> dict:
    book = st.tenure_book
    return {
        "count": len(book.records),
        "newest": list(book.newest) if book.newest else None,
        "records": {
            tid: {"routes": r.routes, "week": r.week, "year": r.year}
            for tid, r in book.records.items()
        },
        "week_label": book.week_label(),
    }


def associates_snapshot(st: AppState) -> list:
    return [
        (a.name, a.transporter_id, a.position, list(a.qualifications)) for a in st.associates.rows
    ]


def route_scenario(day: Day, kind: str, mode: str) -> dict:
    """Bring one export over to a fresh roster. mode: by_time or adopted."""
    ctx = fresh(day)
    try:
        st = ctx.state
        if mode == "adopted" and st.route_set(ROUTE_SCHEDULE).is_empty:
            return {"kind": kind, "mode": mode, "skipped": "no weekly schedule for this day"}
        adopt = None
        if mode == "adopted":
            st.set_pads(kind, {})
            adopt = list(st.adopt_schedule_pads(kind))
        dataset = st.route_set(kind)
        before_rows = len(st.roster.rows)
        before_associates = associates_snapshot(st)
        before_links = dict(st.links)
        result = st.apply_route_data(kind)
        after_associates = associates_snapshot(st)
        changed = []
        for index, (old, new) in enumerate(zip(before_associates, after_associates)):
            if old != new:
                changed.append({"after": new, "before": old, "index": index})
        return {
            "adopt_result": adopt,
            "associates_added": after_associates[len(before_associates):],
            "associates_changed": changed,
            "entry_pads_after_adopt": [e.pad for e in dataset.rows] if adopt else None,
            "kind": kind,
            "links_added": {
                k: v for k, v in st.links.items() if k not in before_links
            },
            "mode": mode,
            "pads_set": dataset.pads,
            "result": {
                "added_drivers": result.added_drivers,
                "dispatch_times": result.dispatch_times,
                "duplicates": result.duplicates,
                "filled": result.filled,
                "kind": result.kind,
                "needs_review": result.needs_review,
                "no_associate": result.no_associate,
                "not_in_export": result.not_in_export,
                "pads": result.pads,
                "route_codes": result.route_codes,
                "service_types": result.service_types,
                "skipped": result.skipped,
            },
            "roster_route_source": st.roster.route_source,
            "roster_rows_after": len(st.roster.rows),
            "roster_rows_before": before_rows,
            "rows_after": [
                row_fields(
                    row,
                    ("driver", "shift_type", "routes", "wave_time", "pad", "service_type"),
                )
                for row in st.roster.rows
            ],
        }
    finally:
        ctx.close()


def routes_module(day: Day) -> dict:
    out = {}
    for kind, _ in ROUTE_SOURCES:
        if day.files[kind] is None:
            out[f"{kind}/by_time"] = {"kind": kind, "mode": "by_time", "skipped": "no file for this day"}
            continue
        out[f"{kind}/by_time"] = route_scenario(day, kind, "by_time")
        if kind != ROUTE_SCHEDULE:
            out[f"{kind}/adopted"] = route_scenario(day, kind, "adopted")
    return {"scenarios": out}


def dwp_snapshot(st: AppState) -> dict:
    return {
        "day_status": st.dwp_day_status(),
        "matched_count": st.dwp_matched_count(),
    }


def dwp_apply(st: AppState) -> dict:
    result = st.apply_dwp()
    return {
        "bags": result.bags,
        "cleared": result.cleared,
        "filled": result.filled,
        "no_route_code": result.no_route_code,
        "not_in_sheet": result.not_in_sheet,
        "ovs": result.ovs,
        "skipped": result.skipped,
        "staging": result.staging,
    }


def dwp_rows(st: AppState) -> list:
    return [
        row_fields(row, ("driver", "routes", "staging_location", "bags", "ovs"))
        for row in st.roster.rows
    ]


def dwp_module(day: Day, main_state: AppState, pre: dict, apply: dict, post: dict) -> dict:
    # The same apply on the roster exactly as the sheet was imported (its own Routes column only).
    ctx = fresh(day)
    try:
        st = ctx.state
        without = {"before": dwp_snapshot(st), "result": dwp_apply(st), "rows_after": dwp_rows(st)}
    finally:
        ctx.close()
    # Bring this day's sheet over, then another day's sheet over the top of it: rows whose route the
    # second sheet doesn't carry are emptied (DwpApplyResult.cleared), the rest take its numbers.
    others = sorted(p for p in (FIXTURES / FOLDERS["dwp"]).glob("*.xlsx") if p != day.files["dwp"])
    ctx = fresh(day)
    try:
        st = ctx.state
        st.apply_route_data(MAIN_KIND)
        st.apply_dwp()
        sheet = st.import_dwp(others[0])
        reapply = {
            "before": dwp_snapshot(st),
            "file": others[0].name,
            "file_day": sheet.day,
            "result": dwp_apply(st),
            "rows_after": dwp_rows(st),
        }
    finally:
        ctx.close()
    dataset = main_state.dwp
    return {
        "after_route_bring_over": {
            "after": post,
            "apply_result": apply,
            "before": pre,
            "rows_after": dwp_rows(main_state),
        },
        "dataset": {
            "day": dataset.day,
            "duplicate_codes": dataset.duplicate_codes(),
            "rows": [
                {
                    "bags": e.bags,
                    "ovs": e.ovs,
                    "route_code": e.route_code,
                    "staging": e.staging,
                }
                for e in dataset.rows
            ],
        },
        "reapply_other_sheet": reapply,
        "on_imported_roster": without,
    }


def vans_module(st: AppState, before_available: list) -> tuple[dict, list]:
    candidates = [
        Candidate(row=row, associate=st.associate_for(row))
        for row in st.roster.rows
        if needs_van(row)
    ]
    indices = [i for i, row in enumerate(st.roster.rows) if needs_van(row)]
    assignable = st.assignable_vehicles()
    eligible = [
        sorted(
            v.vin
            for v in assignable
            if assignment._eligible(c, v, st.lmr_approved)  # noqa: SLF001
        )
        for c in candidates
    ]
    result = st.assign_vans()
    entries = []
    for index, cand, ok, item in zip(indices, candidates, eligible, result.assignments):
        entries.append(
            {
                "assignment": {
                    "assigned": item.assigned,
                    "driver": item.driver,
                    "method": item.method,
                    "method_label": item.method_label,
                    "reason": item.reason,
                    "vehicle": vehicle_ref(item.vehicle),
                },
                "candidate": {
                    "associate": assoc_ref(cand.associate),
                    "clock_key": list(clock_key(cand.row.wave_time)),
                    "family": cand.family,
                    "needed_qualification": cand.needed_qualification,
                    "service_type": cand.service_type,
                    "tenure": cand.tenure,
                    "wave_time": cand.row.wave_time,
                },
                "driver": cand.row.driver,
                "eligible_vins": ok,
                "row_index": index,
            }
        )
    fleet = [vehicle_full(st, v) for v in st.vehicles.rows]
    return (
        {
            "assignable_vehicles": [v.vin for v in st.assignable_vehicles()],
            "assignments": entries,
            "available_vehicles_after": [v.vin for v in st.available_vehicles()],
            "available_vehicles_before": before_available,
            "fleet": fleet,
            "lmr_approved": st.lmr_approved,
            "lmr_vehicles": [v.vin for v in st.lmr_vehicles()],
            "operational_vehicles": [v.vin for v in st.operational_vehicles()],
            "overridden_count": st.overridden_count(),
            "result": {
                "assigned": len(result.assigned),
                "by_method": result.by_method(),
                "considered": result.considered,
                "loose": result.loose,
                "unassigned": len(result.unassigned),
                "vans_available": result.vans_available,
            },
            "roster_after": [
                row_fields(row, ("driver", "vehicle", "vin", "assign_method"))
                for row in st.roster.rows
            ],
        },
        result.assignments,
    )


def export_module(st: AppState) -> dict:
    probe = DriverRow(**{name: f"<{name}>" for name in FIELD_NAMES})
    layouts = {}
    rows = {}
    names = {}
    for with_dwp, key in ((False, "plain"), (True, "with_dwp")):
        columns = export.layout(with_dwp)
        layouts[key] = [
            {
                "field": None if read is None else read(probe).strip("<>"),
                "heading": heading,
                "weight": weight,
            }
            for heading, read, weight in columns
        ]
        rows[key] = [list(cells) for cells in export.rows_for(st.roster, with_dwp)]
        names[key] = export.default_filename(st.roster, with_dwp)
    return {
        "carrying_dwp": export.carrying_dwp(st.roster),
        "date_label": st.roster.date_label(),
        "default_filename": names,
        "layout": layouts,
        "rows": rows,
    }


def spec_dump(spec: printing.PrintSpec, print_rows: list, date_label: str, source: str) -> dict:
    geo = printing.geometry(spec)
    printing_rows = spec.rows_for(print_rows)
    widths = printing.column_widths(spec, geo, printing_rows)
    groups = printing.bands(spec, widths, geo)
    pages = printing.paginate(printing_rows, spec, geo)
    return {
        "band_count": printing.band_count(spec, printing_rows),
        "band_count_no_rows": printing.band_count(spec),
        "bands": groups,
        "column_widths": widths,
        "column_widths_no_rows": printing.column_widths(spec, geo, ()),
        "columns": [
            {
                "align": c.align,
                "kind_label": c.kind_label,
                "label": c.label,
                "width": c.width,
            }
            for c in spec.columns
        ],
        "default_filename": printing.default_filename(spec, date_label),
        "geometry": {
            "font_size": geo.font_size,
            "header_h": geo.header_h,
            "margin": geo.margin,
            "page_h": geo.page_h,
            "page_w": geo.page_w,
            "row_h": geo.row_h,
            "scale": geo.scale,
            "title_h": geo.title_h,
            "usable_h": geo.usable_h,
            "usable_w": geo.usable_w,
        },
        "page_count": printing.page_count(print_rows, spec),
        "pages": [
            {
                "band": p.band,
                "columns": p.columns,
                "first_of_band": p.first_of_band,
                "group": p.group,
                "row_keys": [r.key for r in p.rows],
            }
            for p in pages
        ],
        "printing_keys": [r.key for r in printing_rows],
        "source": source,
        "spec": asdict(spec),
        "title_for": printing.title_for(spec, date_label),
    }


def synthetic_specs(print_rows: list) -> dict:
    every_field = [printing.PrintColumn(field=key) for key, *_ in printing.PRINT_FIELDS]
    shifts = sorted({r.value("shift_type") or models.NO_SHIFT for r in print_rows})
    return {
        "synthetic:everything-landscape-no-fit": printing.PrintSpec(
            columns=list(every_field),
            paper="tabloid",
            orientation=printing.LANDSCAPE,
            fit_one_page=False,
            title="Everything",
        ),
        "synthetic:everything-squeezed-big": printing.PrintSpec(
            columns=list(every_field), scale=200, sort_by="wave_time", sort_reverse=True
        ),
        "synthetic:grouped-by-pad-vans-only": printing.PrintSpec(
            columns=printing.default_spec().columns,
            group_break="pad",
            vans_only=True,
            sort_by="wave_time",
            note="A line of my own",
            stripes=True,
            show_title=False,
        ),
        "synthetic:narrow-stretched-a4": printing.PrintSpec(
            columns=printing.vans_columns(),
            paper="a4",
            stretch=True,
            center_h=False,
            show_page_numbers=False,
            sort_by="vehicle",
        ),
        "synthetic:tick-boxes-leave-offs": printing.PrintSpec(
            columns=[
                printing.PrintColumn(kind=printing.CHECKBOX, heading="Checked In"),
                printing.PrintColumn(field="driver", weight=140),
                printing.PrintColumn(field="routes", align_override="C"),
                printing.PrintColumn(kind=printing.BLANK, weight=90),
                printing.PrintColumn(field="staging_location", heading="Where"),
            ],
            paper="legal",
            scale=60,
            group_break="shift_type",
            excluded_shifts=shifts[:1],
            excluded_drivers=[r.key for r in print_rows[:2]],
            sort_by="staging_location",
        ),
    }


def printing_module(st: AppState) -> dict:
    print_rows = st.print_rows()
    date_label = st.roster.date_label()
    specs = {"default": (printing.default_spec(), "default_spec()")}
    working = st.print_spec()
    specs["working"] = (working, "the working layout in the database, else the default")
    for name in st.print_presets():
        specs[f"preset:{name}"] = (st.print_preset(name), "a layout saved under a name in the database")
    for name, spec in synthetic_specs(print_rows).items():
        specs[name] = (spec, "built by the harness to push the page math")
    return {
        "date_label": date_label,
        "print_rows": [{"key": r.key, "values": r.values} for r in print_rows],
        "specs": {
            key: spec_dump(spec, print_rows, date_label, source)
            for key, (spec, source) in specs.items()
        },
    }


def rows_module(st: AppState, today: date) -> dict:
    out = []
    for index, row in enumerate(st.roster.rows):
        associate = st.associate_for(row)
        match = st.match_for(row)
        out.append(
            {
                "assign_method_label": st.assign_method_label(row),
                "check_text": st.check_text(row),
                "days_until_id_expiry": associate.days_until_id_expiry(today) if associate else None,
                "driver": row.driver,
                "driver_issues": st.driver_issues(row, today),
                "id_state": associate.id_state(today) if associate else None,
                "index": index,
                "match_method": match.method if match else None,
                "missing_for_shift": list(associate.missing_for_shift(row.shift_type)) if associate else [],
                "needs_van": row.needs_van,
                "van_badges": st.van_badges(associate),
            }
        )
    return {"rows": out, "today": today}


def helvetica_module() -> dict:
    """Width of every character the printed sheet can measure, in 1/1000 of the font size."""
    widths = {"regular": {}, "bold": {}}
    for code in range(32, 256):
        char = chr(code)
        widths["regular"][str(code)] = printing._measure(char, 1000.0)  # noqa: SLF001
        widths["bold"][str(code)] = printing._measure(char, 1000.0, bold=True)  # noqa: SLF001
    return widths


# ------------------------------------------------------------------- main


def run_day(day: Day) -> dict:
    ctx = fresh(day)
    try:
        st = ctx.state
        modules = {"inputs": inputs_module(ctx)}

        matching_after_import = matching_snapshot(st)
        links_after_import = links_snapshot(st)
        tenure_book = tenure_book_snapshot(st)
        prev_state_import = {"previous_vans": st.previous_vans()}

        result = st.apply_route_data(MAIN_KIND)
        del result  # its numbers are in routes.json
        matching_after_bring = matching_snapshot(st)
        links_after_bring = links_snapshot(st)
        prev_state_bring = {"previous_vans": st.previous_vans()}

        modules["matching"] = {
            "after_import": matching_after_import,
            "after_route_bring_over": matching_after_bring,
        }
        modules["links"] = {
            "after_import": links_after_import,
            "after_route_bring_over": links_after_bring,
            "tenure_book": tenure_book,
        }
        prev = st.previous_roster
        modules["previous"] = {
            "after_bring_over": prev_state_bring,
            "after_import": prev_state_import,
            "previous_roster": {
                "date": prev.load_out_date,
                "row_count": len(prev.rows),
                "rows_with_vin": sum(1 for r in prev.rows if r.vin),
                "route_source": prev.route_source,
            },
        }

        pre = dwp_snapshot(st)
        applied = dwp_apply(st)
        post = dwp_snapshot(st)
        modules["dwp"] = dwp_module(day, st, pre, applied, post)

        before_available = [v.vin for v in st.available_vehicles()]
        vans, _ = vans_module(st, before_available)
        modules["vans"] = vans
        modules["export"] = export_module(st)
        modules["printing"] = printing_module(st)
        modules["rows"] = rows_module(st, day.date)
        return modules
    finally:
        ctx.close()


def main() -> int:
    days = [Day(spec) for spec in DAYS]
    manifest = []
    for day in days:
        modules = run_day(day)
        modules["routes"] = routes_module(day)
        for name, payload in modules.items():
            write_json(OUT / day.id / f"{name}.json", payload)
        entry = {
            "day": day.id,
            "files": {
                "associates": ASSOCIATES_FILE.name,
                "loadout": day.loadout.name,
                "tenure": [p.name for p in TENURE_FILES],
                "vehicles": VEHICLES_FILE.name,
            },
            "main_route_export": MAIN_KIND,
            "today": day.date,
        }
        for kind in (ROUTE_ROUTES, ROUTE_ITINERARIES, ROUTE_SCHEDULE, "dwp"):
            name, reason = day.spec[kind]
            file_day = None
            if name and kind == "dwp":
                file_day = import_dwp_sheet(day.files[kind]).day
            elif name and kind != ROUTE_SCHEDULE:
                file_day = import_route_export(kind, day.files[kind]).day
            elif name:
                try:
                    file_day = import_route_export(kind, day.files[kind], day.date).day
                except RouteDataImportError:
                    file_day = None
            entry[kind] = {
                "days_away": (file_day - day.date).days if file_day else None,
                "exact": bool(file_day and file_day == day.date),
                "file": name,
                "file_day": file_day,
                "reason": reason,
            }
        manifest.append(entry)
    write_json(
        OUT / "days.json",
        {
            "days": manifest,
            "notes": [
                "A day is named for the date its load-out sheet reads as, which is the date the old app calls the load-out date. The harness uses it as 'today'.",
                "associates, tenure and vehicles are the same files on every day.",
                "Everything else in the database (links, van affinity, LMR approvals, vehicle priorities and overrides, print layouts, previous roster) is used as it stands.",
                "Route exports with no file for a day are cleared before the day's run.",
            ],
        },
    )
    write_json(OUT / "shared" / "helvetica.json", helvetica_module())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
