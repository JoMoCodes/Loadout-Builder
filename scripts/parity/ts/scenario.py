"""The made-up day the state unit tests replay (packages/core/src/state/appState.test.ts).

    python3 -I scripts/parity/ts/scenario.py

Builds a small day by hand on the old app's AppState and prints what each step answered, as JSON.
The TypeScript test builds the same day and expects the same answers; this script is how those
answers were produced. Names and IDs come from packages/fixtures/manifest.json.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "legacy" / "python"))

from loadout_builder.models import (  # noqa: E402
    Associate,
    AssociateBook,
    DriverRow,
    DwpDataSet,
    DwpEntry,
    Roster,
    RouteDataSet,
    RouteEntry,
)
from loadout_builder.state import AppState  # noqa: E402
from loadout_builder.storage import Store  # noqa: E402

TODAY = date(2026, 9, 11)
IDS = {
    "carmen": "A047LNAN5VQIQR",
    "nadine": "A083QLD1CI9YSZ",
    "barrett": "A08Z3QTIYAI58G",
    "beatrice": "A0DZDWECHDJ5TO",
    "beatrice_esme": "A0FU25U7H48VU2",
    "colton": "A0FXMBXTK81V4D",
    "elodie": "A0G8EUL2VJ2V9F",
    "greta": "A0IVCK2UTQ9OVR",
    "beatrice_q": "A0OSA9BYLF0C4L",
    "andre": "A0R9UJ713V4B0X",
    "nolan": "A0TRKAKN2V09HH",
}


def build(st: AppState) -> None:
    st.associates = AssociateBook(
        rows=[
            Associate("Carmen Abernathy", IDS["carmen"], qualifications=("EDV",), status="ACTIVE",
                      id_expiration=date(2026, 9, 21)),
            Associate("Nadine Abernathy", IDS["nadine"], qualifications=("Step Van",),
                      status="INACTIVE", id_expiration=date(2026, 9, 8)),
            Associate("Nolan Abernathy", "", qualifications=()),
            Associate("Barrett Hadley Ainsworth", IDS["barrett"],
                      qualifications=("EDV", "CDV", "DOT"), status="ACTIVE"),
            Associate("Beatrice Redmond", IDS["beatrice"], qualifications=("EDV",)),
            Associate("Beatrice Esme Redmond", IDS["beatrice_esme"], qualifications=("EDV",)),
            Associate("Colton Alderman", IDS["colton"], qualifications=("EDV",)),
        ]
    )
    st.roster = Roster(
        rows=[
            DriverRow(driver="Carmen Abernathy", shift_type="Step Van Route"),
            DriverRow(driver="Nadine Abernathy", shift_type="Electric Route"),
            DriverRow(driver="Barrett Ainsworth", vehicle="Van 7", vin="VAN-7"),
            DriverRow(driver="Carmen Abernathey"),
            DriverRow(driver="Beatrice X Redmond"),
            DriverRow(driver="Zane Applewhite", routes="CX9", staging_location="STG.Z99", bags="4"),
            DriverRow(driver="Colton Alderman"),
            DriverRow(driver="Mabel Alderman"),
        ],
        load_out_date=TODAY,
    )
    st.route_data["routes"] = RouteDataSet(
        kind="routes",
        rows=[
            RouteEntry(IDS["carmen"], "Carmen Abernathy", "CX1", "10:20am", "Standard Parcel Step Van"),
            RouteEntry(IDS["barrett"], "Barrett Hadley Ainsworth", "CX2", "10:25am",
                       "Standard Parcel Electric - Rivian MEDIUM"),
            RouteEntry(IDS["elodie"], "Elodie Alderman", "cx 3", "10:20am", "Standard Parcel Step Van"),
            RouteEntry(IDS["nolan"], "Nolan Abernathy", "CX4", "10:25am", "On Road Experience Driver"),
            RouteEntry(IDS["greta"], "Greta Underhill", "", "10:20am", ""),
            RouteEntry(IDS["carmen"], "Carmen Abernathy", "CX5", "10:30am", "Standard Parcel"),
            RouteEntry(IDS["beatrice_q"], "Beatrice Q Redmond", "CX6", "10:30am", "Standard Parcel"),
            RouteEntry(IDS["colton"], "Colton Alderman", "CX7", "10:30am", "Standard Parcel"),
        ],
    )
    st.route_data["itineraries"] = RouteDataSet(
        kind="itineraries",
        rows=[
            RouteEntry(IDS["andre"], "Andre Ainsworth", "", "", "Standard Parcel Electric"),
            RouteEntry(IDS["elodie"], "Elodie Alderman", "CX3", "", "Standard Parcel Step Van"),
        ],
    )
    st.route_data["schedule"] = RouteDataSet(
        kind="schedule",
        rows=[
            RouteEntry(IDS["carmen"], "Carmen Abernathy", "", "9:00am", "", pad="3"),
            RouteEntry(IDS["barrett"], "Barrett Hadley Ainsworth", "", "9:30am", ""),
            RouteEntry("", "", "", "9:45am", "", shared_drivers="Elodie Alderman|Greta Underhill",
                       shared_ids=f"{IDS['elodie']}|{IDS['greta']}"),
        ],
        pads={"9:45am": 2},
    )
    st.dwp = DwpDataSet(
        rows=[
            DwpEntry("CX1", bags="5", ovs="2", staging="STG.A01"),
            DwpEntry("CX2", bags="", ovs="1", staging=""),
            DwpEntry("CX3", bags="7", ovs="", staging="STG.B02"),
            DwpEntry("cx3", bags="9", ovs="9", staging="STG.B09"),
        ],
        day=date(2026, 9, 10),
    )
    st.previous_roster = Roster(
        rows=[
            DriverRow(driver="Carmen Abernathy", vin="VAN-1"),
            DriverRow(driver="Barrett Ainsworth", vin="VAN-2"),
            DriverRow(driver="Nolan Abernathy", vin="VAN-3"),
            DriverRow(driver="Zane Applewhite", vin="VAN-4"),
            DriverRow(driver="Carmen Abernathy", vin="VAN-5"),
            DriverRow(driver="Beatrice Redmond", vin="VAN-6"),
            DriverRow(driver="Colton Alderman"),
        ],
        load_out_date=date(2026, 9, 10),
    )
    st.lmr_approved = {IDS["barrett"]}
    st.link_driver("Colton Alderman", None)


def ref(associate):
    return [associate.name, associate.transporter_id] if associate else None


def matches(st: AppState):
    return {
        key: [m.method, ref(m.associate), [a.transporter_id for a in m.candidates]]
        for key, m in st.matches.items()
    }


def readouts(st: AppState):
    return [
        {
            "driver": row.driver,
            "check": st.check_text(row),
            "issues": st.driver_issues(row, TODAY),
            "badges": st.van_badges(st.associate_for(row)),
        }
        for row in st.roster.rows
    ]


def main() -> None:
    import loadout_builder.state as state_module

    class Fixed(date):
        @classmethod
        def today(cls):
            return TODAY

    state_module.date = Fixed
    import loadout_builder.models as models_module

    models_module.date = Fixed

    tmp = Path(tempfile.mkdtemp(prefix="scenario-"))
    try:
        st = AppState(Store(tmp / "loadout.db"))
        build(st)
        out = {}
        out["matches_before"] = matches(st)
        out["summary_before"] = st.match_summary()
        out["counts_before"] = [st.matched_count(), st.review_count(), sorted(st.rostered_ids())]
        out["readouts_before"] = readouts(st)
        out["previous_vans"] = st.previous_vans()
        out["loaded"] = st.loaded_route_sources()
        st.set_pads("routes", {"10:20am": 1, "10:25am": 2, "10:30am": 0})
        out["pads"] = st.route_set("routes").pads
        out["adopt"] = list(st.adopt_schedule_pads("routes"))
        out["entry_pads"] = [e.pad for e in st.route_set("routes").rows]
        result = st.apply_route_data("routes")
        out["route_result"] = [
            result.filled, result.dispatch_times, result.route_codes, result.service_types,
            result.pads, result.no_associate, result.not_in_export, result.duplicates,
            result.added_drivers, result.needs_review,
        ]
        out["rows_after"] = [
            [r.driver, r.shift_type, r.routes, r.wave_time, r.pad, r.service_type]
            for r in st.roster.rows
        ]
        out["associates_after"] = [
            [a.name, a.transporter_id, a.position, list(a.qualifications), a.status, a.tenure]
            for a in st.associates.rows
        ]
        out["links_after"] = st.links
        out["matches_after"] = matches(st)
        out["previous_vans_after"] = st.previous_vans()
        out["dwp_before"] = [st.dwp_day_status(), st.dwp_matched_count()]
        dwp = st.apply_dwp()
        out["dwp_result"] = [dwp.filled, dwp.staging, dwp.bags, dwp.ovs, dwp.no_route_code,
                             dwp.not_in_sheet, dwp.cleared]
        out["dwp_rows"] = [[r.driver, r.staging_location, r.bags, r.ovs] for r in st.roster.rows]
        out["readouts_after"] = readouts(st)
        st.link_driver("Zane Applewhite", IDS["colton"])
        out["linked"] = matches(st)["zane applewhite"]
        st.unlink_driver("Zane Applewhite")
        out["unlinked"] = matches(st)["zane applewhite"]
        out["moved"] = st.move_to_previous_roster()
        out["previous_vans_moved"] = st.previous_vans()
        st.clear_previous_roster()
        out["previous_vans_cleared"] = st.previous_vans()
        st.clear_route_data("routes")
        out["loaded_after_clear"] = st.loaded_route_sources()
        print(json.dumps(out, indent=1, default=list))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
