// The POD report reader against the old app's own output, plus small hand-built cases.
// Names and IDs in the hand-built cases are made-up people from packages/fixtures/manifest.json.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPdfWords, wordsFromTextItem } from './pdfWords.node';
import {
  parsePodFile,
  parsePodFiles,
  parsePodPage,
  type PdfWord,
  type PdfWords,
  type PodWeekEntry,
} from './pod';

const repo = join(__dirname, '..', '..', '..', '..');
const podDir = join(repo, 'packages', 'fixtures', 'performance', 'pod');
const expectedDir = join(repo, 'scripts', 'parity', 'wpa', 'expected');

type ExpectedRow = Record<string, string | number | null>;

/** The old table's column names to this port's field names (Id and ImportedAt ignored). */
function fromColumns(row: ExpectedRow): PodWeekEntry {
  const out: Record<string, unknown> = {};
  for (const [col, value] of Object.entries(row)) {
    if (col === 'Id' || col === 'ImportedAt') continue;
    out[col.charAt(0).toLowerCase() + col.slice(1)] = value;
  }
  return out as unknown as PodWeekEntry;
}

const byKey = (a: PodWeekEntry, b: PodWeekEntry): number =>
  a.transporterId < b.transporterId
    ? -1
    : a.transporterId > b.transporterId
      ? 1
      : a.week < b.week
        ? -1
        : a.week > b.week
          ? 1
          : 0;

async function readFixtures(): Promise<PdfWords[]> {
  // Same order as the old app's harness: file names in ordinal order.
  const names = readdirSync(podDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
  const out: PdfWords[] = [];
  for (const fileName of names) {
    const pages = await readPdfWords(new Uint8Array(readFileSync(join(podDir, fileName))));
    out.push({ fileName, pages });
  }
  return out;
}

describe('POD report: the fixtures give the old app’s rows', () => {
  it('matches the PodWeekEntries table and the import counts', async () => {
    const files = await readFixtures();
    const result = parsePodFiles(files);

    const table = JSON.parse(
      readFileSync(join(expectedDir, 'tables', 'PodWeekEntries.json'), 'utf8'),
    ) as { rows: ExpectedRow[] };
    const expectedRows = table.rows.map(fromColumns).sort(byKey);
    expect([...result.rows].sort(byKey)).toEqual(expectedRows);

    const imports = JSON.parse(readFileSync(join(expectedDir, 'import-results.json'), 'utf8')) as {
      importer: string;
      filesProcessed: number;
      rowsImported: number;
      weeks: string[];
      errors: string[];
    }[];
    const pod = imports.find((i) => i.importer === 'PodImporter');
    expect(pod).toBeDefined();
    expect(result.filesProcessed).toBe(pod?.filesProcessed);
    expect(result.rowsImported).toBe(pod?.rowsImported);
    expect(result.rows).toHaveLength(646);
    expect(result.replaceWeeks).toEqual(pod?.weeks);
    expect([...result.weeksImported].sort()).toEqual(pod?.weeks);
    expect(result.errors).toEqual(pod?.errors);
  }, 60_000);
});

// ---- hand-built cases -----------------------------------------------------------------

const ID_A = 'AL90S1HKKSEQK'; // Zelda Oakley
const ID_B = 'AZ0G28A1GHVQZ'; // Felicia Wendell Thorne
const COUNTS = ['560', '559', '0', '1', '0', '0', '1', '0', '0', '0', '0', '0', '0'];

/** One table row laid out left to right at height y, like the report. */
function row(y: number, tokens: string[], yFor?: (i: number) => number): PdfWord[] {
  return tokens.map((text, i) => ({ text, x: 36 + i * 20, y: yFor ? yFor(i) : y }));
}

const FILE = 'US-XXXX-XXX1-Week7-2026NA-DA-POD-Details.pdf';

describe('parsePodPage', () => {
  it('reads name, ID and the 13 counts in the old column order', () => {
    const [entry] = parsePodPage(
      { page: 2, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) },
      '2026-W07',
      FILE,
    );
    expect(entry).toEqual({
      transporterId: ID_A,
      week: '2026-W07',
      name: 'Zelda Oakley',
      opportunities: 560,
      success: 559,
      bypass: 0,
      rejects: 1,
      blurryPhoto: 0,
      humanInThePicture: 0,
      noPackageDetected: 1,
      packageInCar: 0,
      packageInHand: 0,
      packageNotClearlyVisible: 0,
      packageTooClose: 0,
      photoTooDark: 0,
      other: 0,
      sourceFile: FILE,
    });
  });

  it('orders words by x and rows top of page first, whatever order they come in', () => {
    const words = [
      ...row(552, ['Felicia', 'Wendell', 'Thorne', ID_B, ...COUNTS]),
      ...row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]),
    ].reverse();
    const rows = parsePodPage({ page: 2, words }, '2026-W07', FILE);
    expect(rows.map((r) => r.name)).toEqual(['Zelda Oakley', 'Felicia Wendell Thorne']);
  });

  it('keeps words within the same 2-unit bucket on one row', () => {
    // y / 2 rounds to 282 for 563.2 .. 564.9 (and 565 itself, since halves go to even).
    const offsets = [564, 563.2, 564.9, 565];
    const rows = parsePodPage(
      {
        page: 2,
        words: row(0, ['Zelda', 'Oakley', ID_A, ...COUNTS], (i) => offsets[i % 4] ?? 564),
      },
      '2026-W07',
      FILE,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Zelda Oakley');
  });

  it('splits a row whose words cross a bucket edge, like the old app', () => {
    // 563 / 2 = 281.5 rounds to 282 (even); 567 / 2 = 283.5 rounds to 284. The counts sit
    // in another bucket from the ID, so the row is dropped.
    const words = row(0, ['Zelda', 'Oakley', ID_A, ...COUNTS], (i) => (i <= 2 ? 563 : 567));
    expect(parsePodPage({ page: 2, words }, '2026-W07', FILE)).toEqual([]);

    // A name word just over the edge is lost from the name but the row still reads.
    const nameSplit = row(0, ['Zelda', 'Oakley', ID_A, ...COUNTS], (i) => (i === 0 ? 561 : 564));
    const rows = parsePodPage({ page: 2, words: nameSplit }, '2026-W07', FILE);
    expect(rows.map((r) => r.name)).toEqual(['Oakley']);
  });

  it('skips rows with too few counts or a count that is not a whole number', () => {
    const short = row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS.slice(0, 12)]);
    const notNumber = row(552, ['Felicia', 'Thorne', ID_B, '99.5%', ...COUNTS.slice(1)]);
    expect(parsePodPage({ page: 2, words: [...short, ...notNumber] }, '2026-W07', FILE)).toEqual(
      [],
    );
  });

  it('gives nothing for a page with no rows', () => {
    expect(parsePodPage({ page: 1, words: [] }, '2026-W07', FILE)).toEqual([]);
    const title = row(564, ['XXX1', 'Week', '7', '2026', 'DA', 'POD', 'Details']);
    expect(parsePodPage({ page: 1, words: title }, '2026-W07', FILE)).toEqual([]);
  });
});

describe('parsePodFile and parsePodFiles', () => {
  it('takes the week from the file name, zero padded', () => {
    const r = parsePodFile({ fileName: 'x-week7-2026.pdf', pages: [] });
    expect(r.week).toBe('2026-W07');
    expect(r.ok).toBe(true);
  });

  it('refuses a file name without a week, in plain words', () => {
    const r = parsePodFile({
      fileName: 'POD-Details.pdf',
      pages: [{ page: 2, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) }],
    });
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('POD-Details.pdf');
    expect(r.errors[0]).toContain('no week');
    expect(r.errors[0]).not.toContain(ID_A);
  });

  it('reports an unreadable PDF but still lists its week, like the old app', () => {
    const result = parsePodFiles([{ fileName: FILE, unreadable: true }]);
    expect(result.filesProcessed).toBe(0);
    expect(result.weeksImported).toEqual(['2026-W07']);
    expect(result.errors).toHaveLength(1);
  });

  it('drops a file listing the same driver twice in one week, keeping the old counter', () => {
    const file: PdfWords = {
      fileName: FILE,
      pages: [
        { page: 2, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) },
        { page: 3, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) },
      ],
    };
    const result = parsePodFiles([file]);
    expect(result.rows).toEqual([]);
    expect(result.rowsImported).toBe(1);
    expect(result.filesProcessed).toBe(0);
    expect(result.errors[0]).toContain('page 3');
    expect(result.errors[0]).not.toContain(ID_A);
    expect(result.errors[0]).not.toContain('Zelda');
  });

  it('lets a later file for the same week replace the earlier one', () => {
    const first: PdfWords = {
      fileName: 'a-Week7-2026.pdf',
      pages: [{ page: 2, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) }],
    };
    const second: PdfWords = {
      fileName: 'b-Week07-2026.pdf',
      pages: [{ page: 2, words: row(564, ['Felicia', 'Wendell', 'Thorne', ID_B, ...COUNTS]) }],
    };
    const result = parsePodFiles([first, second]);
    expect(result.filesProcessed).toBe(2);
    expect(result.rowsImported).toBe(2);
    expect(result.weeksImported).toEqual(['2026-W07']);
    expect(result.rows.map((r) => r.transporterId)).toEqual([ID_B]);
  });

  it('lists the weeks to empty: every file that read fine, even one listing nobody', () => {
    const listed: PdfWords = {
      fileName: 'a-Week8-2026.pdf',
      pages: [{ page: 2, words: row(564, ['Zelda', 'Oakley', ID_A, ...COUNTS]) }],
    };
    const nobody: PdfWords = { fileName: 'b-Week07-2026.pdf', pages: [{ page: 1, words: [] }] };
    const unreadable = { fileName: 'c-Week09-2026.pdf', unreadable: true as const };
    const noWeek: PdfWords = { fileName: 'POD-Details.pdf', pages: [] };
    const result = parsePodFiles([listed, nobody, unreadable, noWeek]);
    expect(result.replaceWeeks).toEqual(['2026-W07', '2026-W08']);
    expect(result.rows.map((r) => r.week)).toEqual(['2026-W08']);
    expect(result.weeksImported).toEqual(['2026-W08', '2026-W07', '2026-W09']);
  });
});

describe('wordsFromTextItem', () => {
  it('splits an item with spaces into words and shares out the width by characters', () => {
    const words = wordsFromTextItem({
      str: 'Zelda  Oakley',
      transform: [8, 0, 0, 8, 36, 564],
      width: 52,
    });
    expect(words).toEqual([
      { text: 'Zelda', x: 36, y: 564 },
      { text: 'Oakley', x: 36 + (52 * 7) / 13, y: 564 },
    ]);
  });

  it('gives nothing for a whitespace-only item', () => {
    expect(wordsFromTextItem({ str: '  ', transform: [8, 0, 0, 8, 36, 564], width: 10 })).toEqual(
      [],
    );
  });
});
