// Compares what the old app produced (scripts/parity/expected/) with what the new core produced
// (scripts/parity/actual/) and says, in plain terms, where they differ.
//
//   node scripts/parity/diff.mjs                 every day, every module
//   node scripts/parity/diff.mjs 2026-09-11      one day
//   node scripts/parity/diff.mjs 2026-09-11 vans one module of one day
//   node scripts/parity/diff.mjs --list          the days and modules there are
//
// Options:
//   --max N     show at most N differences per file (default 20)
//   --all       show every difference
//   --exact     numbers must be identical (otherwise they may differ by up to 0.000001)
//
// Exit code: 0 when everything matches, 1 when anything differs or is missing, 2 when it was
// asked something it cannot do (an unknown day or module, say).
//
// The summary lines hold counts only. The lines under a file name show the path into the JSON and
// the two values, so they can show a made-up fixture name; they are for the person running this.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const EXPECTED = join(here, 'expected');
export const ACTUAL = join(here, 'actual');

// Files at the top of expected/ (days.json) describe the days and are not compared: scan() only
// looks inside the day folders.
const TOLERANCE = 0.000001 + 1e-12;

/** The days and, under each, the modules found in a folder. */
export function scan(root) {
  const found = new Map();
  if (!existsSync(root)) return found;
  for (const day of readdirSync(root).sort()) {
    const folder = join(root, day);
    if (!statSync(folder).isDirectory()) continue;
    const modules = readdirSync(folder)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
    found.set(day, modules);
  }
  return found;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function describe(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return 'nothing';
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (isObject(value)) return 'an object';
  return typeof value;
}

/**
 * Every difference between two parsed JSON values, as { path, expected, actual, note }.
 * Paths read like rows[3].match.method. A key that is missing on one side has the value undefined.
 */
export function diffValues(expected, actual, options = {}, path = '', out = []) {
  const { exact = false } = options;
  if (typeof expected === 'number' && typeof actual === 'number') {
    const same = exact ? expected === actual : Math.abs(expected - actual) <= TOLERANCE;
    if (!same) out.push({ path, expected, actual });
    return out;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push({
        path: `${path}.length`,
        expected: expected.length,
        actual: actual.length,
        note: 'list length',
      });
    }
    const shared = Math.min(expected.length, actual.length);
    for (let i = 0; i < shared; i += 1)
      diffValues(expected[i], actual[i], options, `${path}[${i}]`, out);
    return out;
  }
  if (isObject(expected) && isObject(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      const child = path ? `${path}.${key}` : key;
      if (!(key in actual))
        out.push({ path: child, expected: expected[key], actual: undefined, note: 'missing' });
      else if (!(key in expected))
        out.push({ path: child, expected: undefined, actual: actual[key], note: 'extra' });
      else diffValues(expected[key], actual[key], options, child, out);
    }
    return out;
  }
  if (expected !== actual) {
    const note =
      typeName(expected) === typeName(actual)
        ? undefined
        : `${typeName(expected)} vs ${typeName(actual)}`;
    out.push({ path, expected, actual, note });
  }
  return out;
}

function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (error) {
    return { problem: error instanceof SyntaxError ? 'not valid JSON' : 'could not be read' };
  }
}

/** Compare one module file. Returns { status, differences, problem }. */
export function compareModule(
  day,
  module,
  options = {},
  roots = { expected: EXPECTED, actual: ACTUAL },
) {
  const expectedFile = join(roots.expected, day, `${module}.json`);
  const actualFile = join(roots.actual, day, `${module}.json`);
  if (!existsSync(actualFile)) return { status: 'missing', differences: [] };
  const expected = readJson(expectedFile);
  const actual = readJson(actualFile);
  if (expected.problem)
    return { status: 'broken', differences: [], problem: `expected file ${expected.problem}` };
  if (actual.problem)
    return { status: 'broken', differences: [], problem: `actual file ${actual.problem}` };
  const differences = diffValues(expected.value, actual.value, options);
  return { status: differences.length ? 'differs' : 'same', differences };
}

function parseArguments(argv) {
  const options = { max: 20, exact: false, list: false };
  const words = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--all') options.max = Infinity;
    else if (arg === '--exact') options.exact = true;
    else if (arg === '--max') {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 1)
        return { error: '--max needs a whole number, 1 or more' };
      options.max = value;
    } else if (arg.startsWith('--')) return { error: `Don't know the option ${arg}` };
    else words.push(arg);
  }
  if (words.length > 2) return { error: 'Give at most a day and a module' };
  return { options, day: words[0], module: words[1] };
}

function printList(expected, actual) {
  console.log('Days and modules in expected/ (the old app), with how many of them actual/ has:');
  for (const [day, modules] of expected) {
    const have = new Set(actual.get(day) ?? []);
    const present = modules.filter((m) => have.has(m)).length;
    console.log(`  ${day}: ${modules.length} modules, ${present} in actual/`);
    console.log(`    ${modules.join(', ')}`);
  }
  const extras = [...actual].filter(([day]) => !expected.has(day));
  if (extras.length)
    console.log(`actual/ also has ${extras.length} day(s) that expected/ does not.`);
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseArguments(argv);
  if (parsed.error) {
    console.error(parsed.error);
    console.error(
      'Usage: node scripts/parity/diff.mjs [--list] [--max N | --all] [--exact] [day] [module]',
    );
    return 2;
  }
  const { options, day: wantedDay, module: wantedModule } = parsed;

  const expected = scan(EXPECTED);
  const actual = scan(ACTUAL);
  if (options.list) {
    printList(expected, actual);
    return 0;
  }
  if (expected.size === 0) {
    console.error('There is nothing in scripts/parity/expected/. Run: npm run parity:python');
    return 2;
  }
  if (wantedDay && !expected.has(wantedDay)) {
    console.error(`No day called ${wantedDay}. The days are: ${[...expected.keys()].join(', ')}`);
    return 2;
  }
  if (
    wantedModule &&
    !(wantedDay ? expected.get(wantedDay) : [...expected.values()].flat()).includes(wantedModule)
  ) {
    console.error(`No module called ${wantedModule}.`);
    return 2;
  }

  const counts = { files: 0, same: 0, differs: 0, missing: 0, broken: 0, extra: 0, differences: 0 };
  const days = wantedDay ? [wantedDay] : [...expected.keys()];
  for (const day of days) {
    const modules = (expected.get(day) ?? []).filter((m) => !wantedModule || m === wantedModule);
    for (const module of modules) {
      counts.files += 1;
      const result = compareModule(day, module, options);
      counts[result.status] += 1;
      if (result.status === 'same') continue;
      if (result.status === 'missing') {
        console.log(`MISSING  ${day} / ${module}   (no actual/${day}/${module}.json)`);
      } else if (result.status === 'broken') {
        console.log(`BROKEN   ${day} / ${module}   (${result.problem})`);
      } else {
        counts.differences += result.differences.length;
        console.log(`DIFFERS  ${day} / ${module}   ${result.differences.length} difference(s)`);
        for (const item of result.differences.slice(0, options.max)) {
          const why = item.note ? `  [${item.note}]` : '';
          console.log(
            `    ${item.path || '(whole file)'}: expected ${describe(item.expected)}, actual ${describe(item.actual)}${why}`,
          );
        }
        const hidden = result.differences.length - options.max;
        if (hidden > 0) console.log(`    ... and ${hidden} more (use --all to see them)`);
      }
    }
    // Files the new core wrote that the old app has no counterpart for.
    for (const module of actual.get(day) ?? []) {
      if (wantedModule && module !== wantedModule) continue;
      if (!(expected.get(day) ?? []).includes(module)) {
        counts.extra += 1;
        console.log(`EXTRA    ${day} / ${module}   (actual/ has it, expected/ does not)`);
      }
    }
  }
  if (!wantedDay) {
    for (const day of actual.keys()) {
      if (expected.has(day)) continue;
      counts.extra += 1;
      console.log(`EXTRA    ${day}   (a day in actual/ that expected/ does not have)`);
    }
  }

  const bad = counts.differs + counts.missing + counts.broken + counts.extra;
  console.log(
    `${bad === 0 ? 'PARITY' : 'NOT YET'}: ${counts.files} file(s) checked, ${counts.same} identical, ` +
      `${counts.differs} differ (${counts.differences} difference(s) in all), ${counts.missing} missing, ` +
      `${counts.broken} unreadable, ${counts.extra} extra.`,
  );
  return bad === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) process.exit(main());
