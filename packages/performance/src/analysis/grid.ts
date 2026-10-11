// The Drivers grid for a week range, the way the old main window filled it: every driver with
// their newest scorecard, plus their averages, trend and safety counts over the range.

import type { PerfData } from '../models';
import {
  computeAverages,
  computeSafetyCounts,
  driverGridRow,
  getAllWithLatest,
  type DriverGridRow,
} from './drivers';
import { computeTrends } from './fleet';

/**
 * Every driver as a grid row for the week range, sorted by name. A missing or back-to-front
 * range (from after to) shows every range column as empty, as the old grid did.
 */
export function buildDriverGrid(
  data: PerfData,
  fromWeek: string | null,
  toWeek: string | null,
): DriverGridRow[] {
  const drivers = getAllWithLatest(data);
  const valid = !!fromWeek && !!toWeek && fromWeek <= toWeek;
  if (!valid) return drivers.map((driver) => driverGridRow(driver));
  const averages = computeAverages(data, fromWeek, toWeek);
  const trends = computeTrends(data, fromWeek, toWeek);
  const safety = computeSafetyCounts(data, fromWeek, toWeek);
  return drivers.map((driver) =>
    driverGridRow(
      driver,
      averages[driver.transporterId],
      trends[driver.transporterId],
      safety[driver.transporterId],
    ),
  );
}
