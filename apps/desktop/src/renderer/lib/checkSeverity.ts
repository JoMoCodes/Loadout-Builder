// How bad a roster row's Check text is, ported from the old Roster tab: problems are red,
// warnings amber, and "OK" (or nothing) is fine. The words come from the core's check text.

export type Severity = 'bad' | 'warn' | '';

const BAD_MARKERS = ['No associate', 'Ambiguous', 'Not ', 'expired', 'Not an associate'];
const WARN_MARKERS = ['expires in', 'Inactive', 'Verify', 'No qualifications'];

export function checkSeverity(check: string): Severity {
  if (BAD_MARKERS.some((marker) => check.includes(marker))) return 'bad';
  if (WARN_MARKERS.some((marker) => check.includes(marker))) return 'warn';
  return '';
}
