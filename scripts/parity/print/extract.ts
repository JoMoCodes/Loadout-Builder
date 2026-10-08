// Print parity: read the old app's reference sheets back into text, for the repo.
//
//   python3 -I scripts/parity/print/python_print.py      # the old writers draw into python-out/
//   npx tsx scripts/parity/print/extract.ts              # python-out/ -> expected/<day>/<case>.json
//   npx tsx scripts/parity/print/compare.ts              # this app's writers against expected/
//
// Each expected/<day>/<case>.json holds what the PDF says page by page (every piece of text and
// every box, where and in what font and colour) and what the workbook holds cell by cell. The
// sheets are made-up fixture data, so the text can sit in the repo; the PDF and XLSX files cannot.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkPdf, inkWorkbook } from '../../../apps/desktop/src/main/print/inspect';
import { encodePdf, encodeWorkbook } from '../../../apps/desktop/src/main/print/parity';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] ?? path.join(here, 'python-out'));
const target = path.join(here, 'expected');

let written = 0;
for (const day of readdirSync(source).sort()) {
  const folder = path.join(source, day);
  const stems = [
    ...new Set(
      readdirSync(folder)
        .filter((name) => name.endsWith('.pdf'))
        .map((name) => name.slice(0, -4)),
    ),
  ].sort();
  for (const stem of stems) {
    const pdf = encodePdf(
      await inkPdf(new Uint8Array(readFileSync(path.join(folder, `${stem}.pdf`)))),
    );
    const xlsx = encodeWorkbook(
      await inkWorkbook(new Uint8Array(readFileSync(path.join(folder, `${stem}.xlsx`)))),
    );
    writeFileSync(path.join(target, day, `${stem}.json`), `${JSON.stringify({ pdf, xlsx })}\n`);
    written += 1;
  }
}
console.log(`Wrote ${written} reference sheets.`);
