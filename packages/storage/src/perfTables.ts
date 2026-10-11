// How each weekly performance table (migration step 2) lines up with the old Weekly
// Performance app's table and with the row shapes in @loadout/performance.
//
// Each column is listed once as [our column, the field name in the row shapes]. The old app's
// column name is the field name with a capital first letter ("transporterId" ->
// "TransporterId"), so one list serves reading, writing and bringing old data over.

import type { PerfTable } from './migrations';

export interface PerfTableSpec {
  table: PerfTable;
  /** The table's name in the old app's database. */
  legacy: string;
  /** [column, field] pairs, in table order. */
  columns: ReadonlyArray<readonly [string, string]>;
  /** True when the table has an autoincrement `id` (its rows keep their old ids when brought over). */
  autoId: boolean;
}

const c = (...pairs: Array<readonly [string, string]>) => pairs;

export const PERF_TABLE_SPECS: readonly PerfTableSpec[] = [
  {
    table: 'perf_drivers',
    legacy: 'Drivers',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['name', 'name'],
      ['status', 'status'],
      ['position', 'position'],
      ['qualifications', 'qualifications'],
      ['id_expiration', 'idExpiration'],
      ['personal_phone', 'personalPhone'],
      ['work_phone', 'workPhone'],
      ['email', 'email'],
    ),
  },
  {
    table: 'perf_weekly_scorecards',
    legacy: 'WeeklyScorecards',
    autoId: true,
    columns: c(
      ['id', 'id'],
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['overall_standing', 'overallStanding'],
      ['overall_score', 'overallScore'],
      ['packages_delivered', 'packagesDelivered'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_metric_entries',
    legacy: 'MetricEntries',
    autoId: true,
    columns: c(
      ['id', 'id'],
      ['scorecard_id', 'scorecardId'],
      ['metric_name', 'metricName'],
      ['metric_value', 'metricValue'],
      ['tier', 'tier'],
      ['score', 'score'],
      ['weight_applied', 'weightApplied'],
    ),
  },
  {
    table: 'perf_metric_thresholds',
    legacy: 'MetricThresholds',
    autoId: false,
    columns: c(
      ['metric_name', 'metricName'],
      ['indicator', 'indicator'],
      ['platinum_threshold', 'platinumThreshold'],
      ['gold_threshold', 'goldThreshold'],
      ['silver_threshold', 'silverThreshold'],
      ['bronze_threshold', 'bronzeThreshold'],
      ['overall_metric_weight', 'overallMetricWeight'],
      ['source_week', 'sourceWeek'],
      ['imported_at', 'importedAt'],
    ),
  },
  {
    table: 'perf_pod_week_entries',
    legacy: 'PodWeekEntries',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['opportunities', 'opportunities'],
      ['success', 'success'],
      ['bypass', 'bypass'],
      ['rejects', 'rejects'],
      ['blurry_photo', 'blurryPhoto'],
      ['human_in_the_picture', 'humanInThePicture'],
      ['no_package_detected', 'noPackageDetected'],
      ['package_in_car', 'packageInCar'],
      ['package_in_hand', 'packageInHand'],
      ['package_not_clearly_visible', 'packageNotClearlyVisible'],
      ['package_too_close', 'packageTooClose'],
      ['photo_too_dark', 'photoTooDark'],
      ['other', 'other'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_cdf_week_entries',
    legacy: 'CdfWeekEntries',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['mishandled', 'mishandled'],
      ['unprofessional', 'unprofessional'],
      ['did_not_follow_instructions', 'didNotFollowInstructions'],
      ['wrong_address', 'wrongAddress'],
      ['never_received', 'neverReceived'],
      ['wrong_item', 'wrongItem'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_dsb_week_entries',
    legacy: 'DsbWeekEntries',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['simultaneous_deliveries', 'simultaneousDeliveries'],
      ['delivered_over_50m', 'deliveredOver50m'],
      ['incorrect_scan_attended', 'incorrectScanAttended'],
      ['incorrect_scan_unattended', 'incorrectScanUnattended'],
      ['no_pod_on_delivery', 'noPodOnDelivery'],
      ['scanned_not_delivered_not_returned', 'scannedNotDeliveredNotReturned'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_psb_week_entries',
    legacy: 'PsbWeekEntries',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['early_arrivals', 'earlyArrivals'],
      ['late_arrivals', 'lateArrivals'],
      ['geo_location', 'geoLocation'],
      ['not_attempted', 'notAttempted'],
      ['contact_compliance', 'contactCompliance'],
      ['out_of_return_label', 'outOfReturnLabel'],
      ['picked_up_not_returned', 'pickedUpNotReturned'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_psb_imported_weeks',
    legacy: 'PsbImportedWeeks',
    autoId: false,
    columns: c(['week', 'week'], ['source_file', 'sourceFile'], ['imported_at', 'importedAt']),
  },
  {
    table: 'perf_dcr_events',
    legacy: 'DcrEvents',
    autoId: true,
    columns: c(
      ['id', 'id'],
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['tracking_id', 'trackingId'],
      ['impact_dcr', 'impactDcr'],
      ['rts_code', 'rtsCode'],
      ['additional_information', 'additionalInformation'],
      ['exemption_reason', 'exemptionReason'],
      ['planned_delivery_date', 'plannedDeliveryDate'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_dcr_week_totals',
    legacy: 'DcrWeekTotals',
    autoId: false,
    columns: c(
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['dcr', 'dcr'],
      ['packages_dispatched', 'packagesDispatched'],
      ['packages_delivered', 'packagesDelivered'],
      ['packages_returned_to_station', 'packagesReturnedToStation'],
      ['packages_returned_to_station_da_controllable', 'packagesReturnedToStationDaControllable'],
      ['rescued_packages', 'rescuedPackages'],
      ['rts_all_exempted', 'rtsAllExempted'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_safety_events',
    legacy: 'SafetyEvents',
    autoId: true,
    columns: c(
      ['id', 'id'],
      ['transporter_id', 'transporterId'],
      ['week', 'week'],
      ['name', 'name'],
      ['event_date', 'eventDate'],
      ['program_impact', 'programImpact'],
      ['metric_type', 'metricType'],
      ['metric_subtype', 'metricSubtype'],
      ['source', 'source'],
      ['video_link', 'videoLink'],
      ['review_details', 'reviewDetails'],
      ['source_file', 'sourceFile'],
    ),
  },
  {
    table: 'perf_imported_files',
    legacy: 'ImportedFiles',
    autoId: false,
    columns: c(
      ['source', 'source'],
      ['file_name', 'fileName'],
      ['file_size', 'fileSize'],
      ['last_write_utc_ticks', 'lastWriteUtcTicks'],
      ['imported_at_utc', 'importedAtUtc'],
    ),
  },
];

export function perfTableSpec(table: PerfTable): PerfTableSpec {
  const spec = PERF_TABLE_SPECS.find((s) => s.table === table);
  if (!spec) throw new Error(`No layout for ${table}`);
  return spec;
}

/** The old app's column name for a field ("transporterId" -> "TransporterId"). */
export function legacyColumn(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}
