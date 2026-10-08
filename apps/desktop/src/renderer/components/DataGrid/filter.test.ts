// The filter bar's rules, and how columns size themselves.

import { describe, expect, it } from 'vitest';
import { checkSeverity } from '../../lib/checkSeverity';
import { CELL_PADDING, HEADING_PADDING, MAX_COLUMN_WIDTH, fitWidths } from './autofit';
import { filterRows } from './filter';
import { MIN_COLUMN_WIDTH } from './layout';

interface Row {
  driver: string;
  check: string;
  shift: string;
}

const ROWS: Row[] = [
  { driver: 'Carmen Abernathy', check: 'OK', shift: 'Electric Route' },
  { driver: 'Nadine Abernathy', check: 'Inactive associate', shift: 'Standard Route' },
  { driver: 'Colton Alderman', check: 'No associate found', shift: 'Electric Route' },
];

const base = {
  attentionOnly: false,
  chips: [],
  query: '',
  texts: [(r: Row) => r.driver, (r: Row) => r.check],
};

describe('filtering', () => {
  it('searches every visible column, ignoring case', () => {
    expect(filterRows(ROWS, { ...base, query: 'abernathy' }).map((r) => r.driver)).toEqual([
      'Carmen Abernathy',
      'Nadine Abernathy',
    ]);
    expect(filterRows(ROWS, { ...base, query: 'INACTIVE' })).toHaveLength(1);
  });

  it('does not search hidden columns', () => {
    expect(filterRows(ROWS, { ...base, query: 'electric' })).toHaveLength(0);
  });

  it('"Needs attention" keeps only flagged rows', () => {
    const flagged = filterRows(ROWS, {
      ...base,
      attentionOnly: true,
      needsAttention: (r) => checkSeverity(r.check) !== '',
    });
    expect(flagged.map((r) => r.driver)).toEqual(['Nadine Abernathy', 'Colton Alderman']);
  });

  it('chips keep rows matching any chip that is on', () => {
    const shown = filterRows(ROWS, {
      ...base,
      chips: [(r) => checkSeverity(r.check) === 'bad', (r) => r.check === 'OK'],
    });
    expect(shown.map((r) => r.driver)).toEqual(['Carmen Abernathy', 'Colton Alderman']);
  });

  it("runs the page's own filter first", () => {
    const shown = filterRows(ROWS, { ...base, pageFilter: (r) => r.shift === 'Electric Route' });
    expect(shown).toHaveLength(2);
  });
});

describe('the Check column colours, as the old app had them', () => {
  it('problems are red, warnings amber', () => {
    expect(checkSeverity('No associate found')).toBe('bad');
    expect(checkSeverity('ID expired 12d ago')).toBe('bad');
    expect(checkSeverity('Not Step Van qualified')).toBe('bad');
    expect(checkSeverity('Ambiguous - pick one')).toBe('bad');
    expect(checkSeverity('ID expires in 19d')).toBe('warn');
    expect(checkSeverity('Inactive associate')).toBe('warn');
    expect(checkSeverity('Verify match')).toBe('warn');
    expect(checkSeverity('OK')).toBe('');
  });
});

describe('columns sized to their contents', () => {
  const measure = (text: string) => text.length * 7;

  it('takes the widest cell or the heading, with the old padding', () => {
    const widths = fitWidths(
      [
        { id: 'driver', header: 'Driver', text: (r: Row) => r.driver },
        { id: 'check', header: 'Check', text: () => '' },
      ],
      ROWS,
      measure,
      measure,
    );
    expect(widths.driver).toBe(16 * 7 + CELL_PADDING);
    expect(widths.check).toBe(5 * 7 + HEADING_PADDING);
  });

  it('keeps between the old minimum and maximum, scaled with the text size', () => {
    const widths = fitWidths(
      [
        { id: 'tiny', header: '', text: () => 'a' },
        { id: 'huge', header: 'x', text: () => 'x'.repeat(500) },
      ],
      ROWS,
      measure,
      measure,
      1.5,
    );
    expect(widths.tiny).toBe(Math.round(MIN_COLUMN_WIDTH * 1.5));
    expect(widths.huge).toBe(MAX_COLUMN_WIDTH * 1.5);
  });
});
