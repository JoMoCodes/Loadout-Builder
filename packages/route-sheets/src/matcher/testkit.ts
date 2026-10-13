// Made-up data for the tests: the old app's eight test sheets, as the old parser read them, and
// the made-up drivers and routes. People come from packages/fixtures/manifest.json.

import type { BagRow, OverflowRow, RouteSheet } from '../types';
import type { AssociateInput, RouteInput } from './distribute';

export const ID = {
  abigail: 'A02V4L9HIELIDL',
  adrian: 'A047LNAN5VQIQR',
  amelia: 'A05QUB9XOW4NT1',
  barrett: 'A06A6NS9GC4V0L',
  beatrice: 'A083QLD1CI9YSZ',
  caleb: 'A08Z3QTIYAI58G',
} as const;

/** The driver list, sorted by name like the old parser sorted it. */
export const ASSOCIATES: AssociateInput[] = [
  {
    transporterId: ID.abigail,
    name: 'Abigail Damian Gresham',
    email: 'abigail@example.com',
    status: 'ACTIVE',
  },
  {
    transporterId: ID.adrian,
    name: 'Adrian Danforth',
    email: 'adrian@example.com',
    status: 'ACTIVE',
  },
  { transporterId: ID.amelia, name: 'Amelia Aaron Blackwell', email: '', status: 'ACTIVE' },
  {
    transporterId: ID.barrett,
    name: 'Barrett Ainsworth',
    email: 'barrett@example.com',
    status: 'INACTIVE',
  },
  {
    transporterId: ID.beatrice,
    name: 'Beatrice Redmond',
    email: 'beatrice@example.com',
    status: 'ACTIVE',
  },
];

const one = (transporterId: string, driverName: string) => ({ transporterId, driverName });

/** The old ROUTES_CSV, with the people swapped. */
export const ROUTES: RouteInput[] = [
  { routeCode: 'CX101', drivers: [one(ID.abigail, 'Abigail Gresham')] },
  {
    routeCode: 'CX102',
    drivers: [one(ID.adrian, 'Adrian Danforth'), one(ID.beatrice, 'Beatrice Redmond')],
  },
  {
    routeCode: 'CX103',
    drivers: [one(ID.amelia, 'Amelia Blackwell'), one(ID.beatrice, 'Beatrice Redmond')],
  },
  { routeCode: 'CX104', drivers: [one(ID.barrett, 'Barrett Ainsworth')] },
  { routeCode: 'CX105', drivers: [one(ID.caleb, 'Caleb Eldridge')] },
  { routeCode: 'CX106', drivers: [one(ID.abigail, 'Abigail Gresham')] },
  { routeCode: 'CX999', drivers: [one(ID.abigail, 'Abigail Gresham')] },
];

interface Spec {
  routeCode: string;
  staging: string;
  service: string;
  wave: string;
  bags: [string, string, string, string][];
  overflow: [string, string, string][];
  total: number;
  commercial: number;
}

const SPECS: Spec[] = [
  {
    routeCode: 'CX101',
    staging: 'STG.A1.1',
    service: 'Standard Parcel Electric - Rivian MEDIUM',
    wave: '09:50 AM',
    bags: [
      ['1', 'A-1.1A', 'Green 1069', '18'],
      ['2', '', 'Orange 5270', '11'],
      ['3', 'A-1.3A', 'Navy 0566', '5'],
    ],
    overflow: [
      ['1', 'A-99.JW', '1'],
      ['2', 'A-6.3U', '2'],
    ],
    total: 37,
    commercial: 4,
  },
  {
    routeCode: 'CX102',
    staging: 'STG.A2.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'B-1.1A', 'Yellow 1', '10']],
    overflow: [['1', 'B-9.9X', '3']],
    total: 13,
    commercial: 0,
  },
  {
    routeCode: 'CX103',
    staging: 'STG.A3.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'C-1.1A', 'Black 7', '10']],
    overflow: [['1', 'C-9.9X', '3']],
    total: 13,
    commercial: 0,
  },
  {
    routeCode: 'CX104',
    staging: 'STG.A4.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'D-1.1A', 'Black 8', '10']],
    overflow: [],
    total: 10,
    commercial: 0,
  },
  {
    routeCode: 'CX105',
    staging: 'STG.A5.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'E-1.1A', 'Black 9', '10']],
    overflow: [],
    total: 10,
    commercial: 0,
  },
  {
    routeCode: 'CX106',
    staging: 'STG.A6.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'F-1.1A', 'Black 1', '10']],
    overflow: [],
    total: 10,
    commercial: 0,
  },
  // In the PDF but not on the routes file:
  {
    routeCode: 'CX107',
    staging: 'STG.A7.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'G-1.1A', 'Black 2', '10']],
    overflow: [],
    total: 10,
    commercial: 0,
  },
  // Numbers deliberately do not add up (total says 99):
  {
    routeCode: 'CX108',
    staging: 'STG.A8.1',
    service: 'Standard Parcel',
    wave: '09:55 AM',
    bags: [['1', 'H-1.1A', 'Black 3', '10']],
    overflow: [],
    total: 99,
    commercial: 0,
  },
];

function sheetFrom(s: Spec, position: number): RouteSheet {
  const bags: BagRow[] = s.bags.map((b) => ({
    index: Number(b[0]),
    sortZone: b[1],
    bag: b[2],
    packages: Number(b[3]),
  }));
  const overflow: OverflowRow[] = s.overflow.map((o) => ({
    index: Number(o[0]),
    sortZone: o[1],
    packages: Number(o[2]),
  }));
  const bagPackages = bags.reduce((a, b) => a + b.packages, 0);
  const overflowPackages = overflow.reduce((a, o) => a + o.packages, 0);
  const problems: string[] = [];
  if (bagPackages + overflowPackages !== s.total)
    problems.push(
      `Bags (${bagPackages}) + overflow (${overflowPackages}) = ${bagPackages + overflowPackages}, but Total Packages says ${s.total}`,
    );
  const notes = bags
    .filter((b) => !b.sortZone)
    .map((b) => `Bag #${b.index} (${b.bag}) has no Sort Zone printed on the sheet`);
  return {
    pageNumber: position + 1,
    pageNumbers: [position + 1],
    routeCode: s.routeCode,
    staging: s.staging,
    dsp: 'XXXX',
    serviceType: s.service,
    station: 'XXX1',
    weekday: 'THU',
    date: '2026-09-24',
    dateLabel: 'THU, SEP 24, 2026',
    cycle: 'CYCLE_1',
    waveTime: s.wave,
    bagCount: bags.length,
    overflowCount: overflowPackages,
    bags,
    overflow,
    totalPackages: s.total,
    commercialPackages: s.commercial,
    check: { ok: problems.length === 0, problems, notes, bagPackages, overflowPackages },
  };
}

/** The eight sheets, as the old parser read them from the old test PDF. */
export const SHEETS: RouteSheet[] = SPECS.map(sheetFrom);
