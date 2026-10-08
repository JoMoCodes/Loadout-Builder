import { describe, expect, it } from 'vitest';
import {
  LEAVE_OUT,
  NOT_PUBLIC,
  countOwnerName,
  countUserPaths,
  goingPublicDoc,
  scrubFileName,
  scrubJsonText,
  scrubUserPaths,
} from './publish-public.mjs';

describe('scrubbing personal Windows paths from docs', () => {
  it('turns a user folder into %USERPROFILE%, in every spelling', () => {
    expect(scrubUserPaths('See C:\\Users\\Someone\\Downloads\\file.csv now')).toBe(
      'See %USERPROFILE%\\Downloads\\file.csv now',
    );
    expect(scrubUserPaths('"C:\\\\Users\\\\Someone\\\\x"')).toBe('"%USERPROFILE%\\\\x"');
    expect(scrubUserPaths('D:/Users/Someone/Desktop')).toBe('%USERPROFILE%/Desktop');
  });

  it('turns a personal OneDrive folder into plain OneDrive', () => {
    expect(scrubUserPaths('%USERPROFILE%\\OneDrive - Some Name\\Desktop App')).toBe(
      '%USERPROFILE%\\OneDrive\\Desktop App',
    );
  });

  it('leaves the %USERPROFILE% forms and ordinary words alone', () => {
    const fine = 'Look in %USERPROFILE%\\OneDrive\\Desktop App and in the Users list.';
    expect(scrubUserPaths(fine)).toBe(fine);
    expect(countUserPaths(fine)).toBe(0);
  });

  it('counts what is left to find', () => {
    expect(countUserPaths('C:\\Users\\A\\x and C:\\Users\\B\\y')).toBe(2);
    expect(countUserPaths(scrubUserPaths('C:\\Users\\A\\x and OneDrive - B\\y'))).toBe(0);
  });
});

describe("scrubbing the owner's first name from names and keys", () => {
  const name = ['Jon', 'athan'].join('');

  it('renames a file', () => {
    expect(scrubFileName(`preset_${name}.pdf`)).toBe('preset_owner.pdf');
    expect(scrubFileName('cases.json')).toBe('cases.json');
  });

  it('changes a JSON key and a JSON value, and nothing else', () => {
    const before = `{"preset:${name}": {"file": "preset_${name}"}, "other": 1}`;
    const after = scrubJsonText(before);
    expect(countOwnerName(after)).toBe(0);
    expect(after).toBe('{"preset:Owner": {"file": "preset_Owner"}, "other": 1}');
  });
});

describe('what stays out of the public repository', () => {
  it('leaves out the old app, the private folder and the going-public steps', () => {
    expect(LEAVE_OUT).toEqual(expect.arrayContaining(['legacy/python', '.private']));
    expect(NOT_PUBLIC).toContain('docs/GOING-PUBLIC.md');
  });

  it('has a step list that names the public repository, the secret and the pinned note', () => {
    const doc = goingPublicDoc();
    for (const words of [
      'Loadout-Builder-private',
      'LB_STATION_CODE',
      'Privacy scan',
      'public-release',
      'Discussions',
      '2.0.1',
      "What's new",
      'Read this before you post',
    ]) {
      expect(doc).toContain(words);
    }
    expect(countUserPaths(doc)).toBe(0);
  });
});
