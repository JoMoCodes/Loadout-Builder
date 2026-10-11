// Makes the made-up "Weekly Performance" test files in performance/ from real exports.
//
//   node packages/fixtures/anonymise-performance.mjs      (or: npm run fixtures:performance)
//
// It reads the real weekly exports from the paths listed in .private/sources-performance.json
// (a file that stays on this computer and is ignored by git) and writes anonymised copies here,
// then adds them to manifest.json without touching the entries that are already there.
//
// What changes: every driver name, Transporter ID, VIN, email and phone number is swapped for
// a made-up one; the station code becomes XXX1 (in file names too); the DSP name becomes
// generic; tracking numbers, event, stop and delivery-group IDs become made-up values of the
// same shape; video links point at example.com; free-text notes become one generic sentence.
//
// What stays: dates, weeks, scores, tiers, counts, reason codes and every other column.
//
// The POD reports are PDFs. The real PDFs are never copied. Instead, another script reads them
// and writes .private/pod-rows.json (who was on which page, with their 13 numbers), and this
// script draws brand-new PDFs from those rows with made-up names and IDs.
//
// The script never writes anything real inside the repo, and prints counts only, never names.
// Its made-up values come from a private seed in .private/seed-performance.txt (made on first
// run), so running it again on this computer gives the same made-up values.

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  showText,
} from 'pdf-lib';
import { formsOf } from '../../scripts/make-real-names.mjs';
import { loadSettings, scanFile } from '../../scripts/privacy-scan.mjs';
import {
  FAKE_DSP_CODE,
  FAKE_DSP_NAME,
  FAKE_STATION,
  ROLE_BY_HEADER,
  Registry,
  collectValue,
  isRunDirectly,
  leakCheck,
  normaliseHeader,
  reportStop,
  summariseCsv,
} from './anonymise.mjs';
import { makeRandom, pick } from './fake-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const privateDir = join(repoRoot, '.private');
const outRoot = join(here, 'performance');

const NOTE_TEXT = 'Made-up note for testing.';
const BOM = String.fromCharCode(0xfeff); // the byte-order mark some exports start with
const stripBom = (text) => (text.startsWith(BOM) ? text.slice(1) : text);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

// One capital letter then 12 or 13 capitals or digits: what the privacy scan treats as an ID.
const ID_SHAPE = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{12,13}(?![A-Za-z0-9_])/g;

// The kinds of weekly CSV export, the key that names their folder in sources-performance.json,
// and the folder they are written to under performance/.
const CSV_KINDS = [
  { kind: 'roster', source: 'roster', folder: 'roster', single: true },
  { kind: 'thresholds', source: 'thresholds', folder: 'thresholds', single: true },
  { kind: 'scorecards', source: 'scorecardsFolder', folder: 'scorecards' },
  { kind: 'cdf', source: 'cdfFolder', folder: 'cdf' },
  { kind: 'dsb', source: 'dsbFolder', folder: 'dsb' },
  { kind: 'psb', source: 'psbFolder', folder: 'psb' },
  { kind: 'dcr', source: 'dcrFolder', folder: 'dcr' },
  { kind: 'dcr-totals', source: 'dcrTotalsFolder', folder: 'dcr-totals' },
  { kind: 'safety', source: 'safetyFolder', folder: 'safety' },
];
const POD_FOLDER = 'pod';
const ALL_FOLDERS = [...CSV_KINDS.map((k) => k.folder), POD_FOLDER];

// Columns these exports have that the main anonymiser does not know about.
//   shape: a made-up value of the same shape (tracking numbers, event, stop and group IDs)
//   video: a link at example.com
//   note:  one generic sentence when there is anything in the cell
//   dsp:   the DSP's name or code, learned from the file and swapped for the generic one
const EXTRA_ROLES = {
  deliveryassociatename: 'name',
  trackingid: 'shape',
  eventid: 'shape',
  stopid: 'shape',
  deliverygroupid: 'shape',
  videolink: 'video',
  feedbackdetails: 'note',
  additionalinformation: 'note',
  reviewdetails: 'note',
  dsp: 'dsp',
};

// ---------------------------------------------------------------------------
// Reading the settings
// ---------------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(stripBom(readFileSync(path, 'utf8')));
}

function loadSources() {
  const file = join(privateDir, 'sources-performance.json');
  if (!existsSync(file)) {
    console.error(
      'Missing .private/sources-performance.json. It lists the real weekly exports to read.',
    );
    process.exit(2);
  }
  const sources = readJson(file);
  if (!sources.stationCode) {
    console.error('sources-performance.json needs a stationCode.');
    process.exit(2);
  }
  const paths = [
    ...CSV_KINDS.map((k) => sources[k.source]),
    sources.podFolder,
    sources.oldDatabase,
  ].filter(Boolean);
  const repoReal = realpathSync(repoRoot).toLowerCase();
  for (const path of paths) {
    if (!existsSync(path)) {
      console.error('A source path in .private/sources-performance.json does not exist.');
      process.exit(2);
    }
    if (realpathSync(path).toLowerCase().startsWith(repoReal)) {
      console.error('A source path is inside this repo. Real exports must stay outside it.');
      process.exit(2);
    }
  }
  for (const { source, single } of CSV_KINDS) {
    const path = sources[source];
    if (!path) {
      console.error(`sources-performance.json is missing "${source}".`);
      process.exit(2);
    }
    if (statSync(path).isDirectory() === Boolean(single)) {
      console.error(`"${source}" should be ${single ? 'one file' : 'a folder'}.`);
      process.exit(2);
    }
  }
  sources.weeks = Number(sources.weeks) || 10;
  return sources;
}

function loadSeed() {
  const file = join(privateDir, 'seed-performance.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const seed = randomBytes(24).toString('hex');
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(file, `${seed}\n`);
  return seed;
}

const ADDITIONS_KEY = 'performance';

/**
 * The manifest, with what an earlier run of this script added taken back out (the lists under
 * manifest.performance), so a rerun replaces those values instead of adding to them.
 */
function loadManifest() {
  const file = join(here, 'manifest.json');
  const manifest = existsSync(file) ? readJson(file) : {};
  const previous = manifest[ADDITIONS_KEY] ?? {};
  const without = (list, gone) => {
    const drop = new Set((gone ?? []).map((v) => String(v).toLowerCase()));
    return (list ?? []).filter((v) => !drop.has(String(v).toLowerCase()));
  };
  const peopleGone = new Set(
    (previous.people ?? []).map((p) => `${p.first}|${p.last}`.toLowerCase()),
  );
  return {
    ...manifest,
    files: (manifest.files ?? []).filter((f) => !String(f.kind).startsWith('performance-')),
    people: (manifest.people ?? []).filter(
      (p) => !peopleGone.has(`${p.first}|${p.last}`.toLowerCase()),
    ),
    names: without(manifest.names, previous.names),
    transporterIds: without(manifest.transporterIds, previous.transporterIds),
    vins: without(manifest.vins, previous.vins),
  };
}

// ---------------------------------------------------------------------------
// Which weeks and which files
// ---------------------------------------------------------------------------

const WEEK_CODE = /(\d{4})-W(\d{2})/;

/** The newest `count` week codes (like 2026-W14) found in the scorecard file names. */
function selectWeeks(scorecardsFolder, count) {
  const codes = new Set();
  for (const name of readdirSync(scorecardsFolder)) {
    const match = name.match(WEEK_CODE);
    if (match && /\.csv$/i.test(name)) codes.add(match[0]);
  }
  return [...codes].sort().slice(-count);
}

/** The POD file names carry the week as WeekNN-YYYY (NN without a leading zero below 10). */
function podWeekPattern(code) {
  const [, year, week] = code.match(WEEK_CODE);
  return new RegExp(`Week0?${Number(week)}-${year}(?!\\d)`, 'i');
}

/** Drops "name (1).csv" style duplicates, keeping the plain name when there is one. */
function onePerName(names) {
  const byKey = new Map();
  for (const name of [...names].sort((a, b) => a.length - b.length || a.localeCompare(b))) {
    const key = name.replace(/ \(\d+\)(\.[a-z0-9]+)$/i, '$1').toLowerCase();
    if (!byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort();
}

/**
 * The CSV files of one kind for the chosen weeks. A kind with no file in those weeks (an
 * export that stopped earlier, say) falls back to its newest `weeks.length` weeks instead, and
 * says so through `fellBack`.
 */
function csvFilesForWeeks(folder, weeks) {
  const all = readdirSync(folder).filter((name) => /\.csv$/i.test(name) && WEEK_CODE.test(name));
  let names = all.filter((name) => weeks.some((code) => name.includes(code)));
  let fellBack = false;
  if (names.length === 0 && all.length > 0) {
    const newest = [...new Set(all.map((name) => name.match(WEEK_CODE)[0]))]
      .sort()
      .slice(-weeks.length);
    names = all.filter((name) => newest.some((code) => name.includes(code)));
    fellBack = true;
  }
  return { paths: onePerName(names).map((name) => join(folder, name)), fellBack };
}

// ---------------------------------------------------------------------------
// The table of real -> made-up values, with the extra columns these files have
// ---------------------------------------------------------------------------

class PerformanceRegistry extends Registry {
  constructor(seed, sources, manifest) {
    super(seed, sources);
    // Nothing new may collide with a made-up value the other fixtures already use.
    for (const id of manifest.transporterIds ?? []) this.usedFakeIds.add(String(id).toUpperCase());
    for (const vin of manifest.vins ?? []) this.usedFakeVins.add(String(vin).toUpperCase());
    this.shapes = new Map(); // real -> made-up value of the same shape
    this.videos = new Map(); // real link -> example.com link
    this.dspNames = new Set(); // real DSP names seen in the files
    this.extra = null;
  }

  addShape(raw) {
    const value = String(raw ?? '').trim();
    if (value && !this.shapes.has(value)) this.shapes.set(value, null);
  }

  addVideo(raw) {
    const value = String(raw ?? '').trim();
    if (value && !this.videos.has(value)) this.videos.set(value, null);
  }

  addDspName(raw) {
    const value = String(raw ?? '').trim();
    if (value && value.length >= 2) this.dspNames.add(value);
  }

  /**
   * Same shape, different characters. Known IDs and the station code inside it are swapped.
   * `taken` holds the values the result may not equal (it is added to).
   */
  fakeShapeFor(real, taken) {
    const random = makeRandom(this.seed, `shape|${real}`);
    const station = String(this.sources.stationCode ?? '').toUpperCase();
    for (let attempt = 0; attempt < 100; attempt++) {
      const out = real.replace(/[A-Za-z0-9]+/g, (token) => {
        const upper = token.toUpperCase();
        if (this.ids.has(upper)) return this.ids.get(upper);
        if (station && upper === station) return FAKE_STATION;
        if (/^\d{1,4}$/.test(token)) return token; // pieces of a date or a time
        const prefix = token.match(/^[A-Za-z]+(?=\d)/)?.[0] ?? '';
        let made = prefix;
        for (const ch of token.slice(prefix.length)) {
          if (/[A-Z]/.test(ch)) made += pick(random, LETTERS);
          else if (/[a-z]/.test(ch)) made += pick(random, LETTERS).toLowerCase();
          else made += pick(random, DIGITS);
        }
        // A run of ten digits could look like a phone number; a leading 0 never does.
        if (/^\d{10,11}$/.test(made)) made = `0${made.slice(1)}`;
        return made;
      });
      if (out !== real && !taken.has(out)) {
        taken.add(out);
        return out;
      }
    }
    throw new Error('Could not make a unique same-shape value.');
  }

  finalise() {
    super.finalise();
    const taken = new Set(this.shapes.keys());
    for (const real of [...this.shapes.keys()].sort()) {
      const fake = this.fakeShapeFor(real, taken);
      this.shapes.set(real, fake);
      this.noteIdShaped(fake);
    }
    let n = 0;
    for (const real of [...this.videos.keys()].sort()) {
      n++;
      this.videos.set(real, `https://example.com/video/${String(n).padStart(6, '0')}`);
    }
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryAlternation = (values, flags = 'g') => {
      const list = [...values];
      if (list.length === 0) return null;
      return new RegExp(`(?<![A-Za-z0-9])(?:${list.map(escape).join('|')})(?![A-Za-z0-9])`, flags);
    };
    // A short all-caps DSP value is a code (like the one in the POD file names) and becomes
    // the generic code; anything longer is a name and becomes the generic name.
    const isCodeLike = (value) => /^[A-Z0-9]{2,6}$/.test(value);
    this.extra = {
      shapes: boundaryAlternation(this.shapes.keys()),
      videos: this.videos.size
        ? new RegExp([...this.videos.keys()].map(escape).join('|'), 'g')
        : null,
      dspNames: boundaryAlternation(
        [...this.dspNames].filter((v) => !isCodeLike(v)),
        'gi',
      ),
      dspCodes: boundaryAlternation([...this.dspNames].filter(isCodeLike), 'gi'),
    };
  }

  /** Every made-up token that looks like a Transporter ID must be listed in the manifest. */
  noteIdShaped(text) {
    for (const match of text.matchAll(ID_SHAPE)) this.usedFakeIds.add(match[0]);
  }

  /** The main clean-up, then the extras: same-shape IDs, links and the DSP name. */
  scrub(text, options) {
    let out = super.scrub(text, options);
    if (typeof out !== 'string' || out === '' || !this.extra) return out;
    if (this.extra.shapes) out = out.replace(this.extra.shapes, (m) => this.shapes.get(m) ?? m);
    if (this.extra.videos) out = out.replace(this.extra.videos, (m) => this.videos.get(m) ?? m);
    if (this.extra.dspNames) out = out.replace(this.extra.dspNames, FAKE_DSP_NAME);
    if (this.extra.dspCodes) out = out.replace(this.extra.dspCodes, FAKE_DSP_CODE);
    return out;
  }

  /** Last resort: an ID-shaped token nothing else caught becomes a made-up one and is listed. */
  scrubIdShaped(text) {
    return text.replace(ID_SHAPE, (m) => {
      if (this.usedFakeIds.has(m)) return m;
      if (this.ids.has(m)) return this.ids.get(m);
      const fake = this.fakeShapeFor(m, new Set([...this.usedFakeIds, ...this.ids.keys()]));
      this.ids.set(m, fake);
      this.usedFakeIds.add(fake);
      return fake;
    });
  }
}

// ---------------------------------------------------------------------------
// Working out which columns hold what
// ---------------------------------------------------------------------------

/**
 * "Delivery Associate" holds the Transporter ID in files that have no Transporter ID column
 * (CDF and DSB), and the name in files that do (scorecards, DCR, DCR totals, Safety, PSB).
 */
function rolesForFields(fields) {
  const hasTransporterId = fields.some((f) => normaliseHeader(f) === 'transporterid');
  const roles = new Map();
  for (const field of fields) {
    const key = normaliseHeader(field);
    let role = ROLE_BY_HEADER[key] ?? EXTRA_ROLES[key];
    if (key === 'deliveryassociate') role = hasTransporterId ? 'name' : 'id';
    if (role) roles.set(field, role);
  }
  return roles;
}

function parseCsv(path) {
  const raw = readFileSync(path, 'utf8');
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  const text = hasBom ? raw.slice(1) : raw;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { hasBom, newline, fields: parsed.meta.fields ?? [], rows: parsed.data };
}

function collectFromPerformanceCsv(registry, path) {
  const { fields, rows } = parseCsv(path);
  const roles = rolesForFields(fields);
  for (const row of rows) {
    for (const [field, role] of roles) {
      const value = row[field];
      if (value === null || value === undefined || value === '') continue;
      if (role === 'shape') registry.addShape(value);
      else if (role === 'video') registry.addVideo(value);
      else if (role === 'dsp') registry.addDspName(value);
      else if (role !== 'note') collectValue(registry, role, value);
    }
  }
}

// ---------------------------------------------------------------------------
// Writing the made-up copies
// ---------------------------------------------------------------------------

function copyPerformanceCsv(registry, sourcePath, outPath) {
  const { hasBom, newline, fields, rows } = parseCsv(sourcePath);
  const roles = rolesForFields(fields);
  const data = rows.map((row) =>
    fields.map((field) => {
      let value = String(row[field] ?? '');
      const role = roles.get(field);
      if (value !== '') {
        if (role === 'shape') value = registry.shapes.get(value.trim()) ?? value;
        else if (role === 'video') value = registry.videos.get(value.trim()) ?? value;
        else if (role === 'note' && value.trim() !== '') value = NOTE_TEXT;
      }
      return registry.scrubIdShaped(registry.scrub(value, { generic: true }));
    }),
  );
  const body = Papa.unparse({ fields: fields.map((f) => registry.scrub(f)), data }, { newline });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, (hasBom ? BOM : '') + body + newline);
  return { rows: rows.length, fields };
}

function outName(registry, sourceName) {
  return registry.scrub(sourceName).replace(/ \(\d+\)(\.[a-z0-9]+)$/i, '$1');
}

/**
 * A brand-new POD report: letter landscape, a title on page 1, then one row per entry from
 * page 2 on, 40 rows a page, 12pt apart, every word drawn on its own so a text extractor sees
 * separate words on one baseline (the old app's reader groups words by their Y position).
 */
export async function writePodPdf(outPath, title, rows) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('Loadout Builder fixtures');
  doc.setCreator('Loadout Builder fixtures');
  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
  doc.setModificationDate(new Date(Date.UTC(2026, 0, 1)));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const width = 792;
  const height = 612;
  const top = height - 48;
  const pitch = 12;
  const perPage = 40;
  const size = 8;

  // The font is registered under a fixed name on each page and the text is drawn with plain
  // operators. (drawText would invent a random resource name per call, and those digit runs
  // look like phone numbers to the privacy scan.)
  const fontKey = PDFName.of('F1');
  const newPage = () => {
    const page = doc.addPage([width, height]);
    page.node.setFontDictionary(fontKey, font.ref);
    return page;
  };
  const draw = (page, text, x, y, fontSize) =>
    page.pushOperators(
      beginText(),
      setFontAndSize(fontKey, fontSize),
      setTextMatrix(1, 0, 0, 1, x, y),
      showText(font.encodeText(text)),
      endText(),
    );

  draw(newPage(), title, 36, top, 12);

  let page = null;
  rows.forEach((row, index) => {
    if (index % perPage === 0) page = newPage();
    const y = top - (index % perPage) * pitch;
    let x = 36;
    const tokens = [
      ...String(row.name).split(/\s+/).filter(Boolean),
      String(row.transporterId),
      ...row.counts.map((n) => String(n)),
    ];
    for (const token of tokens) {
      draw(page, token, x, y, size);
      x += font.widthOfTextAtSize(token, size) + 10;
    }
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, await doc.save({ useObjectStreams: false }));
  return rows.length;
}

// ---------------------------------------------------------------------------
// Checking the result
// ---------------------------------------------------------------------------

/** Like the main leak check, for the extra kinds of real value these files hold. */
function extraLeakCheck(paths, groups) {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [];
  for (const [group, values] of Object.entries(groups)) {
    const list = [...values].map((v) => escape(String(v).toLowerCase()));
    for (let i = 0; i < list.length; i += 1000) {
      patterns.push([
        group,
        new RegExp(`(?<![a-z0-9])(?:${list.slice(i, i + 1000).join('|')})(?![a-z0-9])`),
      ]);
    }
  }
  let problems = 0;
  for (const path of paths) {
    const text = readFileSync(path, 'latin1')
      .toLowerCase()
      .replace(/[\s,]+/g, ' ');
    const hit = new Set();
    for (const [group, pattern] of patterns) if (pattern.test(text)) hit.add(group);
    for (const group of hit) {
      console.log(`  leak: ${group} in a ${basename(path).split('.').pop()} file`);
      problems++;
    }
  }
  return problems;
}

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

async function main() {
  const sources = loadSources();
  const seed = loadSeed();
  const manifest = loadManifest();
  const registry = new PerformanceRegistry(
    seed,
    { stationCode: sources.stationCode, dspCode: sources.dspCode, dspName: sources.dspName },
    manifest,
  );

  const weeks = selectWeeks(sources.scorecardsFolder, sources.weeks);
  if (weeks.length === 0) {
    console.error('No scorecard files with a week code (like 2026-W14) were found.');
    process.exit(2);
  }
  console.log(`Weeks chosen (${weeks.length}): ${weeks.join(' ')}`);

  // Which real files are read, per kind.
  const jobs = [];
  const fallbacks = [];
  for (const kind of CSV_KINDS) {
    const source = sources[kind.source];
    const selected = kind.single
      ? { paths: [source], fellBack: false }
      : csvFilesForWeeks(source, weeks);
    if (selected.fellBack) fallbacks.push(kind.kind);
    for (const path of selected.paths) jobs.push({ ...kind, path });
  }
  if (fallbacks.length) {
    console.log(
      `No file in those weeks for: ${fallbacks.join(', ')}. Took the newest ${weeks.length} weeks of each instead.`,
    );
  }

  // The POD rows, if the other script has written them yet.
  const podRowsPath = join(privateDir, 'pod-rows.json');
  let podFiles = null;
  if (existsSync(podRowsPath)) {
    const entries = readJson(podRowsPath);
    const byFile = new Map();
    for (const entry of entries) {
      const name = basename(String(entry.file ?? ''));
      if (!name || !weeks.some((code) => podWeekPattern(code).test(name))) continue;
      if (!byFile.has(name)) byFile.set(name, []);
      byFile.get(name).push(entry);
    }
    podFiles = onePerName(byFile.keys()).map((name) => ({ name, rows: byFile.get(name) }));
    console.log(`POD rows: ${entries.length} entries, ${podFiles.length} files in those weeks.`);
  } else {
    console.log(
      'POD skipped: .private/pod-rows.json is not there yet. Run this again once it has been written.',
    );
  }

  // Pass 1: learn every real value, without writing anything.
  for (const job of jobs) collectFromPerformanceCsv(registry, job.path);
  for (const file of podFiles ?? []) {
    for (const row of file.rows) {
      registry.addName(row.name);
      registry.addId(row.transporterId);
    }
  }
  registry.finalise();

  // Keep the local lists the privacy scan uses up to date with everything just learned.
  mkdirSync(privateDir, { recursive: true });
  const namesFile = join(privateDir, 'real-names.txt');
  const nameLines = new Set(
    existsSync(namesFile) ? readFileSync(namesFile, 'utf8').split(/\r?\n/).filter(Boolean) : [],
  );
  const namesBefore = nameLines.size;
  for (const tokens of registry.forms.values())
    for (const form of formsOf(tokens.join(' '))) nameLines.add(form);
  // Only written when there is something new to add, so a hand-kept list is left alone.
  if (nameLines.size > namesBefore)
    writeFileSync(namesFile, `${[...nameLines].sort().join('\n')}\n`);
  console.log(`Real-names list: ${nameLines.size - namesBefore} form(s) added.`);
  const stationFile = join(privateDir, 'station.txt');
  const stationLines = new Set(
    existsSync(stationFile) ? readFileSync(stationFile, 'utf8').split(/\r?\n/).filter(Boolean) : [],
  );
  for (const line of [sources.stationCode, sources.dspCode, sources.dspName, ...registry.dspNames])
    if (line) stationLines.add(line);
  writeFileSync(stationFile, `${[...stationLines].join('\n')}\n`);

  // Start clean so files from an earlier run cannot linger.
  for (const folder of ALL_FOLDERS) rmSync(join(outRoot, folder), { recursive: true, force: true });

  // Pass 2: write the made-up copies.
  const files = [];
  const checks = [];
  const perKind = new Map();
  const count = (kind, rows) => {
    const c = perKind.get(kind) ?? { files: 0, rows: 0 };
    c.files++;
    c.rows += rows;
    perKind.set(kind, c);
  };
  for (const job of jobs) {
    const name = outName(registry, basename(job.path));
    const rel = `performance/${job.folder}/${name}`;
    const outPath = join(here, rel);
    const { rows, fields } = copyPerformanceCsv(registry, job.path, outPath);
    const real = summariseCsv(job.path);
    const fake = parseCsv(outPath);
    checks.push({
      name: rel,
      ok: real.rows === rows && fake.rows.length === rows && sameList(fake.fields, fields),
      rows,
    });
    files.push({
      path: rel,
      kind: `performance-${job.kind}`,
      how: 'anonymised copy of a real export',
    });
    count(job.kind, rows);
  }
  for (const file of podFiles ?? []) {
    const name = outName(registry, file.name);
    const rel = `performance/${POD_FOLDER}/${name}`;
    const weekMatch = name.match(/Week(\d{1,2})-(\d{4})/i);
    const title = weekMatch
      ? `${FAKE_STATION} Week ${weekMatch[1]} ${weekMatch[2]} DA POD Details (made up for testing)`
      : `${FAKE_STATION} DA POD Details (made up for testing)`;
    const rows = file.rows.map((row) => ({
      name: registry.scrub(String(row.name ?? '')),
      transporterId:
        registry.ids.get(String(row.transporterId ?? '').toUpperCase()) ??
        registry.scrubIdShaped(registry.scrub(String(row.transporterId ?? ''), { generic: true })),
      counts: (Array.isArray(row.counts) ? row.counts : []).map((n) => Number(n) || 0),
    }));
    const written = await writePodPdf(join(here, rel), title, rows);
    checks.push({ name: rel, ok: written === file.rows.length, rows: written });
    files.push({
      path: rel,
      kind: 'performance-pod',
      how: 'drawn from scratch with the row layout of a real report; no real PDF was copied',
    });
    count('pod', written);
  }

  // The manifest: the new files and values are merged in; everything else stays as it was.
  const peopleByKey = new Map();
  for (const p of manifest.people ?? []) peopleByKey.set(`${p.first}|${p.last}`.toLowerCase(), p);
  const addedPeople = [];
  for (const p of registry.people.values()) {
    const key = `${p.fakeFirst}|${p.fakeLast}`.toLowerCase();
    if (!peopleByKey.has(key)) {
      const person = { first: p.fakeFirst, last: p.fakeLast };
      peopleByKey.set(key, person);
      addedPeople.push(person);
    }
  }
  const byLastFirst = (a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`);
  const sortedUnion = (a, b) => [...new Set([...(a ?? []), ...b])].sort();
  const onlyNew = (base, values) => {
    const have = new Set((base ?? []).map((v) => String(v).toLowerCase()));
    return [...new Set(values)].filter((v) => !have.has(String(v).toLowerCase())).sort();
  };
  const additions = {
    about:
      'What the Weekly Performance script (anonymise-performance.mjs) added to the lists above. It uses this to replace its own values when it runs again.',
    people: addedPeople.sort(byLastFirst),
    names: onlyNew(manifest.names, registry.fakeNameForms),
    transporterIds: onlyNew(manifest.transporterIds, registry.usedFakeIds),
    vins: onlyNew(manifest.vins, registry.usedFakeVins),
  };
  const idsBefore = (manifest.transporterIds ?? []).length;
  const vinsBefore = (manifest.vins ?? []).length;
  const merged = {
    ...manifest,
    files: [...(manifest.files ?? []), ...files].sort((a, b) => a.path.localeCompare(b.path)),
    people: [...peopleByKey.values()].sort(byLastFirst),
    names: sortedUnion(manifest.names, registry.fakeNameForms),
    transporterIds: sortedUnion(manifest.transporterIds, registry.usedFakeIds),
    vins: sortedUnion(manifest.vins, registry.usedFakeVins),
    [ADDITIONS_KEY]: additions,
  };
  writeFileSync(join(here, 'manifest.json'), `${JSON.stringify(merged, null, 2)}\n`);

  // ---- checks (counts only) ----
  let failed = false;
  console.log('');
  console.log('Structure check (same header list and row count as the real file):');
  for (const kind of [...CSV_KINDS.map((k) => k.kind), 'pod']) {
    const mine = checks.filter((c) => c.name.startsWith(`performance/${kind}/`));
    if (mine.length === 0) continue;
    const bad = mine.filter((c) => !c.ok).length;
    if (bad) failed = true;
    const c = perKind.get(kind);
    console.log(
      `  ${bad ? 'DIFFERENT' : 'same'}  ${kind}: ${c.files} file(s), ${c.rows} row(s)${bad ? `, ${bad} file(s) differ` : ''}`,
    );
  }

  // No real value may remain in any output.
  const outputs = [...files.map((f) => join(here, f.path)), join(here, 'manifest.json')];
  const leaks =
    (await leakCheck(registry, outputs)) +
    extraLeakCheck(outputs, {
      'same-shape IDs': registry.shapes.keys(),
      'video links': registry.videos.keys(),
      'DSP names': registry.dspNames,
    });
  console.log(
    `Leak check: ${leaks === 0 ? 'no real value found in any output' : `${leaks} PROBLEM(S) FOUND`}`,
  );
  if (leaks) failed = true;

  // The same scan that guards commits, with the local lists just written.
  const settings = loadSettings();
  let scanProblems = 0;
  for (const file of files) {
    const result = scanFile(
      `packages/fixtures/${file.path}`,
      readFileSync(join(here, file.path)),
      settings,
    );
    scanProblems += result.findings.length;
  }
  const manifestScan = scanFile(
    'packages/fixtures/manifest.json',
    readFileSync(join(here, 'manifest.json')),
    settings,
  );
  scanProblems += manifestScan.findings.length;
  console.log(
    `Privacy scan over the new files: ${scanProblems === 0 ? 'passed' : `${scanProblems} PROBLEM(S)`}`,
  );
  if (scanProblems) failed = true;

  console.log('');
  console.log(
    `Added to the manifest: ${addedPeople.length} people, ${merged.transporterIds.length - idsBefore} Transporter IDs, ${merged.vins.length - vinsBefore} VINs. ${podFiles ? 'POD PDFs written.' : 'POD skipped.'}`,
  );
  if (failed) {
    console.error('Something did not check out. Do not commit these files.');
    process.exitCode = 1;
  }
}

if (isRunDirectly(import.meta.url)) main().catch(reportStop);
