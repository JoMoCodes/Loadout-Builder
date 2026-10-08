// Small saved files (settings, window position) kept in the app's data folder as JSON.
// A missing or broken file is not an error: the app just starts with its usual choices.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes through a temporary file so a crash mid-write cannot leave half a file behind. */
export function writeJson(file: string, value: unknown): boolean {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
    renameSync(temp, file);
    return true;
  } catch {
    return false;
  }
}
