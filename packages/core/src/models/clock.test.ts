// Clock times and the sort rule every table shares. Expected answers come from the old Python
// helpers (parse_clock, clock_key, sort_key) run on the same inputs.

import { describe, expect, it } from 'vitest';
import {
  clockKey,
  compareCells,
  compareKeys,
  naturalKey,
  parseClock,
  sortedText,
  sortKey,
} from './clock';
import { dispatchTimes, createRouteDataSet, createRouteEntry } from './routes';

const CLOCKS: Array<[string | null, { hour: number; minute: number } | null, [number, string]]> = [
  [
    '10:25am',
    {
      hour: 10,
      minute: 25,
    },
    [0, '1025'],
  ],
  [
    '9:50 AM',
    {
      hour: 9,
      minute: 50,
    },
    [0, '0950'],
  ],
  [
    '12:00am',
    {
      hour: 0,
      minute: 0,
    },
    [0, '0000'],
  ],
  [
    '12:30pm',
    {
      hour: 12,
      minute: 30,
    },
    [0, '1230'],
  ],
  [
    '12:00 PM',
    {
      hour: 12,
      minute: 0,
    },
    [0, '1200'],
  ],
  [
    '1:05 p.m.',
    {
      hour: 13,
      minute: 5,
    },
    [0, '1305'],
  ],
  [
    '1:05 P.M',
    {
      hour: 13,
      minute: 5,
    },
    [0, '1305'],
  ],
  ['13:00pm', null, [1, '13:00pm']],
  ['0:30am', null, [1, '0:30am']],
  ['9:60am', null, [1, '9:60am']],
  [
    'at 9:50am sharp',
    {
      hour: 9,
      minute: 50,
    },
    [0, '0950'],
  ],
  ['no time', null, [1, 'no time']],
  ['', null, [1, '']],
  ['9:50', null, [1, '9:50']],
  [
    '10:20AM',
    {
      hour: 10,
      minute: 20,
    },
    [0, '1020'],
  ],
  [
    '12:00 A.M.',
    {
      hour: 0,
      minute: 0,
    },
    [0, '0000'],
  ],
  [
    '  7:05pm',
    {
      hour: 19,
      minute: 5,
    },
    [0, '1905'],
  ],
  [
    '11:59 pm',
    {
      hour: 23,
      minute: 59,
    },
    [0, '2359'],
  ],
  ['PAD 2/9:55', null, [1, 'pad 2/9:55']],
  ['9:5am', null, [1, '9:5am']],
  [
    '09:50am',
    {
      hour: 9,
      minute: 50,
    },
    [0, '0950'],
  ],
  ['123:45am', null, [1, '123:45am']],
  ['1:23:45pm', null, [1, '1:23:45pm']],
  [
    '9:50amx',
    {
      hour: 9,
      minute: 50,
    },
    [0, '0950'],
  ],
  [null, null, [1, '']],
];

const SORT_INPUTS: string[] = [
  '10:20am',
  '9:50am',
  '',
  '-',
  '51',
  '619454',
  '655103 (LMR)',
  'ET5720',
  'A10',
  'A9',
  'a2',
  '12:00am',
  '12:00pm',
  '11:59pm',
  '  9:50 AM ',
  'Van 12',
  'Van 3',
  '0051',
  '99999999999999999999999',
  '100000000000000000000',
  'b',
  'B',
  'PAD 2/9:55',
  'PAD 10/9:55',
  '7',
  '7a',
  '7 a',
  '2x3',
  '2x10',
  'Zed',
  '\u00e9lan',
  'zebra',
  'e',
  '1:00pm',
  ' - ',
  '--',
];

const SORTED: string[] = [
  '12:00am',
  '9:50am',
  '  9:50 AM ',
  '10:20am',
  '12:00pm',
  '1:00pm',
  '11:59pm',
  '2x3',
  '2x10',
  '7',
  '7 a',
  '7a',
  '51',
  '0051',
  '619454',
  '655103 (LMR)',
  '100000000000000000000',
  '99999999999999999999999',
  '--',
  'a2',
  'A9',
  'A10',
  'b',
  'B',
  'e',
  'ET5720',
  'PAD 2/9:55',
  'PAD 10/9:55',
  'Van 3',
  'Van 12',
  'zebra',
  'Zed',
  '\u00e9lan',
  '',
  '-',
  ' - ',
];

describe('parseClock', () => {
  it.each(CLOCKS)('reads %j', (text, expected) => {
    expect(parseClock(text)).toEqual(expected);
  });
});

describe('clockKey', () => {
  it.each(CLOCKS)('keys %j', (text, _parsed, expected) => {
    expect(clockKey(text)).toEqual(expected);
  });

  it('puts real times in clock order and unknown text last', () => {
    const order = ['soon', '10:20am', '9:50am', '12:00am', '11:59pm'].sort((a, b) =>
      compareKeys(clockKey(a), clockKey(b)),
    );
    expect(order).toEqual(['12:00am', '9:50am', '10:20am', '11:59pm', 'soon']);
  });
});

describe('sortKey', () => {
  it('orders a column the way the old tables did', () => {
    expect([...SORT_INPUTS].sort(compareCells)).toEqual(SORTED);
  });

  it('puts 9:50am before 10:20am and van 51 before 619454 before 655103', () => {
    expect(['10:20am', '9:50am'].sort(compareCells)).toEqual(['9:50am', '10:20am']);
    expect(['655103 (LMR)', '619454', '51'].sort(compareCells)).toEqual([
      '51',
      '619454',
      '655103 (LMR)',
    ]);
  });

  it('sinks empty cells to the bottom', () => {
    expect(['', 'b', '-', 'a'].sort(compareCells)).toEqual(['a', 'b', '', '-']);
    expect(sortKey(null)).toEqual([2]);
    expect(sortKey('  ')).toEqual([2]);
  });

  it('puts clock times ahead of other text and numbers ahead of words', () => {
    expect(['ET5720', '9:50am', '51'].sort(compareCells)).toEqual(['9:50am', '51', 'ET5720']);
  });

  it('compares long digit runs as numbers', () => {
    expect(compareCells('99999999999999999999999', '100000000000000000000')).toBe(1);
  });
});

describe('naturalKey', () => {
  it('splits digits from text and lets numbers lead', () => {
    expect(naturalKey('a10b2')).toEqual([
      [1, 'a'],
      [0, 10n],
      [1, 'b'],
      [0, 2n],
    ]);
    expect(naturalKey('')).toEqual([]);
    expect(naturalKey('007')).toEqual([[0, 7n]]);
  });
});

describe('compareKeys and sortedText', () => {
  it('compares tuples the way Python does', () => {
    expect(compareKeys([1, 'a'], [1, 'b'])).toBe(-1);
    expect(compareKeys([1], [1, 0])).toBe(-1);
    expect(compareKeys([2, [0, 5n]], [2, [0, 5n]])).toBe(0);
    expect(() => compareKeys('a', 1)).toThrow();
  });

  it('sorts text by code point', () => {
    expect(sortedText(['b', 'B', 'a', '\u{1F600}', '\uFF21'])).toEqual([
      'B',
      'a',
      'b',
      '\uFF21',
      '\u{1F600}',
    ]);
  });
});

describe('dispatchTimes', () => {
  it('lists distinct times earliest first, with how many drivers have each', () => {
    const dataSet = createRouteDataSet({
      rows: [
        '10:20am',
        '9:50am',
        '',
        '10:20am',
        'soon',
        '9:50am',
        '12:00am',
        'Alpha',
        '11:59pm',
      ].map((dispatchTime: string) => createRouteEntry({ dispatchTime })),
    });
    expect(dispatchTimes(dataSet)).toEqual([
      ['12:00am', 1],
      ['9:50am', 2],
      ['10:20am', 2],
      ['11:59pm', 1],
      ['', 1],
      ['Alpha', 1],
      ['soon', 1],
    ]);
  });
});
