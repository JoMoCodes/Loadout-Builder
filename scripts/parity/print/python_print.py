"""Print parity, Python half: the old app's own writers draw the reference sheets.

    python3 -I scripts/parity/print/python_print.py [OUT]

For each fixture day this builds the day exactly as scripts/parity/python_dump.py does (`fresh(day)`,
then the main run: bring over route data, bring over the DWP, assign vans), then hands the finished
roster to the old app's writers:

- `export.write` for the two fixed sheets (with and without DWP), as .pdf and .xlsx;
- `printing.write` for every Print tab layout in the cases below, as .pdf and .xlsx.

The files go into OUT (default scripts/parity/print/python-out/, which git ignores: they are only
ever read back by scripts/parity/print/extract.ts). What each case was asked to print goes into
scripts/parity/print/expected/<day>/cases.json, so the TypeScript writers can be given the same.

Nothing here ports or changes any logic. The rows are checked against the committed parity files
(printing.json, export.json) first, so a reference sheet can only be drawn off the same day the
page math was proven on.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, replace
from pathlib import Path

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import python_dump as harness  # noqa: E402  (also puts the old app on the path and fixes "today")
from loadout_builder import export, printing  # noqa: E402

EXPECTED = HERE / "expected"
PARITY = HERE.parent / "expected"


def vans_spec(spec: printing.PrintSpec) -> printing.PrintSpec:
    """What the Print Vans button prints, off the tab's own layout (print_page.print_vans)."""
    out = spec.with_columns(printing.vans_columns())
    if not out.title:
        out.title = "Vans"
    out.sort_by = "vehicle"
    out.sort_reverse = False
    out.vans_only = True
    return out


def drawing_specs() -> dict[str, printing.PrintSpec]:
    """Layouts that push every branch of the drawing: the page math is already proven elsewhere."""
    every = [printing.PrintColumn(field=key) for key, *_ in printing.PRINT_FIELDS]
    return {
        "draw:no-boxes-centred-down": printing.PrintSpec(
            columns=printing.default_spec().columns,
            orientation=printing.LANDSCAPE,
            grid=False,
            repeat_header=False,
            center_v=True,
            stripes=True,
            group_break="wave_time",
            title="Yard Sheet",
            note="Keys back by 9",
        ),
        "draw:long-title-by-pad": printing.PrintSpec(
            columns=printing.default_spec().columns
            + [printing.PrintColumn(kind=printing.CHECKBOX, heading="Keys")],
            scale=150,
            group_break="pad",
            title="Morning hand-out for the yard – the driver’s copy, with every "
            "single route on it and a good deal more besides",
            note="Ask at the desk if your van is not on this sheet — do not take another",
        ),
        "draw:tiny-columns": printing.PrintSpec(
            columns=[replace(column, weight=1) for column in every],
            scale=40,
            center_h=False,
        ),
        "draw:no-head": printing.PrintSpec(
            columns=printing.default_spec().columns,
            show_title=False,
            show_page_numbers=False,
            paper="tabloid",
        ),
        "draw:numbers-only-spill": printing.PrintSpec(
            columns=list(every),
            show_title=False,
            fit_one_page=False,
            scale=120,
            repeat_header=False,
        ),
    }


def cases_for(st) -> dict[str, printing.PrintSpec]:
    rows = st.print_rows()
    out = {"default": printing.default_spec(), "working": st.print_spec()}
    for name in st.print_presets():
        out[f"preset:{name}"] = st.print_preset(name)
    out["vans"] = vans_spec(st.print_spec())
    out.update(harness.synthetic_specs(rows))
    out.update(drawing_specs())
    return out


def file_stem(case: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in case)


def check_against_parity(day_id: str, st) -> None:
    printing_json = json.loads((PARITY / day_id / "printing.json").read_text(encoding="utf-8"))
    export_json = json.loads((PARITY / day_id / "export.json").read_text(encoding="utf-8"))
    rows = [{"key": r.key, "values": r.values} for r in st.print_rows()]
    if rows != printing_json["print_rows"]:
        raise SystemExit(f"{day_id}: print rows differ from the parity file")
    for key, with_dwp in (("plain", False), ("with_dwp", True)):
        cells = [list(r) for r in export.rows_for(st.roster, with_dwp)]
        if cells != export_json["rows"][key]:
            raise SystemExit(f"{day_id}: export rows ({key}) differ from the parity file")


def run_day(day, out: Path) -> dict:
    ctx = harness.fresh(day)
    try:
        st = ctx.state
        st.apply_route_data(harness.MAIN_KIND)
        st.apply_dwp()
        st.assign_vans()
        check_against_parity(day.id, st)

        folder = out / day.id
        folder.mkdir(parents=True, exist_ok=True)
        date_label = st.roster.date_label()
        rows = st.print_rows()
        record: dict = {"date_label": date_label, "export": {}, "print": {}}

        for key, with_dwp in (("export-plain", False), ("export-dwp", True)):
            for suffix in (".pdf", ".xlsx"):
                written = export.write(str(folder / f"{key}{suffix}"), st.roster, with_dwp)
            record["export"][key] = {"with_dwp": with_dwp, "drivers": written, "file": key}

        for case, spec in cases_for(st).items():
            stem = file_stem(case)
            entry = {"file": stem, "spec": asdict(spec)}
            try:
                for suffix in (".pdf", ".xlsx"):
                    drivers, pages = printing.write(
                        str(folder / f"{stem}{suffix}"), rows, spec, date_label
                    )
                entry["drivers"] = drivers
                entry["pages"] = pages
            except printing.PrintError:
                entry["error"] = "nobody-prints"
            record["print"][case] = entry
        return record
    finally:
        ctx.close()


def main(argv: list[str]) -> int:
    out = Path(argv[1]) if len(argv) > 1 else HERE / "python-out"
    for spec in harness.DAYS:
        day = harness.Day(spec)
        record = run_day(day, out)
        harness.write_json(EXPECTED / day.id / "cases.json", record)
        print(f"{day.id}: {len(record['print'])} print layouts, 2 exports")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
