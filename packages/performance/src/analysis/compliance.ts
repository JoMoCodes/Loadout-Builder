// ID expiry for every driver, ported from ComplianceEvaluator.cs. Works on the driver list
// alone; "today" is passed in so the result does not depend on the clock.

import { effectiveStatus, parseIdExpiration, type DriverRecord } from '../models';
import { compareOrdinalIgnoreCase, daysBetween, sortedBy } from './dotnet';

export type ComplianceSeverity = 'Expired' | 'Expiring soon' | 'OK' | 'Unknown';

/** The old app's default "expiring soon" window, in days (PdfSettings.cs). */
export const DEFAULT_COMPLIANCE_WINDOW_DAYS = 30;

/** Sort key of a row with no readable date (.NET's int.MaxValue): such rows go last. */
const UNKNOWN_SORT_KEY = 2147483647;

/** One driver's ID expiry status. */
export interface ComplianceAlert {
  transporterId: string;
  name: string;
  /** Status, upper case; blank means "OFFBOARDED". */
  status: string;
  qualifications: string | null;
  /** The roster's "ID expiration" text as written ("" when blank). */
  idExpirationRaw: string;
  /** "YYYY-MM-DD", or null when there is no readable date. */
  expiresOn: string | null;
  /** Days from `asOf` to the expiry date; negative when already expired. */
  daysRemaining: number | null;
  severity: ComplianceSeverity;
  /** True for Expired and Expiring soon: the rows worth acting on. */
  isAlert: boolean;
  /** The date, or the text as written, or "(none on file)". */
  expiresOnDisplay: string;
  /** "Expired 21 day(s) ago", "Expires in 5 day(s)", "Valid (300 day(s) left)", ... */
  statusDisplay: string;
  /** Expired first (most days past), then soonest to expire; unknown last. */
  sortKey: number;
}

function statusDisplay(severity: ComplianceSeverity, days: number | null): string {
  switch (severity) {
    case 'Expired':
      return days !== null ? `Expired ${-days} day(s) ago` : 'Expired';
    case 'Expiring soon':
      return days !== null ? `Expires in ${days} day(s)` : 'Expiring soon';
    case 'OK':
      return days !== null ? `Valid (${days} day(s) left)` : 'Valid';
    default:
      return 'Unknown / unparseable';
  }
}

/**
 * Every driver's ID expiry against `asOf` ("YYYY-MM-DD", the day to count from): Expired when
 * the date has passed, Expiring soon within `windowDays`, OK further out, Unknown when blank or
 * not a date. Most urgent first, then by name.
 */
export function evaluateCompliance(
  drivers: readonly Pick<
    DriverRecord,
    'transporterId' | 'name' | 'status' | 'qualifications' | 'idExpiration'
  >[],
  windowDays: number,
  asOf: string,
): ComplianceAlert[] {
  const alerts = drivers.map((d): ComplianceAlert => {
    const raw = d.idExpiration ?? '';
    const expiresOn = parseIdExpiration(d.idExpiration);
    let daysRemaining: number | null = null;
    let severity: ComplianceSeverity = 'Unknown';
    if (expiresOn !== null) {
      daysRemaining = daysBetween(asOf, expiresOn);
      severity =
        daysRemaining < 0 ? 'Expired' : daysRemaining <= windowDays ? 'Expiring soon' : 'OK';
    }
    return {
      transporterId: d.transporterId,
      name: d.name,
      status: effectiveStatus(d),
      qualifications: d.qualifications,
      idExpirationRaw: raw,
      expiresOn,
      daysRemaining,
      severity,
      isAlert: severity === 'Expired' || severity === 'Expiring soon',
      expiresOnDisplay: expiresOn ?? (raw.trim() === '' ? '(none on file)' : raw),
      statusDisplay: statusDisplay(severity, daysRemaining),
      sortKey: severity === 'Unknown' ? UNKNOWN_SORT_KEY : (daysRemaining ?? UNKNOWN_SORT_KEY),
    };
  });
  return sortedBy(
    alerts,
    (a, b) => a.sortKey - b.sortKey || compareOrdinalIgnoreCase(a.name, b.name),
  );
}
