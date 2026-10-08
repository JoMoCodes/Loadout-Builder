import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELEASE_NOTES, compareVersions, notesBetween, type ReleaseNote } from './releaseNotes';

const appVersion: string = JSON.parse(
  readFileSync(new URL('../../../apps/desktop/package.json', import.meta.url), 'utf8'),
).version;

describe("What's new notes", () => {
  it('has a note for the version the app is on (add one when you bump the version)', () => {
    expect(RELEASE_NOTES[0]?.version).toBe(appVersion);
  });

  it('has something to say for every version', () => {
    for (const note of RELEASE_NOTES) {
      expect(note.items.length, `version ${note.version} has no items`).toBeGreaterThan(0);
      for (const item of note.items) expect(item.trim()).not.toBe('');
    }
  });

  it('lists versions newest first', () => {
    for (let i = 1; i < RELEASE_NOTES.length; i++) {
      expect(
        compareVersions(RELEASE_NOTES[i - 1]!.version, RELEASE_NOTES[i]!.version),
      ).toBeGreaterThan(0);
    }
  });
});

describe('comparing versions', () => {
  it('reads numbers, not text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.1')).toBe(0);
    expect(compareVersions('2.0.0', '2.0.1')).toBeLessThan(0);
  });

  it('ignores a pre-release tag', () => {
    expect(compareVersions('2.0.0-beta.1', '2.0.0')).toBe(0);
  });
});

describe('picking the notes to show after an update', () => {
  const notes: ReleaseNote[] = [
    { version: '1.1.1', items: ['c'] },
    { version: '1.1.0', items: ['b'] },
    { version: '1.0.0', items: ['a'] },
  ];

  it('returns the versions after the old one, up to and including the new one', () => {
    expect(notesBetween('1.0.0', '1.1.1', notes).map((n) => n.version)).toEqual(['1.1.1', '1.1.0']);
  });

  it('returns nothing when the version has not changed', () => {
    expect(notesBetween('1.1.1', '1.1.1', notes)).toEqual([]);
  });
});
