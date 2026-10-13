// The join between the app's own data and the matcher, checked against what the old app's own
// readers made of the same made-up files (scripts/parity/rsd/expected/<day>/inputs.json).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importAssociateData, importRouteExport } from '@loadout/core/importers';
import { describe, expect, it } from 'vitest';
import type { AssociateInput, RouteInput } from '../matcher/distribute';
import {
  associatesFromBook,
  clockKey,
  hasRouteDrivers,
  routesFromRouteSet,
  unmatchedWaves,
  wavePadsFromRouteSet,
  type RouteRowLike,
} from './join';

const repo = (...parts: string[]) =>
  fileURLToPath(new URL(`../../../../${parts.join('/')}`, import.meta.url));

interface Inputs {
  routes: RouteInput[];
  associates: Array<AssociateInput & Record<string, unknown>>;
  twists: {
    inactiveId: string;
    missingId: string;
    noIdRoute: string;
    wrongNameRoute: string;
    noEmailId: string;
  };
}

const DAYS = [
  { day: '2026-09-01', routesFile: 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx' },
  { day: '2026-09-25', routesFile: 'Routes_XXX1_2026-09-25_09_54 (CDT).xlsx' },
];

function inputs(day: string): Inputs {
  const file = repo('scripts', 'parity', 'rsd', 'expected', day, 'inputs.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Inputs;
}

function row(values: Partial<RouteRowLike>): RouteRowLike {
  return {
    transporterId: '',
    driverName: '',
    routeCode: '',
    dispatchTime: '',
    serviceType: '',
    sharedDrivers: '',
    sharedIds: '',
    pad: '',
    ...values,
  };
}

describe('the join with the Route Data page', () => {
  it.each(DAYS)(
    'the Routes export read by the app gives the old reader’s routes ($day)',
    async ({ day, routesFile }) => {
      const set = await importRouteExport(
        'routes',
        repo('packages', 'fixtures', 'routes', routesFile),
      );
      const { routes: expected, twists } = inputs(day);
      const ours = routesFromRouteSet(set);
      expect(ours.map((r) => r.routeCode)).toEqual(expected.map((r) => r.routeCode));
      // The core does not keep the DSP column (the matcher never reads it), so it is left out.
      const withoutDsp = (r: RouteInput) => ({ ...r, dsp: undefined });
      for (const [index, theirs] of expected.entries()) {
        const mine = ours[index]!;
        if (theirs.routeCode === twists.noIdRoute || theirs.routeCode === twists.wrongNameRoute) {
          // inputs.json blanked this route's IDs or gave it another person's name: only the
          // route code can be compared.
          expect(mine.routeCode).toBe(theirs.routeCode);
          continue;
        }
        expect(withoutDsp(mine), theirs.routeCode).toEqual(withoutDsp(theirs));
      }
      expect(hasRouteDrivers(set)).toBe(true);
    },
  );

  it('the driver list read by the app gives the old reader’s list', async () => {
    const book = await importAssociateData(
      repo('packages', 'fixtures', 'associates', 'AssociateData.csv'),
    );
    const { associates: expected, twists } = inputs('2026-09-01');
    // Undo what inputs.json did to the list: one driver marked INACTIVE, one taken off, one
    // email blanked. Every other field is compared as it is.
    const ours = associatesFromBook(book)
      .filter((a) => a.transporterId !== twists.missingId)
      .map((a) => (a.transporterId === twists.inactiveId ? { ...a, status: 'INACTIVE' } : a))
      .map((a) => (a.transporterId === twists.noEmailId ? { ...a, email: '' } : a));
    expect(ours).toEqual(
      expected.map((a) => ({
        transporterId: a.transporterId,
        name: a.name,
        email: a.email,
        status: a.status,
      })),
    );
  });

  it('pairs pipe-joined IDs and names in order, and merges a route code that comes twice', () => {
    const routes = routesFromRouteSet({
      rows: [
        row({
          routeCode: ' cx1 ',
          sharedIds: 'aaaa1111|BBBB2222',
          sharedDrivers: 'Adrian  Danforth|Barrett Ainsworth|Caleb Eldridge',
          dispatchTime: '9:50am',
          serviceType: 'Standard Parcel',
        }),
        row({
          routeCode: 'CX1',
          sharedIds: 'BBBB2222|DDDD4444',
          sharedDrivers: 'B|Beatrice Redmond',
        }),
        row({ routeCode: 'CX2', transporterId: 'EEEE5555', driverName: 'Abigail Gresham' }),
        row({ routeCode: '', transporterId: 'FFFF6666' }),
        row({ routeCode: 'CX3' }),
      ],
    });
    expect(routes).toEqual([
      {
        routeCode: 'CX1',
        drivers: [
          { transporterId: 'AAAA1111', driverName: 'Adrian Danforth' },
          { transporterId: 'BBBB2222', driverName: 'Barrett Ainsworth' },
          { transporterId: '', driverName: 'Caleb Eldridge' },
          { transporterId: 'DDDD4444', driverName: 'Beatrice Redmond' },
        ],
        dsp: '',
        serviceType: 'Standard Parcel',
        plannedDeparture: '9:50am',
      },
      {
        routeCode: 'CX2',
        drivers: [{ transporterId: 'EEEE5555', driverName: 'Abigail Gresham' }],
        dsp: '',
        serviceType: '',
        plannedDeparture: '',
      },
      { routeCode: 'CX3', drivers: [], dsp: '', serviceType: '', plannedDeparture: '' },
    ]);
    expect(hasRouteDrivers({ rows: [row({ transporterId: 'AAAA1111' })] })).toBe(false);
  });

  it('reads a blank status as UNKNOWN, leaves out rows with no ID, keeps the first of a repeat', () => {
    expect(
      associatesFromBook({
        rows: [
          {
            transporterId: 'bbbb2222',
            name: 'Amelia  Blackwell',
            email: ' z@example.com ',
            status: '',
          },
          { transporterId: '', name: 'Caleb Eldridge', email: '', status: 'ACTIVE' },
          { transporterId: 'AAAA1111', name: 'Adrian Danforth', email: '', status: 'active' },
          { transporterId: 'BBBB2222', name: 'Barrett Ainsworth', email: '', status: 'ACTIVE' },
        ],
      }),
    ).toEqual([
      { transporterId: 'AAAA1111', name: 'Adrian Danforth', email: '', status: 'ACTIVE' },
      {
        transporterId: 'BBBB2222',
        name: 'Amelia Blackwell',
        email: 'z@example.com',
        status: 'UNKNOWN',
      },
    ]);
  });
});

describe('wave times and pads', () => {
  it('reads a clock time however it is written', () => {
    expect(clockKey('09:50 AM')).toBe('09:50');
    expect(clockKey('9:50am')).toBe('09:50');
    expect(clockKey('9:50 AM')).toBe('09:50');
    expect(clockKey('09:50')).toBe('09:50');
    expect(clockKey('2:30pm')).toBe('14:30');
    expect(clockKey('02:30 PM')).toBe('14:30');
    expect(clockKey('14:30')).toBe('14:30');
    expect(clockKey('12:05 AM')).toBe('00:05');
    expect(clockKey('12:05 pm')).toBe('12:05');
    for (const bad of ['', null, undefined, 'soon', '25:00', '13:00 PM', '9:75am']) {
      expect(clockKey(bad)).toBeNull();
    }
  });

  it('takes each wave’s pad from the route data by clock value, else the typed one', () => {
    const set = {
      rows: [
        row({ routeCode: 'CX1', dispatchTime: '10:20am' }),
        row({ routeCode: 'CX2', dispatchTime: '10:25am', pad: '3' }),
        row({ routeCode: 'CX3', dispatchTime: '10:25am' }),
        row({ routeCode: 'CX4', dispatchTime: '2:30pm' }),
      ],
      pads: new Map([
        ['10:20am', 1],
        ['10:25am', 2],
      ]),
    };
    const waves = ['10:20 AM', '10:25 AM', '02:30 PM', '11:00 AM'];
    // A pad carried by the row wins over its time's (the core's padFor rule).
    expect(wavePadsFromRouteSet(waves, set)).toEqual({ '10:20 AM': '1', '10:25 AM': '3' });
    expect(
      wavePadsFromRouteSet(waves, set, { '11:00 AM': 'B12', '10:20 AM': '9', '02:30 PM': '' }),
    ).toEqual({ '10:20 AM': '1', '10:25 AM': '3', '11:00 AM': 'B12' });
    expect(wavePadsFromRouteSet(waves, null, { '02:30 PM': '4' })).toEqual({ '02:30 PM': '4' });
    expect(unmatchedWaves(waves, set)).toEqual(['11:00 AM']);
    expect(unmatchedWaves(waves, null)).toEqual(waves);
  });
});
