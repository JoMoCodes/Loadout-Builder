// Makes the made-up test files in this folder from real exports.
//
//   node packages/fixtures/anonymise.mjs
//
// It reads the real exports and the old database from the paths listed in
// .private/sources.json (a file that stays on this computer and is ignored by git), and
// writes anonymised copies here, plus manifest.json.
//
// What changes: every driver name, Transporter ID, VIN, plate, email and phone number is
// swapped for a made-up one; the station code becomes XXX1; the DSP name and code become
// generic. The same real value always becomes the same made-up value, in every file and in
// the database, so the files still line up with each other.
//
// What stays: dates, wave times, service types, route codes, counts, qualifications, and
// every other column.
//
// The script never writes anything real inside the repo, and prints counts only, never names.
// The made-up values come from a private seed in .private/seed.txt (made on first run), so
// running it again on this computer gives the same made-up values.

import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { formsOf } from '../../scripts/make-real-names.mjs';
import { loadSettings, readZip, scanFile } from '../../scripts/privacy-scan.mjs';
import {
  FIRST_NAMES,
  LAST_NAMES,
  fakePlate,
  fakeTransporterId,
  fakeVin,
  makeRandom,
  pick,
} from './fake-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const privateDir = join(repoRoot, '.private');

const FAKE_STATION = 'XXX1';
const FAKE_DSP_CODE = 'XXXX';
const FAKE_DSP_NAME = 'Example Delivery Team LLC';
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Where each kind of file is written, relative to this folder.
const OUT = {
  loadout: 'loadout-sheets',
  associates: 'associates',
  tenure: 'tenure',
  routes: 'routes',
  itineraries: 'itineraries',
  schedules: 'schedules',
  dwp: 'dwp',
  vehicles: 'vehicles',
  v1: 'v1',
};

// ---------------------------------------------------------------------------
// Reading the settings
// ---------------------------------------------------------------------------

function loadSources() {
  const file = join(privateDir, 'sources.json');
  if (!existsSync(file)) {
    console.error('Missing .private/sources.json. It lists the real files to read (see docs).');
    process.exit(2);
  }
  const sources = JSON.parse(readFileSync(file, 'utf8'));
  const all = [
    ...(sources.loadoutSheets ?? []),
    sources.associates,
    ...(sources.tenure ?? []),
    ...(sources.routes ?? []),
    ...(sources.itineraries ?? []),
    ...(sources.schedules ?? []),
    ...(sources.dwp ?? []),
    sources.v1Database,
  ].filter(Boolean);
  const repoReal = realpathSync(repoRoot).toLowerCase();
  for (const path of all) {
    if (!existsSync(path)) {
      console.error(`A source file in .private/sources.json does not exist (${basename(path)}).`);
      process.exit(2);
    }
    if (realpathSync(path).toLowerCase().startsWith(repoReal)) {
      console.error('A source file is inside this repo. Real exports must stay outside it.');
      process.exit(2);
    }
  }
  return sources;
}

function loadSeed() {
  const file = join(privateDir, 'seed.txt');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const seed = randomBytes(24).toString('hex');
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(file, `${seed}\n`);
  return seed;
}

// ---------------------------------------------------------------------------
// The table of real -> made-up values
// ---------------------------------------------------------------------------

class Registry {
  constructor(seed, sources) {
    this.seed = seed;
    this.sources = sources;
    this.forms = new Map(); // lowercase token string -> real tokens
    this.people = new Map(); // "first|last" (lowercase) -> { first, last, fakeFirst, fakeLast }
    this.realPairs = new Set();
    this.ids = new Map(); // real (upper) -> fake
    this.vins = new Map();
    this.plates = new Map();
    this.emails = new Map();
    this.phones = new Map(); // last 10 digits -> fake 10 digits
    this.usedFakeIds = new Set();
    this.usedFakeVins = new Set();
    this.usedFakePlates = new Set();
    this.usedFakePhones = new Set();
    this.emailCount = 0;
    this.fakeNameForms = new Set();
    this.middleLetters = new Map();
    this.finalised = false;
    this.regexes = null;
  }

  // ----- collecting (before anything is written) -----

  static tokensOf(raw) {
    return String(raw ?? '')
      .replace(/\(.*?\)/g, ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
  }

  static splitSuffix(tokens) {
    if (tokens.length > 2 && SUFFIXES.has(tokens.at(-1).toLowerCase().replace('.', ''))) {
      return { core: tokens.slice(0, -1), suffix: tokens.at(-1) };
    }
    return { core: tokens, suffix: '' };
  }

  addName(raw) {
    for (const part of String(raw ?? '').split('|')) {
      const tokens = Registry.tokensOf(part);
      if (tokens.length < 2) continue;
      // Rows in a name column that are not people ("Total Rostered", "No Driver", ...).
      if (/^(total|no|missing|n\/a|unassigned|unknown|open|call)$/i.test(tokens[0])) continue;
      if (tokens.some((token) => /\d/.test(token))) continue;
      this.forms.set(tokens.join(' ').toLowerCase(), tokens);
      const { core } = Registry.splitSuffix(tokens);
      const key = `${core[0].toLowerCase()}|${core.at(-1).toLowerCase()}`;
      this.realPairs.add(key);
      if (!this.people.has(key)) this.people.set(key, { first: core[0], last: core.at(-1) });
    }
  }

  addId(raw) {
    for (const part of String(raw ?? '').split('|')) {
      const id = part.trim().toUpperCase();
      if (id.length >= 8 && !this.ids.has(id)) this.ids.set(id, null);
    }
  }

  addVin(raw) {
    const vin = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (vin.length === 17 && !this.vins.has(vin)) this.vins.set(vin, null);
  }

  addPlate(raw) {
    const plate = String(raw ?? '').trim();
    if (plate && !this.plates.has(plate)) this.plates.set(plate, null);
  }

  addEmail(raw) {
    const email = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (email.includes('@') && !this.emails.has(email)) this.emails.set(email, null);
  }

  addPhone(raw) {
    const last10 = Registry.last10(raw);
    if (last10 && !this.phones.has(last10)) this.phones.set(last10, null);
  }

  static last10(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return digits.length === 10 ? digits : null;
  }

  // ----- deciding the made-up values (in a fixed order, so it is repeatable) -----

  finalise() {
    const pairSortedKeys = [...this.people.keys()].sort();
    const usedFakePairs = new Set();
    for (const key of pairSortedKeys) {
      const person = this.people.get(key);
      const random = makeRandom(this.seed, `person|${key}`);
      let first;
      let last;
      for (let attempt = 0; attempt < 2000; attempt++) {
        first = pick(random, FIRST_NAMES);
        last = pick(random, LAST_NAMES);
        const fakeKey = `${first.toLowerCase()}|${last.toLowerCase()}`;
        if (
          first.toLowerCase() !== person.first.toLowerCase() &&
          last.toLowerCase() !== person.last.toLowerCase() &&
          !this.realPairs.has(fakeKey) &&
          !usedFakePairs.has(fakeKey)
        ) {
          usedFakePairs.add(fakeKey);
          break;
        }
        first = undefined;
      }
      if (!first) throw new Error('Ran out of made-up names.');
      person.fakeFirst = first;
      person.fakeLast = last;
    }

    const realIds = new Set(this.ids.keys());
    for (const real of [...this.ids.keys()].sort()) {
      const fake = fakeTransporterId(
        makeRandom(this.seed, `id|${real}`),
        real,
        new Set([...this.usedFakeIds, ...realIds]),
      );
      this.ids.set(real, fake);
      this.usedFakeIds.add(fake);
    }
    const realVins = new Set(this.vins.keys());
    for (const real of [...this.vins.keys()].sort()) {
      const fake = fakeVin(
        makeRandom(this.seed, `vin|${real}`),
        real,
        new Set([...this.usedFakeVins, ...realVins]),
      );
      this.vins.set(real, fake);
      this.usedFakeVins.add(fake);
    }
    const realPlates = new Set(this.plates.keys());
    for (const real of [...this.plates.keys()].sort()) {
      const fake = fakePlate(
        makeRandom(this.seed, `plate|${real}`),
        real,
        new Set([...this.usedFakePlates, ...realPlates]),
      );
      this.plates.set(real, fake);
      this.usedFakePlates.add(fake);
    }
    let emailNumber = 0;
    for (const real of [...this.emails.keys()].sort()) {
      emailNumber++;
      this.emails.set(real, `driver${String(emailNumber).padStart(3, '0')}@example.com`);
    }
    for (const real of [...this.phones.keys()].sort()) {
      const random = makeRandom(this.seed, `phone|${real}`);
      let fake;
      do {
        const area = 200 + Math.floor(random() * 800);
        const line = String(Math.floor(random() * 100)).padStart(2, '0');
        fake = `${area}55501${line}`;
      } while (this.usedFakePhones.has(fake));
      this.usedFakePhones.add(fake);
      this.phones.set(real, fake);
    }
    this.finalised = true;
    this.buildRegexes();
  }

  // ----- replacing -----

  middleFor(token) {
    const lower = token.toLowerCase();
    if (this.middleLetters.has(lower)) return this.middleLetters.get(lower);
    const random = makeRandom(this.seed, `middle|${lower}`);
    let out;
    do {
      out =
        lower.length === 1
          ? String.fromCharCode(97 + Math.floor(random() * 26))
          : pick(random, FIRST_NAMES).toLowerCase();
    } while (out === lower);
    this.middleLetters.set(lower, out);
    return out;
  }

  static matchCase(real, fake) {
    if (real.length > 1 && real === real.toUpperCase() && real !== real.toLowerCase())
      return fake.toUpperCase();
    if (real === real.toLowerCase()) return fake.toLowerCase();
    return fake[0].toUpperCase() + fake.slice(1);
  }

  fakeNameFromMatch(matched) {
    const tokens = matched.split(/[\s,]+/).filter(Boolean);
    const separators = matched.match(/[\s,]+/g) ?? [];
    const { core, suffix } = Registry.splitSuffix(tokens);
    const key = `${core[0].toLowerCase()}|${core.at(-1).toLowerCase()}`;
    const person = this.people.get(key);
    const out = [];
    core.forEach((token, index) => {
      if (index === 0) out.push(Registry.matchCase(token, person.fakeFirst));
      else if (index === core.length - 1) out.push(Registry.matchCase(token, person.fakeLast));
      else out.push(Registry.matchCase(token, this.middleFor(token)));
    });
    if (suffix) out.push(suffix);
    let text = out[0];
    for (let i = 1; i < out.length; i++) text += (separators[i - 1] ?? ' ') + out[i];
    // Remember the form as written, with spaces tidied, for the manifest.
    this.fakeNameForms.add(out.join(' '));
    return text;
  }

  buildRegexes() {
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameForms = [...this.forms.values()].sort(
      (a, b) => b.length - a.length || b.join(' ').length - a.join(' ').length,
    );
    this.regexes = {
      names: nameForms.length
        ? new RegExp(
            `(?<![A-Za-z])(?:${nameForms.map((tokens) => tokens.map(escape).join('[\\s,]+')).join('|')})(?![A-Za-z])`,
            'gi',
          )
        : null,
      ids: this.ids.size
        ? new RegExp(
            `(?<![A-Za-z0-9])(?:${[...this.ids.keys()].map(escape).join('|')})(?![A-Za-z0-9])`,
            'gi',
          )
        : null,
      vins: this.vins.size
        ? new RegExp(
            `(?<![A-Za-z0-9])(?:${[...this.vins.keys()].map(escape).join('|')})(?![A-Za-z0-9])`,
            'gi',
          )
        : null,
      plates: this.plates.size
        ? new RegExp(
            `(?<![A-Za-z0-9])(?:${[...this.plates.keys()].map(escape).join('|')})(?![A-Za-z0-9])`,
            'g',
          )
        : null,
      emails: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
      phones: this.phones.size
        ? new RegExp(
            `(?<![\\w.])(?:\\+?1[ .-]?)?\\(?(?:${[...this.phones.keys()].map((p) => `${p.slice(0, 3)}\\)?[ .-]?${p.slice(3, 6)}[ .-]?${p.slice(6)}`).join('|')})(?!\\w)`,
            'g',
          )
        : null,
      station: this.sources.stationCode
        ? new RegExp(`(?<![A-Za-z0-9])${escape(this.sources.stationCode)}(?![A-Za-z0-9])`, 'gi')
        : null,
      dspCode: this.sources.dspCode
        ? new RegExp(`(?<![A-Za-z0-9])${escape(this.sources.dspCode)}(?![A-Za-z0-9])`, 'gi')
        : null,
      dspName: this.sources.dspName
        ? new RegExp(escape(this.sources.dspName).replace(/\\? /g, '\\s+'), 'gi')
        : null,
    };
  }

  fakeEmail(real) {
    const key = real.toLowerCase();
    if (!this.emails.has(key)) {
      // An email nobody collected: give it the next number.
      this.emails.set(key, `driver${String(this.emails.size + 1).padStart(3, '0')}@example.com`);
    }
    return this.emails.get(key);
  }

  fakePhoneText(real) {
    const last10 = Registry.last10(real);
    const fake = last10 ? this.phones.get(last10) : null;
    if (!fake) return real;
    const digits = String(real).replace(/\D/g, '');
    const fakeDigits = digits.length === 11 ? `1${fake}` : fake;
    let index = 0;
    return String(real).replace(/\d/g, () => fakeDigits[index++] ?? '0');
  }

  /** Swaps every known real value inside a piece of text for its made-up twin. */
  scrub(text, { generic = false } = {}) {
    if (typeof text !== 'string' || text === '') return text;
    const r = this.regexes;
    let out = text;
    if (r.names) out = out.replace(r.names, (m) => this.fakeNameFromMatch(m));
    if (r.ids) out = out.replace(r.ids, (m) => this.ids.get(m.toUpperCase()) ?? m);
    if (r.vins) out = out.replace(r.vins, (m) => this.vins.get(m.toUpperCase()) ?? m);
    if (r.plates) out = out.replace(r.plates, (m) => this.plates.get(m) ?? m);
    out = out.replace(r.emails, (m) => this.fakeEmail(m));
    if (r.phones) out = out.replace(r.phones, (m) => this.fakePhoneText(m));
    if (generic) {
      out = out.replace(/(?<![A-Za-z0-9_])A[A-Z0-9]{12,13}(?![A-Za-z0-9_])/g, (m) => {
        if (this.usedFakeIds.has(m)) return m; // already swapped a moment ago
        if (this.ids.has(m)) return this.ids.get(m);
        const fake = fakeTransporterId(
          makeRandom(this.seed, `id|${m}`),
          m,
          new Set([...this.usedFakeIds, ...this.ids.keys()]),
        );
        this.ids.set(m, fake);
        this.usedFakeIds.add(fake);
        return fake;
      });
    }
    if (r.station) out = out.replace(r.station, FAKE_STATION);
    if (r.dspName) out = out.replace(r.dspName, FAKE_DSP_NAME);
    if (r.dspCode) out = out.replace(r.dspCode, FAKE_DSP_CODE);
    return out;
  }

  /** The look of a file path in a record of where a file came from: nothing personal. */
  scrubPath(text) {
    if (typeof text !== 'string' || !text) return text;
    const name = this.scrub(text.split(/[\\/]/).pop());
    return `%USERPROFILE%\\Downloads\\${name}`;
  }
}

// ---------------------------------------------------------------------------
// Working out which columns hold what
// ---------------------------------------------------------------------------

const normaliseHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ROLE_BY_HEADER = {
  driver: 'name',
  drivername: 'name',
  names: 'name',
  nameandid: 'name',
  associatename: 'name',
  driverkey: 'name',
  shareddrivers: 'name',
  transporterid: 'id',
  trabsporterid: 'id',
  daid: 'id',
  sharedids: 'id',
  vin: 'vin',
  cortexvinnumber: 'vin',
  email: 'email',
  emailaddress: 'email',
  personalphonenumber: 'phone',
  workphonenumber: 'phone',
  phonenumber: 'phone',
  phone: 'phone',
  personalphone: 'phone',
  workphone: 'phone',
  licenseplatenumber: 'plate',
  plate: 'plate',
};

function collectValue(registry, role, value) {
  if (value === null || value === undefined || value === '') return;
  const text = typeof value === 'object' && value.text ? value.text : String(value);
  switch (role) {
    case 'name':
      registry.addName(text);
      break;
    case 'id':
      registry.addId(text);
      break;
    case 'vin':
      registry.addVin(text);
      break;
    case 'email':
      registry.addEmail(text);
      break;
    case 'phone':
      registry.addPhone(text);
      break;
    case 'plate':
      registry.addPlate(text);
      break;
    default:
      break;
  }
}

function plainValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (Array.isArray(value.richText)) return value.richText.map((run) => run.text).join('');
    if ('result' in value) return value.result;
    if ('text' in value) return value.text;
  }
  return value;
}

function collectFromWorksheet(registry, worksheet) {
  // The header row is the one near the top with the most columns we recognise.
  let headerRow = 0;
  let best = 0;
  for (let r = 1; r <= Math.min(worksheet.rowCount, 12); r++) {
    let hits = 0;
    worksheet.getRow(r).eachCell((cell) => {
      if (ROLE_BY_HEADER[normaliseHeader(plainValue(cell.value))]) hits++;
    });
    if (hits > best) {
      best = hits;
      headerRow = r;
    }
  }
  if (!headerRow) return;
  const roles = new Map();
  worksheet.getRow(headerRow).eachCell((cell, col) => {
    const role = ROLE_BY_HEADER[normaliseHeader(plainValue(cell.value))];
    if (role) roles.set(col, role);
  });
  for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    for (const [col, role] of roles)
      collectValue(registry, role, plainValue(row.getCell(col).value));
  }
}

function collectFromCsv(registry, text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const roles = new Map();
  for (const field of parsed.meta.fields ?? []) {
    const role = ROLE_BY_HEADER[normaliseHeader(field)];
    if (role) roles.set(field, role);
  }
  for (const row of parsed.data) {
    for (const [field, role] of roles) collectValue(registry, role, row[field]);
  }
}

// What each column of the old database holds. Columns not listed are copied as they are,
// apart from the clean-up that every piece of text gets.
const DB_ROLES = {
  associates: {
    name: 'name',
    transporter_id: 'id',
    personal_phone: 'phone',
    work_phone: 'phone',
    email: 'email',
  },
  associate_tenure: { transporter_id: 'id' },
  lifetime_routes: { transporter_id: 'id' },
  lmr_approved: { transporter_id: 'id' },
  driver_links: { driver_key: 'name', driver_name: 'name', transporter_id: 'id' },
  driver_rows: { driver: 'name', vin: 'vin' },
  previous_driver_rows: { driver: 'name', vin: 'vin' },
  route_entries: {
    transporter_id: 'id',
    driver_name: 'name',
    vin: 'vin',
    shared_drivers: 'name',
    shared_ids: 'id',
  },
  van_affinity: { vin: 'vin', transporter_id: 'id' },
  vehicle_overrides: { vin: 'vin' },
  vehicle_priorities: { vin: 'vin' },
  vehicles: { vin: 'vin', plate: 'plate' },
};

const DB_PATH_COLUMNS = new Set(['source_file']);

function tablesOf(db) {
  return db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
}

function collectFromDb(registry, db) {
  for (const table of tablesOf(db)) {
    const roles = DB_ROLES[table.name];
    if (!roles) continue;
    const rows = db.prepare(`SELECT * FROM "${table.name}"`).all();
    for (const row of rows) {
      for (const [column, role] of Object.entries(roles)) collectValue(registry, role, row[column]);
    }
  }
}

// ---------------------------------------------------------------------------
// Writing the made-up copies
// ---------------------------------------------------------------------------

function scrubName(registry, filename) {
  return registry.scrub(filename);
}

function scrubCellValue(registry, value) {
  if (typeof value === 'string') return registry.scrub(value);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value.richText)) {
    return { richText: value.richText.map((run) => ({ ...run, text: registry.scrub(run.text) })) };
  }
  if ('formula' in value || 'sharedFormula' in value) {
    const copy = { ...value };
    if (typeof copy.formula === 'string') copy.formula = registry.scrub(copy.formula);
    if (typeof copy.result === 'string') copy.result = registry.scrub(copy.result);
    return copy;
  }
  if ('hyperlink' in value) {
    return {
      ...value,
      text: typeof value.text === 'string' ? registry.scrub(value.text) : value.text,
      hyperlink: registry.scrub(value.hyperlink),
    };
  }
  return value;
}

function scrubWorkbookInPlace(registry, workbook) {
  workbook.creator = 'Loadout Builder fixtures';
  workbook.lastModifiedBy = 'Loadout Builder fixtures';
  workbook.company = '';
  workbook.manager = '';
  workbook.title = '';
  workbook.subject = '';
  workbook.keywords = '';
  workbook.category = '';
  workbook.description = '';
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = new Date(Date.UTC(2026, 0, 1));

  for (const worksheet of workbook.worksheets) {
    worksheet.name = registry.scrub(worksheet.name);
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.type === ExcelJS.ValueType.Merge) return;
        const before = cell.value;
        const after = scrubCellValue(registry, before);
        if (after !== before) cell.value = after;
      });
    });
    const hf = worksheet.headerFooter;
    if (hf) {
      for (const key of [
        'oddHeader',
        'oddFooter',
        'evenHeader',
        'evenFooter',
        'firstHeader',
        'firstFooter',
      ]) {
        if (typeof hf[key] === 'string') hf[key] = registry.scrub(hf[key]);
      }
    }
  }
}

async function copyWorkbook(registry, sourcePath, outPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  scrubWorkbookInPlace(registry, workbook);
  mkdirSync(dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);
}

function copyCsv(registry, sourcePath, outPath) {
  const raw = readFileSync(sourcePath, 'utf8');
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  const text = hasBom ? raw.slice(1) : raw;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const rows = parsed.data.map((row) => {
    const out = {};
    for (const field of fields) out[field] = registry.scrub(row[field] ?? '');
    return out;
  });
  const body = Papa.unparse(
    {
      fields: fields.map((f) => registry.scrub(f)),
      data: rows.map((row) => fields.map((f) => row[f])),
    },
    { newline },
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, (hasBom ? '\uFEFF' : '') + body + newline);
  return rows.length;
}

function copyDatabase(registry, sourceDb, outPath) {
  // A brand-new file is built from the schema and the cleaned rows. The old file is never
  // edited, so nothing real can be left behind in unused space.
  mkdirSync(dirname(outPath), { recursive: true });
  rmSync(outPath, { force: true });
  for (const suffix of ['-wal', '-shm', '-journal']) rmSync(outPath + suffix, { force: true });
  const out = new DatabaseSync(outPath);
  out.exec('PRAGMA journal_mode = DELETE');
  const counts = {};

  const schema = sourceDb
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  for (const item of schema.filter((s) => s.type === 'table')) out.exec(item.sql);

  for (const table of tablesOf(sourceDb)) {
    const columns = sourceDb
      .prepare(`PRAGMA table_info("${table.name}")`)
      .all()
      .map((c) => c.name);
    const rows = sourceDb.prepare(`SELECT * FROM "${table.name}"`).all();
    const roles = DB_ROLES[table.name] ?? {};
    const insert = out.prepare(
      `INSERT INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    );
    out.exec('BEGIN');
    for (const row of rows) {
      const values = columns.map((column) => {
        const value = row[column];
        if (typeof value !== 'string') return value;
        if (DB_PATH_COLUMNS.has(column)) return registry.scrubPath(value);
        if (roles[column] === 'phone') return registry.fakePhoneText(registry.scrub(value));
        return registry.scrub(value, { generic: table.name === 'print_layouts' });
      });
      insert.run(...values);
    }
    out.exec('COMMIT');
    counts[table.name] = rows.length;
  }

  for (const item of schema.filter((s) => s.type !== 'table')) out.exec(item.sql);
  const sequences = sourceDb
    .prepare("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'")
    .all();
  if (sequences.length) {
    out.exec('DELETE FROM sqlite_sequence');
    for (const row of sourceDb.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
      out.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(row.name, row.seq);
    }
  }
  const version = sourceDb.prepare('PRAGMA user_version').get();
  out.exec(`PRAGMA user_version = ${Number(version.user_version) || 0}`);
  out.exec('VACUUM');
  out.close();
  return counts;
}

async function writeVehicleExport(registry, sourceDb, outPath) {
  const rows = sourceDb.prepare('SELECT * FROM vehicles ORDER BY position, vin').all();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Loadout Builder fixtures';
  workbook.lastModifiedBy = 'Loadout Builder fixtures';
  workbook.created = new Date(Date.UTC(2026, 0, 1));
  workbook.modified = new Date(Date.UTC(2026, 0, 1));
  const sheet = workbook.addWorksheet('Vehicles');
  sheet.addRow([`Vehicle Report - ${FAKE_STATION} - made up for testing`]);
  sheet.addRow([]);
  const headers = [
    'vin',
    'vehicleName',
    'serviceType',
    'serviceTier',
    'make',
    'model',
    'subModel',
    'licensePlateNumber',
    'year',
    'ownershipType',
    'type',
    'operationalStatus',
    'status',
    'statusReasonMessage',
    'registrationExpiryDate',
    'ownershipEndDate',
    'stationCode',
  ];
  sheet.addRow(headers);
  const text = (value) =>
    value === null || value === undefined ? '' : registry.scrub(String(value));
  for (const row of rows) {
    sheet.addRow([
      text(row.vin),
      text(row.name),
      text(row.service_type),
      text(row.service_tier),
      text(row.make),
      text(row.model),
      text(row.sub_model),
      text(row.plate),
      /^\d+$/.test(String(row.year)) ? Number(row.year) : text(row.year),
      text(row.ownership),
      text(row.type_label),
      row.operational ? 'OPERATIONAL' : 'NOT_OPERATIONAL',
      text(row.status),
      text(row.status_note),
      text(row.registration_expiry),
      text(row.ownership_end),
      FAKE_STATION,
    ]);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Checking the result
// ---------------------------------------------------------------------------

async function summariseWorkbook(path) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook.worksheets.map((ws) => {
    const perColumn = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (plainValue(cell.value) !== '' && plainValue(cell.value) !== null)
          perColumn[col] = (perColumn[col] ?? 0) + 1;
      });
    });
    return {
      rows: ws.rowCount,
      columns: ws.columnCount,
      filled: perColumn.map((n) => n ?? 0).join(','),
    };
  });
}

function summariseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { rows: parsed.data.length, columns: (parsed.meta.fields ?? []).length };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

async function main() {
  const sources = loadSources();
  const seed = loadSeed();
  const registry = new Registry(seed, sources);
  mkdirSync(privateDir, { recursive: true });

  const tmp = join(tmpdir(), `loadout-fixtures-${process.pid}`);
  mkdirSync(tmp, { recursive: true });

  try {
    // The old database is copied first, and only the copy is ever opened.
    const dbCopyPath = join(tmp, 'v1-copy.db');
    copyFileSync(sources.v1Database, dbCopyPath);
    const sourceDb = new DatabaseSync(dbCopyPath);

    // Pass 1: learn every real value, without writing anything.
    const jobs = [
      ...(sources.loadoutSheets ?? []).map((p) => ({ kind: 'loadout', path: p })),
      { kind: 'associates', path: sources.associates },
      ...(sources.tenure ?? []).map((p) => ({ kind: 'tenure', path: p })),
      ...(sources.routes ?? []).map((p) => ({ kind: 'routes', path: p })),
      ...(sources.itineraries ?? []).map((p) => ({ kind: 'itineraries', path: p })),
      ...(sources.schedules ?? []).map((p) => ({ kind: 'schedules', path: p })),
      ...(sources.dwp ?? []).map((p) => ({ kind: 'dwp', path: p })),
    ];
    for (const job of jobs) {
      if (/\.csv$/i.test(job.path)) {
        collectFromCsv(registry, readFileSync(job.path, 'utf8').replace(/^\uFEFF/, ''));
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(job.path);
        for (const worksheet of workbook.worksheets) collectFromWorksheet(registry, worksheet);
      }
    }
    collectFromDb(registry, sourceDb);
    registry.finalise();

    // Keep the local lists the privacy scan uses up to date with everything just learned.
    const nameLines = new Set(
      existsSync(join(privateDir, 'real-names.txt'))
        ? readFileSync(join(privateDir, 'real-names.txt'), 'utf8').split(/\r?\n/).filter(Boolean)
        : [],
    );
    for (const tokens of registry.forms.values())
      for (const form of formsOf(tokens.join(' '))) nameLines.add(form);
    writeFileSync(join(privateDir, 'real-names.txt'), `${[...nameLines].sort().join('\n')}\n`);
    writeFileSync(
      join(privateDir, 'station.txt'),
      `${[sources.stationCode, sources.dspCode, sources.dspName].filter(Boolean).join('\n')}\n`,
    );

    // Start clean so files from an earlier run cannot linger.
    for (const folder of Object.values(OUT))
      rmSync(join(here, folder), { recursive: true, force: true });

    // Pass 2: write the made-up copies.
    const files = [];
    const checks = [];
    for (const job of jobs) {
      const outName = scrubName(registry, basename(job.path)).replace(/ \(\d+\)(\.[a-z]+)$/i, '$1');
      const outRel = `${OUT[job.kind]}/${outName}`;
      const outPath = join(here, OUT[job.kind], outName);
      if (/\.csv$/i.test(job.path)) {
        const rows = copyCsv(registry, job.path, outPath);
        checks.push({
          name: outRel,
          real: summariseCsv(job.path),
          fake: summariseCsv(outPath),
          rows,
        });
      } else {
        await copyWorkbook(registry, job.path, outPath);
        checks.push({
          name: outRel,
          real: await summariseWorkbook(job.path),
          fake: await summariseWorkbook(outPath),
        });
      }
      files.push({ path: outRel, kind: job.kind, how: 'anonymised copy of a real export' });
    }

    // The vehicle list: no real export exists, so it is built from the old database.
    const vehiclePath = join(here, OUT.vehicles, 'VehiclesData.xlsx');
    const vehicleCount = await writeVehicleExport(registry, sourceDb, vehiclePath);
    files.push({
      path: `${OUT.vehicles}/VehiclesData.xlsx`,
      kind: 'vehicles',
      how: 'synthesised from the vehicles table of the old database; no real vehicle export was used',
    });

    // The old database, rebuilt with made-up values.
    const v1Path = join(here, OUT.v1, 'loadout.db');
    const tableCounts = copyDatabase(registry, sourceDb, v1Path);
    files.push({
      path: `${OUT.v1}/loadout.db`,
      kind: 'v1-database',
      how: 'anonymised rebuild of a real old-version database',
    });
    const fakeDb = new DatabaseSync(v1Path, { readOnly: true });
    const dbMismatches = [];
    for (const table of tablesOf(sourceDb)) {
      const n = fakeDb.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).get().n;
      const m = sourceDb.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).get().n;
      if (n !== m) dbMismatches.push(table.name);
    }
    fakeDb.close();
    sourceDb.close();

    // The manifest: everything made up, and where each file came from.
    const people = [...registry.people.values()]
      .map((p) => ({ first: p.fakeFirst, last: p.fakeLast }))
      .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));
    const manifest = {
      about:
        'Everything in this folder is made up. Real names, IDs, VINs, plates, emails and phone numbers were swapped for the values listed here. Use names from this file in examples.',
      stationCode: FAKE_STATION,
      dspCode: FAKE_DSP_CODE,
      dspName: FAKE_DSP_NAME,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      people,
      names: [...registry.fakeNameForms].sort(),
      transporterIds: [...registry.usedFakeIds].sort(),
      vins: [...registry.usedFakeVins].sort(),
    };
    writeFileSync(join(here, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    // ---- checks (counts only) ----
    let failed = false;
    console.log('');
    console.log('Structure check (real file vs made-up copy):');
    for (const check of checks) {
      const ok = sameJson(check.real, check.fake);
      if (!ok) failed = true;
      const rows = Array.isArray(check.real)
        ? check.real.map((s) => s.rows).join('/')
        : check.real.rows;
      console.log(`  ${ok ? 'same' : 'DIFFERENT'}  ${check.name}  (rows: ${rows})`);
    }
    console.log(
      `  database: ${Object.keys(tableCounts).length} tables, ${dbMismatches.length === 0 ? 'row counts match' : `MISMATCH in ${dbMismatches.join(', ')}`}`,
    );
    if (dbMismatches.length) failed = true;
    console.log(`  vehicle list: ${vehicleCount} vans`);

    // No real value may remain in any output.
    const leaks = await leakCheck(registry, [
      ...files.map((f) => join(here, f.path)),
      join(here, 'manifest.json'),
    ]);
    console.log(
      `Leak check: ${leaks === 0 ? 'no real value found in any output' : `${leaks} PROBLEM(S) FOUND`}`,
    );
    if (leaks) failed = true;

    // The same scan that guards commits, with the local list of real names.
    const settings = loadSettings();
    let scanProblems = 0;
    for (const file of files) {
      const full = join(here, file.path);
      const result = scanFile(`packages/fixtures/${file.path}`, readFileSync(full), settings);
      scanProblems += result.findings.length;
    }
    console.log(
      `Privacy scan over the fixtures: ${scanProblems === 0 ? 'passed' : `${scanProblems} PROBLEM(S)`}`,
    );
    if (scanProblems) failed = true;

    console.log('');
    console.log(
      `Made-up people: ${people.length}. Transporter IDs: ${manifest.transporterIds.length}. VINs: ${manifest.vins.length}.`,
    );
    if (failed) {
      console.error('Something did not check out. Do not commit these files.');
      process.exitCode = 1;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function leakCheck(registry, paths) {
  const groups = {
    ids: [...registry.ids.keys()],
    vins: [...registry.vins.keys()],
    plates: [...registry.plates.keys()],
    emails: [...registry.emails.keys()],
    names: [...registry.forms.values()].map((tokens) => tokens.join(' ')),
    phones: [...registry.phones.keys()],
    station: [
      registry.sources.stationCode,
      registry.sources.dspName,
      registry.sources.dspCode,
    ].filter(Boolean),
  };
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = Object.entries(groups).map(([group, values]) => [
    group,
    values.length
      ? new RegExp(
          `(?<![a-z0-9])(?:${values.map((v) => escape(v.toLowerCase())).join('|')})(?![a-z0-9])`,
        )
      : null,
  ]);
  const counts = {};
  for (const path of paths) {
    const buffer = readFileSync(path);
    const texts = [];
    if (/\.xlsx$/i.test(path)) {
      for (const entry of readZip(buffer)) texts.push(entry.data.toString('utf8'));
    } else if (/\.db$/i.test(path)) {
      texts.push(buffer.toString('latin1'));
    } else {
      texts.push(buffer.toString('utf8'));
    }
    for (const text of texts.map((t) => t.toLowerCase().replace(/[\s,]+/g, ' '))) {
      for (const [group, pattern] of patterns) {
        // The made-up values are chosen never to equal a real one, so any whole-value hit is a leak.
        if (pattern && pattern.test(text)) {
          const key = `${group} in ${basename(path)}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }
  }
  for (const [key, n] of Object.entries(counts)) console.log(`  leak: ${key} (${n})`);
  return Object.keys(counts).length;
}

main().catch((error) => {
  // Error text can quote cell contents, so only the kind of failure is shown.
  console.error(
    `The anonymiser stopped: ${error?.name ?? 'Error'} (${String(error?.message ?? '')
      .slice(0, 80)
      .replace(/[A-Za-z0-9]{13,}/g, '…')})`,
  );
  process.exit(1);
});
