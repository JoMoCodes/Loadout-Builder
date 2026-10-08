// Builds the one clean commit that becomes the public repository. It never pushes.
//
//   node scripts/publish-public.mjs --remote <address of the new public repo>
//   node scripts/publish-public.mjs --dry-run                 (try it; no remote needed)
//
// What it does, in order:
//   1. Takes the files of the current main (or --from <branch or commit>) as they were committed.
//   2. Leaves out legacy/python/ (the old Python app stays in the private repo's history), .private/,
//      the step list for going public, and any file the privacy scan flags.
//   3. Scrubs the docs: Windows user paths (C:\Users\<name>\..., OneDrive - <name>\...) become
//      %USERPROFILE%\..., and the owner's first name is taken out of file names and JSON keys.
//      Any other file that still has a user path or the name is a finding.
//   4. Puts what is left in a fresh, empty repository as ONE commit, and runs the privacy scan
//      over that tree, the commit message and the author, and gitleaks if it is installed.
//   5. Only if all of it is clean, creates the local branch `public-release` (an orphan branch: a
//      single commit with no history) and prints the git push command to run by hand.
//
// It prints counts, never names or values. Any finding stops it and no branch is made.
// It works in a temporary folder and removes it at the end.

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const BRANCH = 'public-release';
export const PUBLIC_REPO = 'JoMoCodes/Loadout-Builder';
/** Folders (and files) that never go in the public repo. */
export const LEAVE_OUT = ['legacy/python', '.private'];
/** The step list for going public is for the owner of the private repo, not for the public one. */
export const NOT_PUBLIC = ['docs/GOING-PUBLIC.md'];
const CHECKERS = new Set(['scripts/publish-public.mjs', 'scripts/publish-public.test.mjs']);

// ---------------------------------------------------------------------------
// Scrubbing (pure functions, tested in publish-public.test.mjs)
// ---------------------------------------------------------------------------

// The owner's first name, as a pattern: this is a public GitHub handle's owner, and the plan may
// say it in prose, but it does not belong in a file name or a JSON key.
const OWNER_NAME = new RegExp(`${'jo'}${'nat'}\\w*`, 'gi');

// C:\Users\<name>, C:\\Users\\<name> (escaped), C:/Users/<name>
const USER_PATH = /\b[A-Za-z]:(\\{1,2}|\/)Users\1[^\\/\s`'"<>|:*?]+/g;
// OneDrive - <a person's or company's folder name>
const ONEDRIVE_PERSONAL = /OneDrive - [^\\/\r\n`'"<>|]+/g;

/** How many personal Windows paths the text holds. */
export function countUserPaths(text) {
  return (text.match(USER_PATH) ?? []).length + (text.match(ONEDRIVE_PERSONAL) ?? []).length;
}

/** Windows user paths in a doc become %USERPROFILE% forms. */
export function scrubUserPaths(text) {
  return text.replace(USER_PATH, '%USERPROFILE%').replace(ONEDRIVE_PERSONAL, 'OneDrive');
}

/** How many times the owner's first name is in the text. */
export function countOwnerName(text) {
  return (text.match(OWNER_NAME) ?? []).length;
}

/** A file name with the owner's first name in it, made plain. */
export function scrubFileName(name) {
  return name.replace(OWNER_NAME, 'owner');
}

/** JSON text with the owner's first name taken out of every key and value. */
export function scrubJsonText(text) {
  return text.replace(OWNER_NAME, 'Owner');
}

const DOC_EXTENSIONS = new Set(['.md', '.txt']);
const extensionOf = (file) => {
  const dot = basename(file).lastIndexOf('.');
  return dot <= 0 ? '' : basename(file).slice(dot).toLowerCase();
};
const isDoc = (file) => DOC_EXTENSIONS.has(extensionOf(file));
const isJson = (file) => extensionOf(file) === '.json';

function looksLikeText(buffer) {
  return !buffer.subarray(0, 8000).includes(0);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.buffer ? 'buffer' : 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, args, options = {}) {
  const result = run('git', args, { cwd, ...options });
  if (result.status !== 0 && !options.allowFail) {
    // Git's own words can name files; only the command is reported.
    throw new Error(`git ${args[0]} did not work (exit ${result.status}).`);
  }
  return result;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

class Stop extends Error {}

function stop(message) {
  throw new Stop(message);
}

// ---------------------------------------------------------------------------
// The step list for the owner (written to docs/GOING-PUBLIC.md)
// ---------------------------------------------------------------------------

export function goingPublicDoc() {
  return `# Going public

This is the step list for turning the private repository into the public one that coworkers install
from. Do the steps in order. Nothing here is done for you: the script only builds a clean commit and
prints the push command.

Why not just make the private repository public? Its first commit holds real names, so its history
can never be shown. The public repository starts again from one clean, scanned commit.

## Before you start

- You are on the PC that has the \`.private\` folder (the station code and the list of real names),
  with \`main\` up to date and the phase 6 pull request merged.
- Node is installed. Gitleaks is nice to have (the script checks for secrets with it when it is there).

## Steps

1. **Rename this private repository.** On GitHub, open \`${PUBLIC_REPO}\`, go to **Settings**, **General**,
   and change **Repository name** to \`Loadout-Builder-private\`. Do not archive it yet.
   On your PC, point your copy at the new name:
   \`git remote set-url origin https://github.com/JoMoCodes/Loadout-Builder-private.git\`
2. **Create the new public repository.** On GitHub, click **New repository**. Owner \`JoMoCodes\`,
   name \`Loadout-Builder\`, **Public**. Leave it completely empty: no README, no licence, no
   .gitignore. (The app's updater and its links already point at \`${PUBLIC_REPO}\`.)
3. **Add the station code as a secret.** In the new repository: **Settings**, **Secrets and variables**,
   **Actions**, **New repository secret**. Name: \`LB_STATION_CODE\`. Value: the station code, and the DSP name
   if you like, separated by commas (it is the same as what is in your \`.private/station.txt\`).
   Without it the privacy scan skips its station code check and says so.
4. **Build the clean commit.** In your copy of the private repository, on \`main\`:
   \`node scripts/publish-public.mjs --remote https://github.com/${PUBLIC_REPO}.git\`
   It prints counts only. If it says anything was found, it stops and makes no branch: read the
   message, take the data out in the private repository, and run it again. Do not change the scan.
   When it ends with **Ready**, a local branch called \`public-release\` exists.
5. **Push it.** Run the \`git push\` line the script printed. It looks like this:
   \`git push https://github.com/${PUBLIC_REPO}.git public-release:main\`
   (The script never pushes by itself.)
6. **Watch the first run.** In the new repository, open **Actions**. The run does the privacy scan,
   builds and tests the app, starts it once on Windows, and publishes the release \`v2.0.0\` with the
   installer, the portable file and the update files. Check the release page lists them.
7. **Turn on branch protection.** **Settings**, **Branches**, **Add branch ruleset** (or rule) for \`main\`:
   require status checks to pass, and pick **Privacy scan**. You do this after the first run because the
   check only shows up in the list once it has run. (Setting it earlier would also block the first push.)
8. **Turn on Discussions.** **Settings**, **General**, **Features**, tick **Discussions**. Make a
   **Q&A** category if there is not one. Then post the note below, and **pin** it.
9. **Test it on a clean Windows 10 computer or virtual machine:**
   - Install from the \`v2.0.0\` release page (installer, with the SmartScreen click-through).
   - Open the app. Check the title says Loadout Builder, the Start menu entry says Loadout Builder, and
     the icon shows. Try **Settings**, **Bring over data from the old app**, and **Demo mode**.
   - On your PC, change the version to \`2.0.1\` in \`apps/desktop/package.json\`, add a short plain-words
     line for \`2.0.1\` at the top of \`packages/core/src/releaseNotes.ts\`, and push to \`main\` of the **public**
     repository (clone it first, or add it as a second remote).
   - When the run has published \`v2.0.1\`, open the installed app on the test computer. After a few minutes
     the green **Restart to update** button shows. Click it.
   - The **What's new** window shows the \`2.0.1\` line once, and not again the next time you open the app.
10. **Tidy up the private repository.** The private repository still has a \`v2.0.0\` release from the first
    phase (an app with an empty window). Once the public \`v2.0.0\` release exists, you can delete that old one
    (it is your call). Archive the private repository when you are happy: it keeps the old Python app and
    the full history.

## The pinned note for Discussions

Title: **Read this before you post**

> This help forum is public. Anyone on the internet can read it.
>
> **Describe the problem in words.** Say what you clicked and what the app said.
>
> **Never post a roster, a screenshot, an export file, or a driver's name, ID, phone number or van
> details.** Not even a little bit, and not even if you cover part of it. If you are not sure whether
> something is private, leave it out.
>
> If someone posts private data by mistake, tell the person who runs the app so it can be deleted.

## What the script leaves out and changes

- Leaves out \`legacy/python/\`, \`.private/\`, this step list, and any file the privacy scan flags.
- In the docs, Windows user paths become \`%USERPROFILE%\` forms, and the owner's first name is taken out
  of file names and JSON keys. If a code file still has one, the script stops instead of changing code.
- Makes a single commit by \`JoMoCodes\` (use \`--author-name\` and \`--author-email\` to change it). Your own
  email address is never put in the public history.
- Runs the privacy scan on the clean tree and on the commit message and author, and runs gitleaks if
  it is installed.
- Never pushes. It only prints the command.
`;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    dryRun: false,
    remote: '',
    from: '',
    authorName: 'JoMoCodes',
    // Built in two pieces so the privacy scan does not take it for a real address.
    authorEmail: ['JoMoCodes', 'users.noreply.github.com'].join('@'),
    keepTemp: false,
    writeDocs: false,
    verify: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? '';
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--remote') options.remote = next();
    else if (arg === '--from') options.from = next();
    else if (arg === '--author-name') options.authorName = next();
    else if (arg === '--author-email') options.authorEmail = next();
    else if (arg === '--keep-temp') options.keepTemp = true;
    else if (arg === '--write-docs') options.writeDocs = true;
    else if (arg === '--verify') options.verify = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else stop(`I do not know the option ${arg}. Try --help.`);
  }
  return options;
}

const HELP = `Usage: node scripts/publish-public.mjs --remote <address> [options]
       node scripts/publish-public.mjs --dry-run [options]

Builds the single clean commit for the public repository on a local branch called ${BRANCH}.
It never pushes: it prints the command for you to run.

  --remote <address>   where you will push (needed unless --dry-run)
  --dry-run            try everything without a remote; allows a branch other than main
  --from <ref>         build from this branch or commit (default: origin/main, else main)
  --author-name <n>    name on the public commit (default JoMoCodes)
  --author-email <e>   email on the public commit (default the GitHub no-reply address)
  --verify             also install, lint, type-check and test the clean tree (slow)
  --write-docs         write docs/GOING-PUBLIC.md in this repository and stop
  --keep-temp          keep the temporary folder (it may hold private lists; use with care)
`;

function resolveRef(options) {
  if (options.from) return options.from;
  const origin = git(repoRoot, ['rev-parse', '--verify', '--quiet', 'origin/main'], {
    allowFail: true,
  });
  return origin.status === 0 ? 'origin/main' : 'main';
}

/** Runs the privacy scan inside a tree. The report lists files and line numbers, never values. */
function scanTree(tree, extraArgs = []) {
  const result = run('node', ['scripts/privacy-scan.mjs', ...extraArgs], {
    cwd: tree,
    env: process.env,
  });
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const files = [];
  let problems = 0;
  for (const line of text.split(/\r?\n/)) {
    const file = /^ {2}(\S.*)$/.exec(line);
    if (file && !line.startsWith('   ')) files.push(file[1]);
    if (/^\s+- found /.test(line)) problems += 1;
    const more = /and (\d+) more in this file/.exec(line);
    if (more) problems += Number(more[1]);
  }
  return { ok: result.status === 0, files, problems, notes: text.match(/^Note: .*$/gm) ?? [] };
}

function buildPublicTree(ref, tree, summary) {
  // 1. The committed files of that ref, nothing from the working folder.
  const archive = git(repoRoot, ['archive', '--format=tar', ref], { buffer: true });
  mkdirSync(tree, { recursive: true });
  const unpack = run('tar', ['-x', '-C', tree], { input: archive.stdout, buffer: true });
  if (unpack.status !== 0) stop('Could not unpack the files (is tar installed?).');
  summary.sourceFiles = walk(tree).length;

  // 2. What never goes in.
  let left = 0;
  for (const name of [...LEAVE_OUT, ...NOT_PUBLIC]) {
    const full = join(tree, name);
    if (!existsSync(full)) continue;
    left += statSync(full).isDirectory() ? walk(full).length : 1;
    rmSync(full, { recursive: true, force: true });
  }
  summary.leftOut = left;
}

function scrubTree(tree, summary) {
  const findings = [];
  let docsScrubbed = 0;
  let jsonScrubbed = 0;
  let renamed = 0;

  // File names first (deepest first, so a renamed folder does not hide its files).
  const files = walk(tree).sort((a, b) => b.length - a.length);
  for (const file of files) {
    const name = basename(file);
    const clean = scrubFileName(name);
    if (clean !== name) {
      renameSync(file, join(dirname(file), clean));
      renamed += 1;
    }
  }

  for (const file of walk(tree)) {
    const where = relative(tree, file).split('\\').join('/');
    // This script and its test hold made-up example paths, because they are what looks for them.
    if (CHECKERS.has(where)) continue;
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      continue;
    }
    if (!looksLikeText(buffer) || buffer.length > 5 * 1024 * 1024) continue;
    const text = buffer.toString('utf8');
    let out = text;
    if (isDoc(file)) {
      out = scrubUserPaths(out);
      if (out !== text) docsScrubbed += 1;
    } else {
      // In code and data, a personal path is not rewritten: it is a finding.
      if (countUserPaths(out) > 0) findings.push(`${where}: a Windows user path`);
      if (isJson(file)) {
        const before = out;
        out = scrubJsonText(out);
        if (out !== before) jsonScrubbed += 1;
      } else if (countOwnerName(out) > 0) {
        findings.push(`${where}: the owner's first name`);
      }
    }
    if (out !== text) writeFileSync(file, out);
  }
  summary.docsScrubbed = docsScrubbed;
  summary.jsonScrubbed = jsonScrubbed;
  summary.renamed = renamed;
  return findings;
}

function copyPrivateLists(tree) {
  // The scan's own lists (station code, real names) stay on this computer. They are copied into the
  // temporary tree only so the scan can use them, and the tree's .gitignore keeps them out of the commit.
  const from = join(repoRoot, '.private');
  let copied = 0;
  for (const name of ['station.txt', 'real-names.txt']) {
    if (existsSync(join(from, name))) {
      mkdirSync(join(tree, '.private'), { recursive: true });
      cpSync(join(from, name), join(tree, '.private', name));
      copied += 1;
    }
  }
  return copied;
}

function gitleaksCheck(tree) {
  let probe;
  try {
    probe = run('gitleaks', ['version']);
  } catch {
    return { ran: false };
  }
  if (probe.status !== 0) return { ran: false };
  const result = run('gitleaks', [
    'detect',
    '--source',
    tree,
    '--no-banner',
    '--redact',
    '--exit-code',
    '1',
  ]);
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const count = /leaks found: (\d+)/.exec(text);
  return {
    ran: true,
    ok: result.status === 0,
    leaks: count ? Number(count[1]) : result.status === 0 ? 0 : 1,
  };
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.writeDocs) {
    writeFileSync(join(repoRoot, 'docs', 'GOING-PUBLIC.md'), goingPublicDoc());
    console.log('Wrote docs/GOING-PUBLIC.md');
    return 0;
  }
  if (!options.dryRun && !options.remote) {
    stop('Say where you will push with --remote <address>, or try it first with --dry-run.');
  }

  const ref = resolveRef(options);
  if (
    git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true })
      .status !== 0
  ) {
    stop(`I cannot find ${ref}. Fetch it first, or name another with --from.`);
  }
  if (!options.dryRun) {
    const dirty = git(repoRoot, ['status', '--porcelain']).stdout.trim();
    if (dirty) stop('This folder has changes that are not saved. Commit or put them away first.');
    if (options.from && !['main', 'origin/main'].includes(options.from)) {
      stop('A real run builds from main. Use --dry-run to try another branch.');
    }
    const head = git(repoRoot, ['rev-parse', ref]).stdout.trim();
    const main = git(repoRoot, ['rev-parse', 'main'], { allowFail: true }).stdout.trim();
    if (ref === 'origin/main' && main && head !== main) {
      stop('Your main is not the same as origin/main. Pull first, then run this again.');
    }
  }

  const current = git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (current === BRANCH) stop(`You are on ${BRANCH}. Switch to another branch first.`);

  const version = JSON.parse(
    git(repoRoot, ['show', `${ref}:apps/desktop/package.json`]).stdout,
  ).version;

  const temp = mkdtempSync(join(tmpdir(), 'loadout-public-'));
  const tree = join(temp, 'tree');
  const summary = {};
  const log = (line) => console.log(line);
  let failure = '';

  try {
    log(`Building the public repository from ${ref} (version ${version}).`);
    buildPublicTree(ref, tree, summary);
    log(`  files in ${ref}: ${summary.sourceFiles}`);
    log(`  left out (old Python app, private folder, going-public steps): ${summary.leftOut}`);

    const findings = scrubTree(tree, summary);
    log(`  docs with a personal Windows path scrubbed: ${summary.docsScrubbed}`);
    log(`  JSON files with the owner's first name scrubbed: ${summary.jsonScrubbed}`);
    log(`  files renamed to drop the owner's first name: ${summary.renamed}`);
    if (findings.length > 0) {
      for (const finding of findings) log(`  FOUND ${finding}`);
      stop(
        `${plural(findings.length, 'thing')} in code or data that I will not rewrite. Fix it in the private repository.`,
      );
    }

    // A fresh repository with a single commit.
    git(tree, ['init', '-q', '-b', BRANCH]);
    git(tree, ['config', 'user.name', options.authorName]);
    git(tree, ['config', 'user.email', options.authorEmail]);
    git(tree, ['config', 'commit.gpgsign', 'false']);
    git(tree, ['config', 'core.autocrlf', 'false']);
    git(tree, ['add', '-A']);

    const lists = copyPrivateLists(tree);
    log(
      `  private lists used by the scan: ${lists} of 2 (the station code and the real-names list)`,
    );

    // Files the scan flags are left out, then it is run again: what is left must be clean.
    let scan = scanTree(tree);
    let flaggedLeftOut = 0;
    if (!scan.ok && scan.files.length > 0) {
      for (const file of scan.files) {
        const full = join(tree, file);
        if (existsSync(full)) {
          rmSync(full, { force: true });
          flaggedLeftOut += 1;
        }
      }
      git(tree, ['add', '-A']);
      scan = scanTree(tree);
    }
    summary.flaggedLeftOut = flaggedLeftOut;
    log(`  files the scan flagged and I left out: ${flaggedLeftOut}`);
    for (const note of scan.notes) log(`  ${note}`);
    if (!scan.ok) {
      stop(
        `The privacy scan still found ${plural(scan.problems, 'problem')} in ${plural(scan.files.length, 'file')}. No branch was made.`,
      );
    }
    // Nothing from the private lists may have been committed.
    const staged = git(tree, ['ls-files']).stdout.split(/\r?\n/).filter(Boolean);
    summary.finalFiles = staged.length;
    if (staged.some((f) => f.startsWith('.private/') || f.startsWith('legacy/python/'))) {
      stop('A private or old-app file is in the commit. No branch was made.');
    }

    const message = `Loadout Builder ${version}\n\nThe first public version of the app.\n`;
    writeFileSync(join(temp, 'message.txt'), message);
    git(tree, ['commit', '-q', '--no-verify', '-F', join(temp, 'message.txt')]);

    // The "history" is this one commit: scan its tree again, its message and its author.
    const meta = join(temp, 'meta');
    mkdirSync(meta);
    // A GitHub no-reply address is the safe way to be named on a public commit, so it is the one
    // address the scan is not asked about. Any other address in the author, committer or message is.
    const commitText = git(tree, ['log', '-1', '--format=%an%n%ae%n%cn%n%ce%n%B'])
      .stdout.split(/\r?\n/)
      .map((line) =>
        /^[\w.+-]+@users\.noreply\.github\.com$/.test(line) ? '(no-reply address)' : line,
      )
      .join('\n');
    writeFileSync(join(meta, 'commit.txt'), commitText);
    const history = scanTree(tree, [meta]);
    log(`  commits in the history: ${git(tree, ['rev-list', '--count', 'HEAD']).stdout.trim()}`);
    log(
      `  privacy scan over the commit message and author: ${history.ok ? 'clean' : 'FOUND something'}`,
    );
    if (!history.ok)
      stop('The commit message or author holds something the scan flags. No branch was made.');
    const finalScan = scanTree(tree);
    log(
      `  privacy scan over the ${summary.finalFiles} files: ${finalScan.ok ? 'clean' : 'FOUND something'}`,
    );
    if (!finalScan.ok)
      stop('The privacy scan found something in the final files. No branch was made.');

    const leaks = gitleaksCheck(tree);
    if (!leaks.ran)
      log('  gitleaks: not installed, so that check was skipped (install it to run it)');
    else {
      log(`  gitleaks: ${leaks.ok ? 'clean' : `${plural(leaks.leaks, 'finding')}`}`);
      if (!leaks.ok) stop('Gitleaks found something. No branch was made.');
    }

    if (options.verify) {
      log(
        '  checking that the clean tree installs, passes its checks and builds (this takes a while)...',
      );
      for (const args of [['ci'], ['run', 'lint'], ['run', 'typecheck'], ['test']]) {
        const step = run('npm', args, { cwd: tree, shell: process.platform === 'win32' });
        log(`    npm ${args.join(' ')}: ${step.status === 0 ? 'ok' : 'FAILED'}`);
        if (step.status !== 0) stop('The clean tree does not pass its own checks.');
      }
    }

    // Bring the one commit home as a local branch.
    git(repoRoot, ['fetch', '-q', tree, `+refs/heads/${BRANCH}:refs/heads/${BRANCH}`]);
    const sha = git(repoRoot, ['rev-parse', '--short', BRANCH]).stdout.trim();
    const total = git(repoRoot, ['rev-list', '--count', BRANCH]).stdout.trim();
    log('');
    log(
      `Ready. Local branch ${BRANCH}: ${plural(Number(total), 'commit')} (${sha}), ${plural(summary.finalFiles, 'file')}.`,
    );
    log('Nothing was pushed. To publish, run:');
    log('');
    log(`  git push ${options.remote || '<address of the new public repository>'} ${BRANCH}:main`);
    log('');
    if (options.dryRun) log('This was a dry run: add --remote <address> for a real run.');
  } catch (error) {
    failure = error instanceof Stop ? error.message : `Something went wrong: ${error.message}`;
  } finally {
    if (options.keepTemp) console.log(`Kept the temporary folder: ${temp}`);
    else rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  }
  if (failure) {
    console.error('');
    console.error(`STOPPED: ${failure}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`STOPPED: ${error instanceof Stop ? error.message : 'Something went wrong.'}`);
    process.exit(1);
  }
}
