// Builds the local "never commit these" list of real driver names.
//
//   node scripts/make-real-names.mjs "C:\path\to\AssociateData.csv" [more files...]
//
// It reads the real associate export (a file that lives OUTSIDE this repo) and writes
// .private/real-names.txt, one name per line. The privacy scan reads that list and refuses
// to let any of those names into a commit. The file is ignored by git and never leaves this
// computer. Running it again adds to the list instead of replacing it.
//
// This script prints how many names it wrote, never the names themselves.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outFile = resolve(repoRoot, '.private', 'real-names.txt');

const NAME_HEADERS = ['name and id', 'name', 'associate name', 'driver name', 'driver', 'names'];
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

function clean(value) {
  return String(value ?? '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All the ways one person's name tends to be written in the exports. */
export function formsOf(rawName) {
  const name = clean(rawName);
  if (!name) return [];
  const tokens = name.split(/[\s,]+/).filter(Boolean);
  if (tokens.length < 2) return [];
  const forms = new Set([tokens.join(' ')]);
  let core = tokens;
  if (core.length > 2 && SUFFIXES.has(core[core.length - 1].toLowerCase().replace('.', ''))) {
    core = core.slice(0, -1);
  }
  const first = core[0];
  const last = core[core.length - 1];
  forms.add(`${first} ${last}`);
  forms.add(`${last} ${first}`);
  return [...forms];
}

function readNamesFromCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const column = fields.find((field) => NAME_HEADERS.includes(field.trim().toLowerCase()));
  if (!column) {
    throw new Error(`No name column found in ${path}. Looked for: ${NAME_HEADERS.join(', ')}.`);
  }
  return parsed.data.map((row) => row[column]).filter(Boolean);
}

function main(paths) {
  if (paths.length === 0) {
    console.error('Give the path of the real associate export, for example:');
    console.error(
      '  node scripts/make-real-names.mjs "%USERPROFILE%\\Downloads\\AssociateData.csv"',
    );
    process.exit(2);
  }
  const names = new Set();
  if (existsSync(outFile)) {
    for (const line of readFileSync(outFile, 'utf8').split(/\r?\n/)) {
      if (line.trim()) names.add(line.trim());
    }
  }
  const before = names.size;
  for (const path of paths) {
    const file = resolve(path);
    if (file.toLowerCase().startsWith(repoRoot.toLowerCase())) {
      console.error('That file is inside this repo. Real exports must stay outside it.');
      process.exit(2);
    }
    for (const raw of readNamesFromCsv(file)) {
      for (const form of formsOf(raw)) names.add(form);
    }
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, [...names].sort().join('\n') + '\n');
  console.log(
    `Saved ${names.size} name forms to .private/real-names.txt (${names.size - before} new).`,
  );
  console.log('That file stays on this computer and is ignored by git.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
