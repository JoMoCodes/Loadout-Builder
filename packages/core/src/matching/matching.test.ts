// Expected values below were produced by running the old Python app's matching.py and difflib on
// the same made-up names (from packages/fixtures/manifest.json).

import { describe, expect, it } from 'vitest';
import { createAssociate } from '../models/associates';
import { createDriverRow } from '../models/roster';
import {
  AssociateIndex,
  driverKey,
  isAmbiguous,
  matchDriver,
  matchLabel,
  matchRoster,
  nameKey,
  needsReview,
  normalizeName,
  summarise,
} from './matching';
import { sequenceRatio } from './sequenceMatcher';

describe('sequenceRatio is difflib.SequenceMatcher.ratio()', () => {
  it.each([
    ['abcd', 'bcde', 0.75],
    ['greta nolan underhill', 'greta nollan underhil', 0.9523809523809523],
    ['mason clemmons', 'mason clemens', 0.8888888888888888],
    ['', '', 1.0],
    ['abxcd', 'abcd', 0.8888888888888888],
    ['qwerty', 'wertyq', 0.8333333333333334],
  ])('%s / %s', (a, b, expected) => {
    expect(sequenceRatio(a, b)).toBe(expected);
  });

  it('drops popular characters once the second text reaches 200 characters', () => {
    expect(sequenceRatio('ab'.repeat(150), 'ba'.repeat(120) + 'xyz'.repeat(30))).toBe(0);
    expect(
      sequenceRatio('the quick brown fox '.repeat(12), 'a quick brown dog jumps '.repeat(10)),
    ).toBe(0);
    expect(sequenceRatio('hello world' + 'x'.repeat(200), 'hello wurld' + 'y'.repeat(200))).toBe(
      0.04739336492890995,
    );
    expect(
      sequenceRatio('zz hello world' + 'x'.repeat(20), 'hello wurld zz' + 'y'.repeat(200)),
    ).toBe(0.08064516129032258);
  });
});

describe('normalizeName and nameKey', () => {
  it.each([
    ['  Mason  Clemmons Jr.', 'mason clemmons', ['mason', 'clemmons']],
    ["Élodie O'Hargrove-Smith III", "elodie o'hargrove-smith", ['elodie', "o'hargrove-smith"]],
    ['x', 'x', ['x', '']],
    ['', '', ['', '']],
    ['a.b,c', 'a b c', ['a', 'c']],
    ['Nell  Bellamy\tSr', 'nell bellamy', ['nell', 'bellamy']],
  ])('%j', (name, normalized, key) => {
    expect(normalizeName(name)).toBe(normalized);
    expect(driverKey(name)).toBe(normalized);
    expect(nameKey(name)).toEqual(key);
  });
});

describe('matchDriver', () => {
  const book = [
    createAssociate({ name: 'Barrett Hadley Ainsworth', transporterId: 'A047LNAN5VQIQR' }),
    createAssociate({ name: 'Carmen Abernathy', transporterId: 'A083QLD1CI9YSZ' }),
    createAssociate({ name: 'Nadine Abernathy', transporterId: 'A08Z3QTIYAI58G' }),
    createAssociate({ name: 'Beatrice Redmond', transporterId: 'A0DZDWECHDJ5TO' }),
    createAssociate({ name: 'Beatrice Esme Redmond', transporterId: 'A0FU25U7H48VU2' }),
    createAssociate({ name: 'Zane Applewhite', transporterId: '' }),
  ];
  const links = new Map<string, string | null>([
    ['nolan abernathy', 'A083QLD1CI9YSZ'],
    ['colton alderman', null],
    ['elodie ashdown', 'GONE'],
  ]);
  const firstFive = [
    'A047LNAN5VQIQR',
    'A083QLD1CI9YSZ',
    'A08Z3QTIYAI58G',
    'A0DZDWECHDJ5TO',
    'A0FU25U7H48VU2',
  ];
  const cases: Array<[string, string, string | null, string[], string, boolean]> = [
    ['Barrett Ainsworth', 'name', 'A047LNAN5VQIQR', [], 'First + last name', false],
    ['Carmen Abernathy', 'exact', 'A083QLD1CI9YSZ', [], 'Exact name', false],
    [
      'Carmen Abernathey',
      'fuzzy',
      'A083QLD1CI9YSZ',
      ['A083QLD1CI9YSZ'],
      'Close match - check',
      true,
    ],
    ['Beatrice Redmond', 'exact', 'A0DZDWECHDJ5TO', [], 'Exact name', false],
    [
      'Beatrice X Redmond',
      'none',
      null,
      ['A0DZDWECHDJ5TO', 'A0FU25U7H48VU2'],
      'Ambiguous - pick one',
      true,
    ],
    // A link to someone no longer in the book falls through; the first five of the whole book
    // come back as "candidates", which the old app then calls ambiguous.
    ['Elodie Ashdown', 'none', null, firstFive, 'Ambiguous - pick one', true],
    ['Nolan Abernathy', 'manual', 'A083QLD1CI9YSZ', [], 'Linked by hand', false],
    ['Colton Alderman', 'cleared', null, [], 'Marked not an associate', false],
    ['Zane Applewhyte', 'fuzzy', '', [''], 'Close match - check', true],
    ['Carmen  ABERNATHY Jr', 'exact', 'A083QLD1CI9YSZ', [], 'Exact name', false],
    ['Quill Nobody', 'none', null, firstFive, 'Ambiguous - pick one', true],
  ];
  const index = AssociateIndex.build(book);

  it.each(cases)('%s', (driver, method, id, candidates, label, review) => {
    const match = matchDriver(driver, index, links);
    expect(match.method).toBe(method);
    expect(match.associate ? match.associate.transporterId : null).toBe(id);
    expect(match.candidates.map((a) => a.transporterId)).toEqual(candidates);
    expect(matchLabel(match)).toBe(label);
    expect(needsReview(match)).toBe(review);
    expect(isAmbiguous(match)).toBe(label === 'Ambiguous - pick one');
  });

  it('matchRoster keys by driver key and summarise counts keys, not rows', () => {
    const rows = cases.map(([driver]) => createDriverRow({ driver }));
    const matches = matchRoster(rows, book, links);
    expect([...matches.keys()]).toEqual([
      'barrett ainsworth',
      'carmen abernathy',
      'carmen abernathey',
      'beatrice redmond',
      'beatrice x redmond',
      'elodie ashdown',
      'nolan abernathy',
      'colton alderman',
      'zane applewhyte',
      'quill nobody',
    ]);
    expect(Object.fromEntries(summarise(matches))).toEqual({
      name: 1,
      exact: 2,
      fuzzy: 2,
      none: 3,
      manual: 1,
      cleared: 1,
    });
    expect(matchRoster(rows, [], links).size).toBe(0);
  });

  it('lists first + last names shared by more than one associate', () => {
    expect(
      index.collisions().map(([key, group]) => [key, group.map((a) => a.transporterId)]),
    ).toEqual([
      [
        ['beatrice', 'redmond'],
        ['A0DZDWECHDJ5TO', 'A0FU25U7H48VU2'],
      ],
    ]);
  });
});
