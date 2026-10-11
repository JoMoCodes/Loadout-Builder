// Everything the weekly performance numbers are worked out from, as plain lists: one list per
// table of the old app's database. The storage layer reads these from the saved data; the
// analysis functions take them and change nothing. Tests build them straight from the importers.

import type {
  CdfWeekEntry,
  DcrEventEntry,
  DcrWeekTotals,
  DriverRecord,
  DsbWeekEntry,
  MetricEntry,
  MetricThreshold,
  PodWeekEntry,
  PsbImportedWeek,
  PsbWeekEntry,
  SafetyEventEntry,
  WeeklyScorecard,
} from './types';

export interface PerfData {
  drivers: DriverRecord[];
  scorecards: WeeklyScorecard[];
  metrics: MetricEntry[];
  thresholds: MetricThreshold[];
  pod: PodWeekEntry[];
  cdf: CdfWeekEntry[];
  dsb: DsbWeekEntry[];
  psb: PsbWeekEntry[];
  psbImportedWeeks: PsbImportedWeek[];
  dcrEvents: DcrEventEntry[];
  dcrTotals: DcrWeekTotals[];
  safetyEvents: SafetyEventEntry[];
}

/** No data at all (a fresh database). */
export function emptyPerfData(): PerfData {
  return {
    drivers: [],
    scorecards: [],
    metrics: [],
    thresholds: [],
    pod: [],
    cdf: [],
    dsb: [],
    psb: [],
    psbImportedWeeks: [],
    dcrEvents: [],
    dcrTotals: [],
    safetyEvents: [],
  };
}
