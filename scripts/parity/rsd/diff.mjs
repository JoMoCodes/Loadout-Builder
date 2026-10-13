// The route sheet parity check: runs the new package over the synthetic route sheets (newSide.ts,
// through tsx) and compares every file it writes with what the old app's core wrote (dump.mjs).
//
//   npm run parity:rsd:diff            run the new side, then compare
//   node scripts/parity/rsd/diff.mjs --no-run   compare only (actual/ already written)
//   --max N / --all                    how many differences to print per file (default 20)
//
// JSON files are compared as values (numbers must be identical). Text files (.html, .txt, .csv,
// .eml) must be the same bytes; the first differing line is shown. In an .eml the attached PDF's
// bytes are left out of the comparison: pdf-lib stamps every PDF it writes with a new document ID
// and the time, so two runs of the same code never give the same bytes (the attachment's page
// count is compared through emails.json instead). The headers, the text part and the HTML part
// of the draft must still match exactly. Exit code 0 when everything
// matches, 1 when anything differs or is missing, 2 when the new side could not run.
//
// The summary lines hold counts only. The lines under a file name show the path into the JSON
// and the two values, or the two differing lines, so they can show a made-up fixture name; they
// are for the person running this.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffValues } from '../diff.mjs';
import { ACTUAL, EXPECTED, REPO } from './inputs.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function walk(root, dir = root, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(relative(root, full));
  }
  return out;
}

// The attachment part of a draft: everything between its base64 header and the closing boundary.
const ATTACHMENT_BYTES =
  /(Content-Disposition: attachment;[^\r\n]*\r\nContent-Transfer-Encoding: base64\r\n\r\n)[\s\S]*?(\r\n--mixed_)/g;

function withoutAttachmentBytes(eml) {
  return eml.replace(ATTACHMENT_BYTES, '$1[the PDF bytes]$2');
}

function compareText(expected, actual) {
  if (expected === actual) return [];
  const a = expected.split(/\r?\n/);
  const b = actual.split(/\r?\n/);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return [
        { path: `line ${i + 1}`, expected: a[i] ?? '(no line)', actual: b[i] ?? '(no line)' },
      ];
    }
  }
  return [{ path: 'line endings', expected: 'differ', actual: 'differ' }];
}

export function compareFolders(expectedRoot, actualRoot, { max = 20 } = {}) {
  const files = walk(expectedRoot).filter((f) => !f.endsWith('inputs.json'));
  let bad = 0;
  for (const file of files) {
    const e = join(expectedRoot, file);
    const a = join(actualRoot, file);
    if (!existsSync(a)) {
      bad++;
      console.log(`MISSING  ${file}`);
      continue;
    }
    let diffs;
    if (file.endsWith('.json')) {
      diffs = diffValues(JSON.parse(readFileSync(e, 'utf8')), JSON.parse(readFileSync(a, 'utf8')), {
        exact: true,
      });
    } else if (file.endsWith('.eml')) {
      diffs = compareText(
        withoutAttachmentBytes(readFileSync(e, 'utf8')),
        withoutAttachmentBytes(readFileSync(a, 'utf8')),
      );
    } else {
      diffs = compareText(readFileSync(e, 'utf8'), readFileSync(a, 'utf8'));
    }
    if (!diffs.length) continue;
    bad++;
    console.log(`DIFFERS  ${file}: ${diffs.length} difference(s)`);
    for (const d of diffs.slice(0, max)) {
      console.log(`    ${d.path}: expected ${show(d.expected)} but got ${show(d.actual)}`);
    }
  }
  const extra = walk(actualRoot).filter((f) => !files.includes(f) && !f.endsWith('inputs.json'));
  for (const f of extra) {
    bad++;
    console.log(`EXTRA    ${f}`);
  }
  return { files: files.length, bad };
}

function show(value) {
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  if (text === undefined) return 'nothing';
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function main() {
  const args = process.argv.slice(2);
  const max = args.includes('--all') ? Infinity : Number(args[args.indexOf('--max') + 1]) || 20;
  if (!args.includes('--no-run')) {
    const run = spawnSync('npx', ['tsx', join(here, 'newSide.ts')], {
      cwd: REPO,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (run.status !== 0) {
      console.error('The new side did not run.');
      process.exit(2);
    }
  }
  const { files, bad } = compareFolders(EXPECTED, ACTUAL, { max });
  if (bad) {
    console.log(`\n${bad} of ${files} files differ or are missing.`);
    process.exit(1);
  }
  console.log(`\nAll ${files} files match the old app.`);
}

main();
