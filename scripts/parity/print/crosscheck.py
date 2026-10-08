"""Print parity, a second opinion: compare the two apps' PDFs with pdfplumber instead of our reader.

    python3 -I scripts/parity/print/python_print.py                 # old app -> python-out/
    npx tsx scripts/parity/print/compare.ts --write scripts/parity/print/ts-out
    python3 -I scripts/parity/print/crosscheck.py                   # python-out/ against ts-out/

The test in apps/desktop/src/main/print/parity.test.ts reads both apps' PDFs with the app's own
reader (inspect.ts). This reads them with an outside one, so a mistake in that reader cannot hide a
difference. For every PDF: page count, page size, fonts, every word with its place and size, and
every box and line. Needs pdfplumber (see requirements-dev.txt in this folder).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pdfplumber

HERE = Path(__file__).resolve().parent
TOLERANCE = 0.02


def read(path: Path):
    with pdfplumber.open(path) as pdf:
        pages = []
        for page in pdf.pages:
            words = [
                (w["text"], round(w["x0"], 2), round(w["bottom"], 2), round(w["size"], 2), w["fontname"])
                for w in page.extract_words(keep_blank_chars=True, extra_attrs=["size", "fontname"])
            ]
            boxes = sorted(
                (round(r["x0"], 2), round(r["top"], 2), round(r["width"], 2), round(r["height"], 2),
                 bool(r["stroke"]), bool(r["fill"]))
                for r in page.rects
            )
            pages.append(((round(page.width, 2), round(page.height, 2)), words, boxes))
        return pages


def close(a, b) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) <= TOLERANCE
    return a == b


def same(row_a, row_b) -> bool:
    return len(row_a) == len(row_b) and all(close(x, y) for x, y in zip(row_a, row_b))


def main(argv: list[str]) -> int:
    old = Path(argv[1]) if len(argv) > 1 else HERE / "python-out"
    new = Path(argv[2]) if len(argv) > 2 else HERE / "ts-out"
    differences = 0
    files = 0
    for reference in sorted(old.glob("*/*.pdf")):
        mine = new / reference.parent.name / reference.name
        if not mine.exists():
            print(f"{reference.parent.name}/{reference.name}: not written by the new app")
            differences += 1
            continue
        files += 1
        a, b = read(reference), read(mine)
        problems = []
        if len(a) != len(b):
            problems.append(f"pages {len(a)} against {len(b)}")
        for number, (pa, pb) in enumerate(zip(a, b), start=1):
            if not same(pa[0], pb[0]):
                problems.append(f"page {number} size {pa[0]} against {pb[0]}")
            if len(pa[1]) != len(pb[1]) or not all(same(x, y) for x, y in zip(pa[1], pb[1])):
                problems.append(f"page {number} words differ")
            if len(pa[2]) != len(pb[2]) or not all(same(x, y) for x, y in zip(pa[2], pb[2])):
                problems.append(f"page {number} boxes differ")
        if problems:
            differences += len(problems)
            print(f"{reference.parent.name}/{reference.name}: {'; '.join(problems[:5])}")
    print(f"Compared {files} PDFs: {differences} differences.")
    return 1 if differences else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
