// The numbers worked out from the saved weekly performance data: the old app's repository
// reads, the coaching rules and the ID-expiry check, as pure functions over PerfData.

export * from './drivers';
export * from './thresholds';
export * from './fleet';
export * from './grid';
export * from './coaching';
export * from './explain';
export * from './compliance';
export * from './snapshot';
export {
  compareNoCase,
  compareOrdinal,
  compareOrdinalIgnoreCase,
  formatNet,
  formatNetRoundTrip,
} from './dotnet';
