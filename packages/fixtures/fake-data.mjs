// Name lists and generators for made-up people, IDs and VINs.
// Nothing in this file is real data. Everything is picked by a seeded random source, so the
// same seed always gives the same made-up values.

import { createHash } from 'node:crypto';

export const FIRST_NAMES = [
  'Aaron',
  'Abigail',
  'Adrian',
  'Alicia',
  'Amelia',
  'Andre',
  'Angela',
  'Anika',
  'Archer',
  'Ariana',
  'Aubrey',
  'Barrett',
  'Beatrice',
  'Bennett',
  'Blaine',
  'Bridget',
  'Caleb',
  'Camila',
  'Carmen',
  'Cecil',
  'Chandler',
  'Cleo',
  'Colton',
  'Cora',
  'Dalia',
  'Damian',
  'Darcy',
  'Delia',
  'Desmond',
  'Dominic',
  'Edith',
  'Elias',
  'Elodie',
  'Emmett',
  'Esme',
  'Everett',
  'Fabian',
  'Felicia',
  'Finley',
  'Flora',
  'Gabriel',
  'Gemma',
  'Gideon',
  'Greta',
  'Hadley',
  'Harlan',
  'Hazel',
  'Hector',
  'Imogen',
  'Isidro',
  'Jasper',
  'Jenna',
  'Jonah',
  'Josie',
  'Julian',
  'Kendra',
  'Kieran',
  'Lachlan',
  'Lena',
  'Leopold',
  'Lucinda',
  'Luther',
  'Mabel',
  'Marcus',
  'Marisol',
  'Mason',
  'Maxine',
  'Micah',
  'Miriam',
  'Nadine',
  'Nathaniel',
  'Nell',
  'Nolan',
  'Odette',
  'Olive',
  'Orson',
  'Paloma',
  'Percy',
  'Phoebe',
  'Quentin',
  'Rafael',
  'Rhea',
  'Rowan',
  'Rufus',
  'Sabrina',
  'Sawyer',
  'Selena',
  'Silas',
  'Sloane',
  'Soren',
  'Stella',
  'Tabitha',
  'Tobias',
  'Tristan',
  'Ulysses',
  'Valerie',
  'Vance',
  'Vera',
  'Wendell',
  'Willa',
  'Winston',
  'Xavier',
  'Yara',
  'Yusuf',
  'Zachary',
  'Zelda',
  'Zane',
  'Ximena',
  'Ines',
  'Ronan',
];

export const LAST_NAMES = [
  'Abernathy',
  'Ackerman',
  'Ainsworth',
  'Alderman',
  'Ashby',
  'Atwood',
  'Bannister',
  'Barlow',
  'Beaumont',
  'Bellamy',
  'Birchfield',
  'Blackwell',
  'Bramley',
  'Brightwater',
  'Caldwell',
  'Carraway',
  'Castellan',
  'Chesterfield',
  'Clemmons',
  'Colbrook',
  'Crawley',
  'Dalloway',
  'Danforth',
  'Darrow',
  'Delacroix',
  'Dunmore',
  'Eastwood',
  'Eldridge',
  'Ellsworth',
  'Fairbanks',
  'Fenwick',
  'Fitzroy',
  'Fontaine',
  'Galloway',
  'Garrity',
  'Gladstone',
  'Granger',
  'Greaves',
  'Halloran',
  'Hargrove',
  'Hawthorne',
  'Hollis',
  'Holloway',
  'Huxley',
  'Ingram',
  'Jessup',
  'Kingsley',
  'Kirkwood',
  'Lockhart',
  'Lovell',
  'Marlowe',
  'Merrick',
  'Montrose',
  'Nightingale',
  'Northcott',
  'Oakley',
  'Oswald',
  'Pemberton',
  'Penrose',
  'Quill',
  'Radcliffe',
  'Ravenscroft',
  'Redmond',
  'Rosewood',
  'Rutherford',
  'Sandoval',
  'Selwyn',
  'Sinclair',
  'Stanhope',
  'Stillwell',
  'Sutherland',
  'Talbot',
  'Thackeray',
  'Thorne',
  'Underhill',
  'Vandermeer',
  'Wadsworth',
  'Wakefield',
  'Waverly',
  'Whitaker',
  'Winslow',
  'Wolcott',
  'Woodbridge',
  'Yardley',
  'Zimmerman',
  'Ashdown',
  'Bexley',
  'Calloway',
  'Dewitt',
  'Everhart',
  'Fairweather',
  'Gresham',
  'Hartwell',
  'Islington',
  'Kensington',
  'Lindqvist',
  'Merriweather',
  'Nethercott',
  'Ormsby',
  'Prescott',
  'Quigley',
  'Rainsford',
  'Sheffield',
  'Tennyson',
  'Upton',
  'Vance',
  'Westbrook',
  'Yorke',
  'Applewhite',
  'Brookstone',
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const ID_ALPHABET = LETTERS + DIGITS;
const VIN_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // a VIN never uses I, O or Q

/** A repeatable random source: the same seed and label always give the same numbers. */
export function makeRandom(seed, label) {
  const hash = createHash('sha256').update(`${seed}|${label}`).digest();
  let a = hash.readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function charLike(random, ch, letters, digits) {
  if (/[A-Z]/.test(ch)) return pick(random, letters);
  if (/[a-z]/.test(ch)) return pick(random, letters).toLowerCase();
  if (/[0-9]/.test(ch)) return pick(random, digits);
  return ch;
}

/** A made-up Transporter ID: same length, same letter/digit pattern, different characters. */
export function fakeTransporterId(random, real, taken) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let out = real[0];
    for (const ch of real.slice(1)) out += charLike(random, ch, LETTERS, DIGITS);
    if (!taken.has(out) && out !== real) return out;
  }
  throw new Error('Could not make a unique fake Transporter ID.');
}

const VIN_VALUES = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function vinCheckDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value = /[0-9]/.test(ch) ? Number(ch) : (VIN_VALUES[ch] ?? 0);
    sum += value * VIN_WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * A made-up VIN that looks valid: 17 characters, no I, O or Q, a correct check digit.
 * The first three characters (who built the van), the model-year character and the plant
 * character are kept, since they describe the kind of van and not a particular one.
 */
export function fakeVin(random, real, taken) {
  const upper = real.toUpperCase();
  for (let attempt = 0; attempt < 1000; attempt++) {
    const chars = upper.split('');
    for (let i = 3; i < 17; i++) {
      if (i === 8 || i === 9 || i === 10) continue;
      chars[i] = charLike(random, upper[i], VIN_LETTERS, DIGITS);
    }
    chars[8] = '0';
    chars[8] = vinCheckDigit(chars.join(''));
    const out = chars.join('');
    if (!taken.has(out) && out !== upper) return out;
  }
  throw new Error('Could not make a unique fake VIN.');
}

export function fakePlate(random, real, taken) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const out = real
      .split('')
      .map((ch) => charLike(random, ch, LETTERS, DIGITS))
      .join('');
    if (!taken.has(out) && out !== real) return out;
  }
  throw new Error('Could not make a unique fake plate.');
}

export { ID_ALPHABET };
