// Text rules spelled the way Python's string methods behave. Expected answers come from Python
// run on the same text.

import { describe, expect, it } from 'vitest';
import { alnumKey, pyStrip, splitLines, squeeze } from './text';

describe('squeeze and pyStrip', () => {
  const text = '  a\u001fb　 c﻿ d\t\n';

  it('squeezes every run of Python whitespace to one space', () => {
    expect(squeeze(text)).toBe('a b c﻿ d');
  });

  it('strips only the edges, and does not count the byte-order mark as space', () => {
    expect(pyStrip(text)).toBe('a\u001fb　 c﻿ d');
    expect(pyStrip('﻿x')).toBe('﻿x');
    expect(pyStrip('   ')).toBe('');
  });
});

describe('alnumKey', () => {
  it('keeps letters and digits, lowercased', () => {
    expect(alnumKey('Planned Departure-Time #2')).toBe('planneddeparturetime2');
    expect(alnumKey('')).toBe('');
  });
});

describe('splitLines', () => {
  it('splits on the line breaks Python does', () => {
    expect(splitLines('a\r\nb\rc\n\nd\u000be\u001cf\u0085g h\n')).toEqual([
      'a',
      'b',
      'c',
      '',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  it('does not make an extra line out of a last line break', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
  });
});
