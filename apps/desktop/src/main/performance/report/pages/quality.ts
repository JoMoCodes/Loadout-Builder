// The CDF, DSB, POD and PSB pages: the metric's thresholds row, one table with the weekly
// detail row and the counts per category, then (CDF, DSB, PSB) what each category means.

import {
  cdfCategoryRows,
  dsbCategoryRows,
  formatNet,
  podRejectCategoryRows,
  psbCategoryRows,
  type CategoryRow,
  type PsbWeekEntry,
} from '@loadout/performance';
import type { Palette } from '../colours';
import { esc, formatN0 } from '../format';
import type { ReportModel } from '../model';
import {
  directionOf,
  metricCells,
  metricRow,
  metricThresholds,
  plainRow,
  weekTable,
} from '../tables';

/** One row per category, counts across the weeks (labels taken from an all-zero row). */
function categoryRows<T>(
  entries: readonly T[],
  rowsOf: (entry: T) => CategoryRow[],
  empty: T,
  options: { smallLabel?: boolean },
  p: Palette,
): string {
  return rowsOf(empty)
    .map(([label], index) =>
      plainRow(
        label,
        entries.map((e) => String(rowsOf(e)[index]?.[1] ?? 0)),
        { reject: true, tall: true, ...options },
        p,
      ),
    )
    .join('');
}

function headerStyle(p: Palette): string {
  return `background:${esc(p.headerBackground)};color:${esc(p.headerForeground)};border-color:${esc(p.border)}`;
}

/** A reference table under a page: header cells and rows of plain text. */
function referenceTable(
  className: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  p: Palette,
): string {
  const border = `border-color:${esc(p.border)}`;
  return (
    `<table class="ref ${className}"><thead><tr>` +
    headers.map((h) => `<th style="${headerStyle(p)}">${esc(h)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (row) =>
          '<tr>' + row.map((text) => `<td style="${border}">${esc(text)}</td>`).join('') + '</tr>',
      )
      .join('') +
    '</tbody></table>'
  );
}

// ---- CDF ----

const CDF_LEGEND: readonly (readonly [string, string])[] = [
  [
    'DA Mishandled Package',
    'Driver threw package; Driver dropped package; Driver left package in bad weather',
  ],
  [
    'DA was Unprofessional',
    "Driver wasn't wearing Amazon attire; Driver was playing loud/inappropriate music; Driver showed potentially unsafe driving behaviors; Driver used inappropriate language; Driver walked on grass/mulch; Driver was talking on phone",
  ],
  [
    'DA did not follow my delivery instructions',
    'Package not left in specific place I requested; Package not delivered according to instruction notes I provided; Package not left in appropriate location',
  ],
  [
    'Delivered to Wrong Address',
    'Delivered to wrong unit number; Delivered to wrong street address; Delivered to neighboring address',
  ],
  [
    'Never Received Delivery',
    'Package is not in location shown in delivery photo; Package was not delivered to location provided in instructions',
  ],
  ['Received Wrong Item', "Received someone else's package"],
];

export function cdfPage(model: ReportModel, p: Palette): string {
  const empty = model.cdf[0] ?? {
    transporterId: '',
    week: '',
    name: '',
    mishandled: 0,
    unprofessional: 0,
    didNotFollowInstructions: 0,
    wrongAddress: 0,
    neverReceived: 0,
    wrongItem: 0,
    sourceFile: null,
  };
  const rows =
    metricRow('CDF DPMO', directionOf('CDF DPMO'), metricCells(model, 'CDF DPMO'), p) +
    categoryRows(model.cdf, cdfCategoryRows, empty, { smallLabel: true }, p);
  return (
    metricThresholds(model.thresholds, 'CDF DPMO', p) +
    weekTable(
      'Week',
      model.cdf.map((e) => e.week),
      rows,
      p,
    ) +
    referenceTable('cdf-legend', ['Category', 'Sub-Reasons'], CDF_LEGEND, p)
  );
}

// ---- DSB ----

const DSB_LEGEND: readonly (readonly [string, string, string])[] = [
  [
    '1',
    'Simultaneous Deliveries',
    'DNR concessions from group stop deliveries where multiple packages were swiped to complete at the same time. Does NOT apply to packages delivered to mailroom (including apartments), receptionist, or a customer at the same address.',
  ],
  [
    '2',
    'Completed Delivery >50 Meters',
    'DNR concessions on packages marked as delivered more than 50 meters from the Geopin location provided to the DA in the Delivery App.',
  ],
  [
    '3',
    'Incorrect Scan Usage – Attended Deliveries',
    'DNR concessions on packages marked as: Delivered to Household Member, Delivered to Receptionist, Delivered to Mailroom Clerk, Delivered to Customer, Delivered to Security Guard, Delivered to Property Office, or Delivered to Other as Instructed.',
  ],
  [
    '4',
    'Incorrect Scan Usage – Unattended Deliveries',
    'DNR concessions where the DA did not follow the recommended delivery location shown in the Delivery App.',
  ],
  [
    '5',
    'No-POD Deliveries',
    'DNR concessions on packages where no Photo on Delivery (POD) was taken.',
  ],
  [
    '6',
    'Scanned – Not Delivered – Not Returned',
    'Lost concessions where a DA marked a package as in-transit and either: (1) the package was never marked delivered/return items/unable to deliver with no return scan, or (2) the package was marked return items/unable to deliver but never received an in-station return scan.',
  ],
];

export function dsbPage(model: ReportModel, p: Palette): string {
  const empty = model.dsb[0] ?? {
    transporterId: '',
    week: '',
    name: '',
    simultaneousDeliveries: 0,
    deliveredOver50m: 0,
    incorrectScanAttended: 0,
    incorrectScanUnattended: 0,
    noPodOnDelivery: 0,
    scannedNotDeliveredNotReturned: 0,
    sourceFile: null,
  };
  const rows =
    metricRow('DSB', directionOf('DSB'), metricCells(model, 'DSB'), p) +
    categoryRows(model.dsb, dsbCategoryRows, empty, {}, p);
  return (
    metricThresholds(model.thresholds, 'DSB', p) +
    weekTable(
      'Week',
      model.dsb.map((e) => e.week),
      rows,
      p,
    ) +
    referenceTable('numbered', ['#', 'Defect Category', 'What It Measures'], DSB_LEGEND, p)
  );
}

// ---- POD ----

export function podPage(model: ReportModel, p: Palette): string {
  const pod = model.pod;
  const empty = pod[0] ?? {
    transporterId: '',
    week: '',
    name: '',
    opportunities: 0,
    success: 0,
    bypass: 0,
    rejects: 0,
    blurryPhoto: 0,
    humanInThePicture: 0,
    noPackageDetected: 0,
    packageInCar: 0,
    packageInHand: 0,
    packageNotClearlyVisible: 0,
    packageTooClose: 0,
    photoTooDark: 0,
    other: 0,
    sourceFile: null,
  };
  const rows =
    metricRow('POD', directionOf('POD'), metricCells(model, 'POD'), p) +
    plainRow(
      'Opportunities',
      pod.map((e) => formatN0(e.opportunities)),
      {},
      p,
    ) +
    plainRow(
      'Success',
      pod.map((e) => formatN0(e.success)),
      {},
      p,
    ) +
    plainRow(
      'Bypass',
      pod.map((e) => formatN0(e.bypass)),
      { reject: true },
      p,
    ) +
    plainRow(
      'Rejects',
      pod.map((e) => formatN0(e.rejects)),
      { reject: true },
      p,
    ) +
    plainRow(
      'Acceptance %',
      pod.map((e) => (e.acceptanceRate === null ? '—' : `${formatNet(e.acceptanceRate, '0.00')}%`)),
      { emphasize: true },
      p,
    ) +
    podRejectCategoryRows(empty)
      .map(([label], index) =>
        plainRow(
          label,
          pod.map((e) => String(podRejectCategoryRows(e)[index]?.[1] ?? 0)),
          { reject: true },
          p,
        ),
      )
      .join('');
  return (
    metricThresholds(model.thresholds, 'POD', p) +
    weekTable(
      'Week',
      pod.map((e) => e.week),
      rows,
      p,
    )
  );
}

// ---- PSB ----

const PSB_LEGEND: readonly (readonly [string, string, string, string])[] = [
  [
    '1',
    'Time Window Adherence',
    'Whether DAs perform pickups within the promised time window (e.g., SWA: 2:30pm–5:00pm local time, with a 15-min buffer). Pickups or exceptions outside this window are early or late defects.',
    'SWA only',
  ],
  [
    '2',
    'Geo Location Adherence',
    'Whether DAs are within the required distance (meters) of the pickup geo-pin when entering exceptions. Threshold is 500 meters.',
    'All pickup programs',
  ],
  [
    '3',
    'Not Attempted',
    'Failed pickup stops with no relevant action — no package scan and no exception selected by the DA to verify an attempt was made.',
    'All pickup programs',
  ],
  [
    '4',
    'Contact Compliance (CC)',
    'Whether the DA followed contact compliance protocols when selecting specific exception reason codes. DAs must attempt to contact the customer (call for at least 12 seconds, then text if no answer) before marking a failure.',
    'All pickup programs',
  ],
  [
    '5',
    'Picked Up, Not Returned',
    'Packages that were successfully picked up by the DA but not properly returned to the delivery station.',
    'All pickup programs',
  ],
  [
    '6',
    'Out of Return Label Failure',
    'Defect triggered when a DA selects "out_of_return_labels" as the reason for a pickup failure. DAs are expected to collect all necessary return labels before starting their route.',
    'All pickup programs',
  ],
];

const EMPTY_PSB: PsbWeekEntry = {
  transporterId: '',
  week: '',
  name: '',
  earlyArrivals: 0,
  lateArrivals: 0,
  geoLocation: 0,
  notAttempted: 0,
  contactCompliance: 0,
  outOfReturnLabel: 0,
  pickedUpNotReturned: 0,
  sourceFile: null,
};

/**
 * The PSB category rows. A week with no PSB file, or a file the driver was not in, shows a
 * light grey dash (neither counts against the driver); otherwise the count, red when above 0.
 */
function psbRows(model: ReportModel, p: Palette): string {
  const border = `border-color:${esc(p.border)}`;
  return psbCategoryRows(EMPTY_PSB)
    .map(([label], index) => {
      const cells = model.psb
        .map((col) => {
          if (!col.hasFile || col.entry === null) {
            return `<td class="none" style="background:#FFFFFF;color:#9CA3AF;${border}">-</td>`;
          }
          const count = psbCategoryRows(col.entry)[index]?.[1] ?? 0;
          return count > 0
            ? `<td class="bad" style="background:${esc(p.rejectBackground)};color:${esc(p.rejectForeground)};${border}">${count}</td>`
            : `<td style="background:#FFFFFF;color:#374151;${border}">${count}</td>`;
        })
        .join('');
      return `<tr class="plain tall"><td class="lbl" style="${border}">${esc(label)}</td>${cells}</tr>`;
    })
    .join('');
}

export function psbPage(model: ReportModel, p: Palette): string {
  const rows =
    metricRow('PSB', directionOf('PSB'), metricCells(model, 'PSB'), p) + psbRows(model, p);
  return (
    metricThresholds(model.thresholds, 'PSB', p) +
    weekTable(
      'Week',
      model.psb.map((c) => c.week),
      rows,
      p,
    ) +
    referenceTable(
      'numbered psb-legend',
      ['#', 'Defect Category', 'What It Measures', 'Programs Tracked'],
      PSB_LEGEND,
      p,
    )
  );
}
