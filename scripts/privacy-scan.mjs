// The privacy check. It looks through files for anything that could be real driver data
// and fails (exit code 1) if it finds some. It runs:
//   - before every commit on this computer (`--staged`, installed by install-hooks.mjs)
//   - on every push in GitHub, over the whole repo (the "Privacy scan" job)
//   - by hand with `npm run scan`
//
// What counts as a problem:
//   1. An email address (except made-up ones at example.com and similar).
//   2. A 10-digit phone number (except the fictional 555-01xx range the fixtures use).
//   3. The station code or DSP name, read from .private/station.txt (one per line) or from
//      the LB_STATION_CODE variable. If neither exists this check is skipped, and it says so.
//   4. Anything shaped like a Transporter ID or a VIN that is not listed in
//      packages/fixtures/manifest.json.
//   5. Any name in .private/real-names.txt (only on computers that have that file).
//
// Usage:
//   node scripts/privacy-scan.mjs               every file git knows about
//   node scripts/privacy-scan.mjs --staged      only what is about to be committed
//   node scripts/privacy-scan.mjs path [path…]  these files or folders
//
// To keep the check from leaking what it protects, the report never prints the value it
// found. It prints the file, the line, and what kind of thing it was.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// ---------------------------------------------------------------------------
// The shapes we look for. Described in words, never with a real example.
// ---------------------------------------------------------------------------

// A Transporter ID: one capital letter, then 12 or 13 capital letters or digits
// (13 or 14 characters in all). Learned from the real associate export.
const ID_SHAPE = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{12,13}(?![A-Za-z0-9_])/g;

// A VIN: 17 capital letters and digits, never I, O or Q, with at least one of each.
const VIN_SHAPE = /(?<![A-Za-z0-9_])[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9_])/g;

const EMAIL_SHAPE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

// Ten digits in a row (optionally with +1 or 1 in front), or the usual 3-3-4 grouping.
const PHONE_BARE = /(?<![\w.])(?:\+1|1)?\d{10}(?!\w)/g;
const PHONE_GROUPED = /(?<![\w.])(?:\+?1[ .-])?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\w)/g;

// Made-up email domains that are safe to keep (reserved for examples and tests).
const SAFE_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|invalid|test|localhost|example)$/i;

// Made-up phone numbers: three digits, then 555-01 and two more digits. The 555-01xx block
// is set aside for fiction, so none of these ring a real phone.
const SAFE_PHONE_DIGITS = /^\d{3}55501\d{2}$/;

// A real North American number starts with 2-9 in both the area code and the next three
// digits. Ten-digit runs that don't are something else (like 0123456789).
const PHONE_SHAPE = /^[2-9]\d\d[2-9]\d{6}$/;

// Well-known ten-digit numbers that are not phone numbers (the biggest 32-bit numbers,
// which spreadsheets write into their files).
const NOT_A_PHONE = new Set([
  '4294967295',
  '4294967296',
  '2147483647',
  '2147483648',
  '9876543210',
  '3456789012',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.icns',
  '.webp',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.exe',
  '.dll',
  '.node',
  '.zip',
  '.gz',
  '.7z',
  '.mp3',
  '.mp4',
]);

// Files where long random-looking text and other people's contact details are normal
// (they are written by npm, not by us), so the ID, VIN and email checks skip them.
// Phone numbers, the station code and real names are still checked in these files.
const LOCKFILE_NAMES = new Set(['package-lock.json']);

// Ordinary long capital-letter words that happen to fit the Transporter ID shape.
const NOT_AN_ID = new Set(['AUTOINCREMENT']);

// ---------------------------------------------------------------------------
// Settings read from outside the code
// ---------------------------------------------------------------------------

function readLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function loadManifest(root = repoRoot) {
  const path = join(root, 'packages', 'fixtures', 'manifest.json');
  const empty = { ids: new Set(), vins: new Set(), found: false };
  if (!existsSync(path)) return empty;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return {
      ids: new Set((data.transporterIds ?? []).map((id) => String(id).toUpperCase())),
      vins: new Set((data.vins ?? []).map((vin) => String(vin).toUpperCase())),
      found: true,
    };
  } catch {
    return empty;
  }
}

export function loadSettings(root = repoRoot, env = process.env) {
  const notes = [];

  let privateWords = readLines(join(root, '.private', 'station.txt'));
  if (privateWords.length === 0 && env.LB_STATION_CODE) {
    privateWords = env.LB_STATION_CODE.split(/[,\n]/)
      .map((word) => word.trim())
      .filter(Boolean);
  }
  if (privateWords.length === 0) {
    notes.push(
      'Station code check skipped: there is no .private/station.txt and LB_STATION_CODE is not set.',
    );
  }

  const names = readLines(join(root, '.private', 'real-names.txt'));
  if (names.length === 0) {
    notes.push('Real-names check skipped: there is no .private/real-names.txt on this computer.');
  }

  const manifest = loadManifest(root);
  if (!manifest.found) {
    notes.push(
      'No packages/fixtures/manifest.json yet, so every ID-shaped or VIN-shaped token counts as real.',
    );
  }

  return { privateWords, names, manifest, notes };
}

// ---------------------------------------------------------------------------
// Scanning text
// ---------------------------------------------------------------------------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordPattern(word) {
  const parts = word.split(/\s+/).filter(Boolean).map(escapeRegExp);
  return `(?<![A-Za-z0-9])${parts.join('[\\s,_-]+')}(?![A-Za-z0-9])`;
}

function buildMatchers(settings) {
  const privateWords = settings.privateWords.length
    ? new RegExp(settings.privateWords.map(wordPattern).join('|'), 'gi')
    : null;
  const names = settings.names.length
    ? new RegExp(
        settings.names
          .map((name) => wordPattern(name).replace(/\[\\s,_-\]\+/g, '[\\s,]+'))
          .join('|'),
        'gi',
      )
    : null;
  return { privateWords, names };
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function* matches(regex, text) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    yield match;
    if (match[0].length === 0) regex.lastIndex++;
  }
}

/**
 * Looks through one piece of text. Returns a list of findings:
 * { kind, line, size } where `size` is how long the thing was (never the thing itself).
 */
export function scanText(text, settings, options = {}) {
  const matchers = options.matchers ?? buildMatchers(settings);
  const findings = [];
  const add = (kind, index, length) =>
    findings.push({ kind, line: lineAt(text, index), size: length });

  if (!options.onlyPrivate) {
    if (!options.lockfile) {
      for (const m of matches(EMAIL_SHAPE, text)) {
        if (!SAFE_EMAIL_DOMAIN.test(m[1])) add('an email address', m.index, m[0].length);
      }
    }

    for (const regex of [PHONE_BARE, PHONE_GROUPED]) {
      for (const m of matches(regex, text)) {
        let digits = m[0].replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
        if (SAFE_PHONE_DIGITS.test(digits) || NOT_A_PHONE.has(digits) || !PHONE_SHAPE.test(digits))
          continue;
        add('a phone number', m.index, m[0].length);
      }
    }
  }

  if (matchers.privateWords) {
    for (const m of matches(matchers.privateWords, text))
      add('the station code or DSP name', m.index, m[0].length);
  }

  if (matchers.names) {
    for (const m of matches(matchers.names, text)) add('a real driver name', m.index, m[0].length);
  }

  if (!options.lockfile && !options.onlyPrivate) {
    for (const m of matches(ID_SHAPE, text)) {
      if (
        !settings.manifest.ids.has(m[0]) &&
        !settings.manifest.vins.has(m[0]) &&
        !NOT_AN_ID.has(m[0])
      ) {
        add(
          'something shaped like a Transporter ID that is not in the fixtures manifest',
          m.index,
          m[0].length,
        );
      }
    }
    for (const m of matches(VIN_SHAPE, text)) {
      if (/[0-9]/.test(m[0]) && /[A-Z]/.test(m[0]) && !settings.manifest.vins.has(m[0])) {
        add(
          'something shaped like a VIN that is not in the fixtures manifest',
          m.index,
          m[0].length,
        );
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Reading files (text, .xlsx and .db are all looked into)
// ---------------------------------------------------------------------------

/** Minimal .zip reader (enough for .xlsx): returns [{ name, data }]. */
export function readZip(buffer) {
  const entries = [];
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return entries;
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + extraLength + commentLength;

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    try {
      entries.push({
        name,
        data: method === 0 ? raw : method === 8 ? inflateRawSync(raw) : Buffer.alloc(0),
      });
    } catch {
      entries.push({ name, data: Buffer.alloc(0) });
    }
  }
  return entries;
}

const TEXT_PART = /\.(xml|rels|txt|csv|json|vml|bin)$/i;

/**
 * Every text value in a SQLite database, one per line. Returns null when the database
 * cannot be opened (the raw-bytes look still happens).
 */
function dumpDatabase(buffer) {
  let folder;
  try {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    folder = mkdtempSync(join(tmpdir(), 'privacy-scan-'));
    const file = join(folder, 'copy.db');
    writeFileSync(file, buffer);
    const db = new DatabaseSync(file, { readOnly: true });
    const lines = [];
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    for (const { name } of tables) {
      lines.push(`-- table ${name}`);
      for (const row of db.prepare(`SELECT * FROM "${name}"`).all()) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') lines.push(value.replace(/\r?\n/g, ' '));
        }
      }
    }
    db.close();
    return lines.join('\n');
  } catch {
    return null;
  } finally {
    if (folder) rmSync(folder, { recursive: true, force: true });
  }
}

/** Returns a list of { label, text } pieces for one file's bytes. */
export function textPieces(path, buffer) {
  const ext = extname(path).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return { pieces: [], skipped: 'binary file' };

  if (['.xlsx', '.xlsm', '.docx', '.pptx'].includes(ext)) {
    const pieces = readZip(buffer)
      .filter(
        (entry) =>
          TEXT_PART.test(entry.name) && entry.data.length > 0 && !entry.name.endsWith('.bin'),
      )
      .map((entry) => ({ label: entry.name, text: entry.data.toString('utf8') }));
    return { pieces };
  }

  if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
    // Two looks: every value read out of the database one per line (exact), and the raw bytes
    // (catches text left in unused space). In the raw bytes neighbouring values run together,
    // so only the station code and real names are looked for there.
    const pieces = [{ label: 'database file', text: buffer.toString('latin1'), onlyPrivate: true }];
    const dump = dumpDatabase(buffer);
    if (dump !== null) pieces.unshift({ label: 'database', text: dump });
    else pieces[0] = { label: 'database file', text: pieces[0].text };
    return { pieces };
  }

  if (buffer.subarray(0, 8000).includes(0)) return { pieces: [], skipped: 'binary file' };
  return { pieces: [{ label: '', text: buffer.toString('utf8') }] };
}

export function scanFile(path, buffer, settings, options = {}) {
  const { pieces, skipped } = textPieces(path, buffer);
  const baseName = path.split(/[\\/]/).pop();
  const lockfile = LOCKFILE_NAMES.has(baseName);
  const matchers = options.matchers ?? buildMatchers(settings);
  const findings = [];

  // The file's own name and folder can hold the station code too.
  if (matchers.privateWords && [...matches(matchers.privateWords, path)].length > 0) {
    findings.push({
      kind: 'the station code or DSP name',
      line: 0,
      size: 0,
      where: 'in the file name',
    });
  }
  if (matchers.names && [...matches(matchers.names, path)].length > 0) {
    findings.push({ kind: 'a real driver name', line: 0, size: 0, where: 'in the file name' });
  }

  for (const piece of pieces) {
    const onlyPrivate = piece.onlyPrivate === true;
    for (const finding of scanText(piece.text, settings, { matchers, lockfile, onlyPrivate })) {
      findings.push({ ...finding, where: piece.label ? `inside ${piece.label}` : '' });
    }
  }
  return { findings, skipped };
}

// ---------------------------------------------------------------------------
// Choosing which files to look at
// ---------------------------------------------------------------------------

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024, ...options });
}

function listTracked() {
  const out = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

function listStaged() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

function expandPaths(args) {
  const files = [];
  for (const arg of args) {
    const full = resolve(arg);
    if (!existsSync(full)) {
      console.error(`Cannot find ${arg}`);
      process.exit(2);
    }
    if (statSync(full).isDirectory())
      files.push(...walk(full).map((file) => relative(repoRoot, file)));
    else files.push(relative(repoRoot, full));
  }
  return files;
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/privacy-scan.mjs [--staged | path…]');
    return 0;
  }

  const staged = argv.includes('--staged');
  const paths = argv.filter((arg) => !arg.startsWith('--'));
  const settings = loadSettings();
  const matchers = buildMatchers(settings);

  let files;
  let readFrom;
  if (staged) {
    files = listStaged();
    readFrom = (file) => git(['show', `:${file}`]);
  } else if (paths.length) {
    files = expandPaths(paths);
    readFrom = (file) => readFileSync(join(repoRoot, file));
  } else {
    files = listTracked();
    readFrom = (file) => readFileSync(join(repoRoot, file));
  }

  const problems = [];
  let scanned = 0;
  const skippedFiles = [];
  for (const file of files) {
    const normalised = file.split('\\').join('/');
    let buffer;
    try {
      buffer = readFrom(file);
    } catch {
      continue; // deleted or unreadable: nothing to check
    }
    const { findings, skipped } = scanFile(normalised, buffer, settings, { matchers });
    if (skipped) skippedFiles.push(normalised);
    else scanned++;
    for (const finding of findings) problems.push({ file: normalised, ...finding });
  }

  for (const note of settings.notes) console.log(`Note: ${note}`);

  if (problems.length === 0) {
    console.log(`Privacy scan passed. Looked through ${scanned} file${scanned === 1 ? '' : 's'}.`);
    return 0;
  }

  console.error('');
  console.error('PRIVACY SCAN FAILED');
  console.error('Something that looks like real driver or station data is in these files.');
  console.error('(The values are left out of this report on purpose.)');
  console.error('');
  const byFile = new Map();
  for (const problem of problems) {
    if (!byFile.has(problem.file)) byFile.set(problem.file, []);
    byFile.get(problem.file).push(problem);
  }
  for (const [file, list] of byFile) {
    console.error(`  ${file}`);
    for (const p of list.slice(0, 10)) {
      const place = p.where ? ` ${p.where}` : '';
      const line = p.line ? `, line ${p.line}` : '';
      console.error(`    - found ${p.kind}${place}${line}`);
    }
    if (list.length > 10) console.error(`    - and ${list.length - 10} more in this file`);
  }
  console.error('');
  console.error(
    `${problems.length} problem${problems.length === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}.`,
  );
  console.error(
    'Take the real data out, or use made-up values from packages/fixtures/manifest.json.',
  );
  console.error('Do not change the scan to get past this.');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
