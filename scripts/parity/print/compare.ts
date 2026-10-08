// Print parity: draw every reference case with this app's writers and compare with the old app's.
//
//   npx tsx scripts/parity/print/compare.ts [--write OUT]
//
// Prints one line per case (pages, texts and boxes compared, the largest shift in points) and every
// difference beyond the tolerance. Exits 1 if there is any. `--write OUT` also saves this app's
// files into OUT (default scripts/parity/print/ts-out/), to open side by side with the old app's.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkPdf, inkWorkbook } from '../../../apps/desktop/src/main/print/inspect';
import {
  diffPdf,
  diffWorkbook,
  encodePdf,
  encodeWorkbook,
} from '../../../apps/desktop/src/main/print/parity';
import {
  DAYS,
  caseNames,
  reference,
  writeCase,
} from '../../../apps/desktop/src/main/print/referenceCases';

// With no folder named, the files go next to this script (ts-out/, which is never committed),
// wherever the command is run from.
const DEFAULT_OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ts-out');
const writeAt = process.argv.indexOf('--write');
const named = writeAt > 0 ? process.argv[writeAt + 1] : undefined;
const out =
  writeAt > 0 ? (named && !named.startsWith('--') ? path.resolve(named) : DEFAULT_OUT) : null;

let failures = 0;
let worst = 0;
for (const day of DAYS) {
  for (const { name, file, skip } of caseNames(day)) {
    if (skip) continue;
    const expected = reference(day, file);
    const pdf = await writeCase(day, name, 'pdf');
    const xlsx = await writeCase(day, name, 'xlsx');
    if (out) {
      mkdirSync(path.join(out, day), { recursive: true });
      writeFileSync(path.join(out, day, `${file}.pdf`), pdf.bytes);
      writeFileSync(path.join(out, day, `${file}.xlsx`), xlsx.bytes);
    }
    const pdfDiff = diffPdf(expected.pdf, encodePdf(await inkPdf(pdf.bytes)));
    const xlsxDiff = diffWorkbook(expected.xlsx, encodeWorkbook(await inkWorkbook(xlsx.bytes)));
    worst = Math.max(worst, pdfDiff.maxShift);
    const problems = [...pdfDiff.problems, ...xlsxDiff];
    console.log(
      `${day} ${name}: ${expected.pdf.pages.length} pages, ${pdfDiff.texts} texts, ` +
        `${pdfDiff.boxes} boxes, largest shift ${pdfDiff.maxShift} pt, ` +
        `${expected.xlsx[0]?.cells.length ?? 0} cells - ${problems.length} differences`,
    );
    for (const problem of problems.slice(0, 10)) console.log(`    ${problem}`);
    failures += problems.length;
  }
}
console.log(`Largest shift anywhere: ${worst} pt. Differences: ${failures}.`);
process.exit(failures ? 1 : 0);
