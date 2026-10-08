// Runs after `npm install`. Puts a small check in front of every commit so that a real
// name, ID, email, phone number or station code cannot be saved by accident.
//
// The check itself is scripts/privacy-scan.mjs. This file only installs the hook that
// calls it. Safe to run again and again: it only ever touches its own marked block.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const START = '# >>> loadout-builder privacy check >>>';
const END = '# <<< loadout-builder privacy check <<<';

const BLOCK = `${START}
# Installed by scripts/install-hooks.mjs. Stops the commit if the staged files hold
# anything that looks like real driver data. Skipped in folders that do not have the script.
repo_root="$(git rev-parse --show-toplevel)"
if [ -f "$repo_root/scripts/privacy-scan.mjs" ]; then
  node "$repo_root/scripts/privacy-scan.mjs" --staged || exit 1
fi
${END}
`;

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function main() {
  let hookPath;
  try {
    hookPath = git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-commit']);
  } catch {
    console.log('Not inside a git folder, so no commit check was installed.');
    return;
  }

  mkdirSync(dirname(hookPath), { recursive: true });

  let current = '';
  if (existsSync(hookPath)) current = readFileSync(hookPath, 'utf8');

  let next;
  if (current.includes(START)) {
    const before = current.slice(0, current.indexOf(START));
    const afterIndex = current.indexOf(END);
    const after =
      afterIndex === -1 ? '' : current.slice(afterIndex + END.length).replace(/^\r?\n/, '');
    next = `${before}${BLOCK}${after}`;
  } else if (current.trim()) {
    next = `${current.replace(/\s*$/, '\n')}\n${BLOCK}`;
  } else {
    next = `#!/bin/sh\n${BLOCK}`;
  }

  if (next !== current) writeFileSync(hookPath, next);
  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // Windows ignores file modes; git for Windows runs the hook anyway.
  }
  console.log('Commit check is installed (it runs the privacy scan on staged files).');
}

main();
