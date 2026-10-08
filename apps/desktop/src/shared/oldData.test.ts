import { describe, expect, it } from 'vitest';
import { describeCounts, joinWords } from './oldData';

describe('words for what came over', () => {
  it('names each kind of thing with its count, and leaves out zero and bookkeeping', () => {
    const words = describeCounts([
      { table: 'roster_meta', imported: 1 },
      { table: 'associates', imported: 76 },
      { table: 'vehicles', imported: 41 },
      { table: 'driver_links', imported: 13 },
      { table: 'dwp_rows', imported: 0 },
      { table: 'column_order', imported: 9 },
    ]);
    expect(words).toEqual(['76 drivers', '41 vans', '13 links']);
  });

  it('says one, not ones', () => {
    expect(describeCounts([{ table: 'vehicles', imported: 1 }])).toEqual(['1 van']);
  });

  it('joins a list the way a person would say it', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['76 drivers'])).toBe('76 drivers');
    expect(joinWords(['76 drivers', '41 vans'])).toBe('76 drivers and 41 vans');
    expect(joinWords(['76 drivers', '41 vans', '13 links'])).toBe(
      '76 drivers, 41 vans and 13 links',
    );
  });
});
