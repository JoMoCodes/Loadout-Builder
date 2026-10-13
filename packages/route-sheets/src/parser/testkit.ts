// The made-up sheets the PDF tests draw (the old app's own test sheets, with the fixture station
// and DSP). Table rows are [index, sortZone, bag, pkgs] and [index, sortZone, pkgs].

import type { RouteSheetSpec } from '../../../fixtures/make-route-sheets.mjs';

/** A route sheet page laid out like the real ones (US Letter, two columns). */
export const SHEETS: RouteSheetSpec[] = [
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
  // Numbers deliberately don't add up (total says 99):
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
