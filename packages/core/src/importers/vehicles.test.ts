// Tests for the vehicle export reader. The made-up files in packages/fixtures were read with the old Python
// importer and the numbers and sample rows below are what it answered. The inline scenarios were
// built in a temporary folder, run through the old importer too, and its answers copied in.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { category, isRental, manualOnly, serviceTypeCounts } from '../models/vehicles';
import { importVehicleData, VehicleImportError } from './vehicles';
import { fixturePath, runScenario, type Sample, type Scenario } from './testkit';

const FIXTURE: {
  count: number;
  operational: number;
  cats: Array<[string, number]>;
  types: Array<[string, number]>;
  expiry: number;
  ownershipEnd: number;
  rental: number;
  manual: number;
  sample: Sample;
} = {
  count: 41,
  operational: 28,
  cats: [
    ['Branded Van', 30],
    ['Rental Van', 3],
    ['Step Van', 8],
  ],
  types: [
    ['Standard Parcel - Extra Large Van - US', 1],
    ['Standard Parcel - Large Van', 2],
    ['Standard Parcel Electric - Rivian MEDIUM', 28],
    ['Standard Parcel Electric - Rivian SMALL', 2],
    ['Standard Parcel Step Van - US', 8],
  ],
  expiry: 38,
  ownershipEnd: 39,
  rental: 3,
  manual: 2,
  sample: [
    [
      0,
      {
        vin: '7FCDJRA89PN141888',
        name: '619454',
        serviceType: 'Standard Parcel Electric - Rivian MEDIUM',
        serviceTier: 'ELECTRIC_RPV_MEDIUM',
        make: 'Rivian',
        model: 'EDV 700',
        subModel: '2dr Cargo',
        plate: 'XLA3194',
        year: '2023',
        ownership: 'AMAZON_OWNED',
        typeLabel: 'Amazon-owned',
        operational: false,
        status: 'ACTIVE',
        statusNote: '',
        registrationExpiry: '2026-12-30',
        ownershipEnd: '2043-08-08',
        station: 'XXX1',
      },
    ],
    [
      20,
      {
        vin: '7FCJLRK79PN811619',
        name: '615230',
        serviceType: 'Standard Parcel Electric - Rivian MEDIUM',
        serviceTier: 'ELECTRIC_RPV_MEDIUM',
        make: 'Rivian',
        model: 'EDV 700',
        subModel: '2dr Cargo',
        plate: 'QXD5530',
        year: '2023',
        ownership: 'AMAZON_OWNED',
        typeLabel: 'Amazon-owned',
        operational: true,
        status: 'ACTIVE',
        statusNote: '',
        registrationExpiry: '2027-08-30',
        ownershipEnd: '2043-06-20',
        station: 'XXX1',
      },
    ],
    [
      40,
      {
        vin: '1F66B2RY9L0Y83576',
        name: '52',
        serviceType: 'Standard Parcel Step Van - US',
        serviceTier: 'STEP_VAN_MEDIUM',
        make: 'Ford',
        model: 'Stripped Chassis',
        subModel: '4X2 Chassis 178.2-228.2 in. WB',
        plate: '3050728',
        year: '2020',
        ownership: 'AMAZON_LEASED',
        typeLabel: 'Amazon-leased',
        operational: false,
        status: 'ACTIVE',
        statusNote: 'Until 2040-08-27.',
        registrationExpiry: '2027-03-30',
        ownershipEnd: '2040-08-27',
        station: 'XXX1',
      },
    ],
  ],
};

describe('vehicle export fixture', () => {
  it('reads VehiclesData.xlsx', async () => {
    const fleet = await importVehicleData(fixturePath('vehicles', 'VehiclesData.xlsx'));
    expect(fleet.rows).toHaveLength(FIXTURE.count);
    expect(fleet.rows.filter((van) => van.operational)).toHaveLength(FIXTURE.operational);
    expect(fleet.rows.filter((van) => van.registrationExpiry)).toHaveLength(FIXTURE.expiry);
    expect(fleet.rows.filter((van) => van.ownershipEnd)).toHaveLength(FIXTURE.ownershipEnd);
    expect(fleet.rows.filter(isRental)).toHaveLength(FIXTURE.rental);
    expect(fleet.rows.filter(manualOnly)).toHaveLength(FIXTURE.manual);
    expect(Object.fromEntries(serviceTypeCounts(fleet))).toEqual(Object.fromEntries(FIXTURE.types));
    const categories = new Map<string, number>();
    for (const van of fleet.rows)
      categories.set(category(van), (categories.get(category(van)) ?? 0) + 1);
    expect(Object.fromEntries(categories)).toEqual(Object.fromEntries(FIXTURE.cats));
    for (const [index, row] of FIXTURE.sample) expect(fleet.rows[index]).toEqual(row);
  });
});

describe('vehicle export refusals that carry the file', () => {
  it('says so when the file is not there', async () => {
    await expect(importVehicleData(join('nowhere', 'missing.xlsx'))).rejects.toThrow(
      new VehicleImportError(`File not found:\n\n${join('nowhere', 'missing.xlsx')}`),
    );
  });
});

const SCENARIOS: Array<[Scenario, Record<string, unknown>]> = [
  [
    {
      name: 'title rows, dates, statuses, duplicates and blanks',
      importer: 'vehicles',
      file: 'vehicles.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Vehicle Report'],
            [],
            [
              'vin',
              'vehicleName',
              'serviceType',
              'serviceTier',
              'make',
              'model',
              'subModel',
              'licensePlateNumber',
              'year',
              'ownershipType',
              'type',
              'operationalStatus',
              'status',
              'statusReasonMessage',
              'registrationExpiryDate',
              'ownershipEndDate',
              'stationCode',
            ],
            [
              'VINA1',
              '100',
              'Standard Parcel Electric - Rivian MEDIUM',
              'ELECTRIC_RPV_MEDIUM',
              'Rivian',
              'EDV 700',
              '2dr',
              'PLT1',
              2023,
              'AMAZON_OWNED',
              'Amazon-owned',
              'OPERATIONAL',
              'Active',
              'all good',
              '2026-12-01',
              {
                datetime: '2027-01-15 00:00',
              },
              'ST1',
            ],
            [
              'VINA2',
              '101',
              'Standard Parcel Step Van - US',
              'STEP_VAN_MEDIUM',
              'Step',
              'Van  X',
              null,
              ' PLT 2 ',
              2019.0,
              'SELF_OWNED',
              null,
              ' operational ',
              null,
              null,
              '12/1/2026',
              '01/15/27',
              null,
            ],
            ['VINA2', 'dup', 'Standard Parcel Electric - Rivian MEDIUM'],
            [
              'VINA3',
              null,
              'Large Van',
              'LARGE_CARGO_VAN',
              null,
              null,
              null,
              null,
              '2020',
              'AMAZON_RENTAL',
              null,
              'NOT_OPERATIONAL',
              null,
              'in the shop',
              'soon',
              '2026-13-45',
              null,
            ],
            [
              null,
              '200',
              'Nursery Route Level 2 - Electric Vehicle',
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            [null, null, 'orphan'],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
            [null, '200', 'second blank-vin row'],
          ],
        },
      ],
    },
    {
      rows: [
        {
          vin: 'VINA1',
          name: '100',
          serviceType: 'Standard Parcel Electric - Rivian MEDIUM',
          serviceTier: 'ELECTRIC_RPV_MEDIUM',
          make: 'Rivian',
          model: 'EDV 700',
          subModel: '2dr',
          plate: 'PLT1',
          year: '2023',
          ownership: 'AMAZON_OWNED',
          typeLabel: 'Amazon-owned',
          operational: true,
          status: 'Active',
          statusNote: 'all good',
          registrationExpiry: '2026-12-01',
          ownershipEnd: '2027-01-15',
          station: 'ST1',
        },
        {
          vin: 'VINA2',
          name: '101',
          serviceType: 'Standard Parcel Step Van - US',
          serviceTier: 'STEP_VAN_MEDIUM',
          make: 'Step',
          model: 'Van X',
          subModel: '',
          plate: 'PLT 2',
          year: '2019',
          ownership: 'SELF_OWNED',
          typeLabel: '',
          operational: true,
          status: '',
          statusNote: '',
          registrationExpiry: '2026-12-01',
          ownershipEnd: '2027-01-15',
          station: '',
        },
        {
          vin: 'VINA3',
          name: 'VINA3',
          serviceType: 'Large Van',
          serviceTier: 'LARGE_CARGO_VAN',
          make: '',
          model: '',
          subModel: '',
          plate: '',
          year: '2020',
          ownership: 'AMAZON_RENTAL',
          typeLabel: '',
          operational: false,
          status: '',
          statusNote: 'in the shop',
          registrationExpiry: null,
          ownershipEnd: null,
          station: '',
        },
        {
          vin: '',
          name: '200',
          serviceType: 'Nursery Route Level 2 - Electric Vehicle',
          serviceTier: '',
          make: '',
          model: '',
          subModel: '',
          plate: '',
          year: '',
          ownership: '',
          typeLabel: '',
          operational: false,
          status: '',
          statusNote: '',
          registrationExpiry: null,
          ownershipEnd: null,
          station: '',
        },
        {
          vin: '',
          name: '200',
          serviceType: 'second blank-vin row',
          serviceTier: '',
          make: '',
          model: '',
          subModel: '',
          plate: '',
          year: '',
          ownership: '',
          typeLabel: '',
          operational: false,
          status: '',
          statusNote: '',
          registrationExpiry: null,
          ownershipEnd: null,
          station: '',
        },
      ],
    },
  ],
  [
    {
      name: 'other header spellings and column order',
      importer: 'vehicles',
      file: 'vehicles.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['Name', 'VIN', 'Plate', 'Station', 'Status', 'Registration Expiry'],
            ['300', 'VINB1', 'PLT9', 'ST2', 'Parked', '2026-11-30'],
          ],
        },
      ],
    },
    {
      rows: [
        {
          vin: 'VINB1',
          name: '300',
          serviceType: '',
          serviceTier: '',
          make: '',
          model: '',
          subModel: '',
          plate: 'PLT9',
          year: '',
          ownership: '',
          typeLabel: '',
          operational: false,
          status: 'Parked',
          statusNote: '',
          registrationExpiry: '2026-11-30',
          ownershipEnd: null,
          station: 'ST2',
        },
      ],
    },
  ],
  [
    {
      name: 'no header row',
      importer: 'vehicles',
      file: 'vehicles.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            ['vin', 'model'],
            ['VINA1', 'x'],
          ],
        },
      ],
    },
    {
      error:
        "Couldn't find the header row.\n\nExpected a row containing 'vin' and 'vehicleName' - is this a vehicle export?",
    },
  ],
  [
    {
      name: 'an empty sheet',
      importer: 'vehicles',
      file: 'vehicles.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [],
        },
      ],
    },
    {
      error: 'The sheet is empty.',
    },
  ],
  [
    {
      name: 'a header and no vans',
      importer: 'vehicles',
      file: 'vehicles.xlsx',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            [
              'vin',
              'vehicleName',
              'serviceType',
              'serviceTier',
              'make',
              'model',
              'subModel',
              'licensePlateNumber',
              'year',
              'ownershipType',
              'type',
              'operationalStatus',
              'status',
              'statusReasonMessage',
              'registrationExpiryDate',
              'ownershipEndDate',
              'stationCode',
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
            ],
          ],
        },
      ],
    },
    {
      error: 'Found the header row but no vehicle rows below it.',
    },
  ],
];

describe('vehicle export scenarios', () => {
  it.each(SCENARIOS.map(([scenario, expected]) => ({ scenario, expected })))(
    '$scenario.name',
    async ({ scenario, expected }) => {
      expect(await runScenario(scenario)).toEqual(expected);
    },
  );
});
