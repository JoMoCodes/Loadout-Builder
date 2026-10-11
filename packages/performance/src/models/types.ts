// The weekly performance records, as plain data. Ported from the old app's Models.cs.
//
// Field names are the old table columns (legacy/wpa/src/Database.cs) in camelCase, so a row
// from the database and a row from an importer have the same shape. Weeks are always the
// zero-padded "YYYY-Www" text (for example "2026-W07"); see ./week.ts.

/** One row of the Drivers table: who the driver is and how to reach them. */
export interface DriverRecord {
  transporterId: string;
  name: string;
  /** "ACTIVE", "INACTIVE", ... as the roster had it (upper case). Null for a driver only seen on a scorecard. */
  status: string | null;
  position: string | null;
  qualifications: string | null;
  /** The roster's "ID expiration" text, as written (see parseIdExpiration). */
  idExpiration: string | null;
  personalPhone: string | null;
  workPhone: string | null;
  email: string | null;
}

/** A driver with their newest scorecard, as the Drivers grid lists them. */
export interface Driver extends DriverRecord {
  latestWeek: string | null;
  latestTier: string | null;
  latestScore: number | null;
  latestRank: number | null;
  latestRankTotal: number | null;
  latestPackages: number | null;
}

/** A driver's metric averages over a week range. Null where there was nothing to average. */
export interface DriverAverages {
  score: number | null;
  rank: number | null;
  packages: number | null;
  cdf: number | null;
  dsb: number | null;
  dcr: number | null;
  pod: number | null;
  psb: number | null;
  ced: number | null;
}

/** "Improving", "Declining" or "Flat". */
export type TrendDirection = 'Improving' | 'Declining' | 'Flat';

/** A driver's Overall Score movement over a week range. */
export interface DriverTrend {
  /** Change between the two newest scored weeks. */
  scoreDelta: number | null;
  tierDelta: number | null;
  /** Least-squares slope across the range. */
  slope: number | null;
  trendDirection: TrendDirection;
}

/** Safety event counts over a week range (events whose Program Impact is not "None"). */
export interface DriverSafety {
  total: number;
  speeding: number;
  signSignal: number;
  distraction: number;
  followingDistance: number;
  seatbelt: number;
}

/** One safety event from a Safety Dashboard file. Stored one row per event. */
export interface SafetyEventEntry {
  id: number;
  transporterId: string;
  week: string;
  name: string;
  /** The "Date" column (YYYY-MM-DD). */
  eventDate: string | null;
  /** For example "Scorecard, ORCAS" or "None". */
  programImpact: string | null;
  metricType: string | null;
  metricSubtype: string | null;
  source: string | null;
  videoLink: string | null;
  reviewDetails: string | null;
  sourceFile: string | null;
}

/** How many drivers had one tier in a week. */
export interface TierCount {
  tier: string;
  count: number;
}

/** A driver's Overall Score movement from the first to the last scored week in a range. */
export interface DriverMovement {
  transporterId: string;
  name: string;
  firstWeek: string;
  lastWeek: string;
  firstScore: number;
  lastScore: number;
  /** lastScore - firstScore. */
  delta: number;
}

/** One failure category added up over a week range. Source is POD, CDF, DSB or PSB. */
export interface FailureCategoryRollup {
  source: string;
  category: string;
  count: number;
}

/** Everything the fleet view needs for one week range. No latestWeek means no scorecards. */
export interface FleetSummary {
  fromWeek: string;
  toWeek: string;
  latestWeek: string;
  activeDrivers: number;
  latestFleetAvg: number | null;
  improvingCount: number;
  decliningCount: number;
  avgTrend: Array<{ week: string; avg: number }>;
  latestTierDistribution: TierCount[];
  topImproved: DriverMovement[];
  topDeclined: DriverMovement[];
  worstCategories: FailureCategoryRollup[];
}

/** One driver who needs a word, with why, and the metric costing them the most points. */
export interface CoachingFlag {
  transporterId: string;
  name: string;
  latestWeek: string;
  latestTier: string | null;
  latestScore: number | null;
  reasons: string[];
  severity: 'High' | 'Watch';
  topDragMetric: string | null;
  topDragScore: number | null;
  topDragWeight: number | null;
  topDragTier: string | null;
}

/** One driver's scorecard line for one week. */
export interface WeeklyScorecard {
  id: number;
  transporterId: string;
  week: string;
  overallStanding: string | null;
  overallScore: number | null;
  packagesDelivered: number | null;
  /** The file name the row came from. */
  sourceFile: string | null;
}

/** One metric on one scorecard. */
export interface MetricEntry {
  id: number;
  scorecardId: number;
  metricName: string;
  metricValue: string | null;
  tier: string | null;
  score: number | null;
  weightApplied: number | null;
}

/** One driver's POD (photo on delivery) numbers for one week. */
export interface PodWeekEntry {
  transporterId: string;
  week: string;
  name: string;
  opportunities: number;
  success: number;
  bypass: number;
  rejects: number;
  blurryPhoto: number;
  humanInThePicture: number;
  noPackageDetected: number;
  packageInCar: number;
  packageInHand: number;
  packageNotClearlyVisible: number;
  packageTooClose: number;
  photoTooDark: number;
  other: number;
  sourceFile: string | null;
}

/** One driver's negative customer feedback counts for one week, added up over the file's events. */
export interface CdfWeekEntry {
  transporterId: string;
  week: string;
  name: string;
  mishandled: number;
  unprofessional: number;
  didNotFollowInstructions: number;
  wrongAddress: number;
  neverReceived: number;
  wrongItem: number;
  sourceFile: string | null;
}

/** One driver's delivery-scan (DSB) counts for one week, from the events that count. */
export interface DsbWeekEntry {
  transporterId: string;
  week: string;
  name: string;
  simultaneousDeliveries: number;
  deliveredOver50m: number;
  incorrectScanAttended: number;
  incorrectScanUnattended: number;
  noPodOnDelivery: number;
  scannedNotDeliveredNotReturned: number;
  sourceFile: string | null;
}

/** One driver's pickup failure (PSB) counts for one week. */
export interface PsbWeekEntry {
  transporterId: string;
  week: string;
  name: string;
  earlyArrivals: number;
  lateArrivals: number;
  geoLocation: number;
  notAttempted: number;
  contactCompliance: number;
  outOfReturnLabel: number;
  pickedUpNotReturned: number;
  sourceFile: string | null;
}

/** A week that had a PSB file read, even one with no failures in it. */
export interface PsbImportedWeek {
  week: string;
  sourceFile: string | null;
  importedAt: string | null;
}

/** One package brought back to the station (an RTS event). Stored one row per event. */
export interface DcrEventEntry {
  id: number;
  transporterId: string;
  week: string;
  name: string;
  trackingId: string;
  /** "Y" or "N", as the file had it. */
  impactDcr: string;
  /** "DA Selected RTS Code". */
  rtsCode: string;
  additionalInformation: string;
  exemptionReason: string;
  /** "YYYY-MM-DD". */
  plannedDeliveryDate: string;
  sourceFile: string | null;
}

/** One driver's delivery completion totals for one week. */
export interface DcrWeekTotals {
  transporterId: string;
  week: string;
  name: string;
  /** Delivery Completion DPMO (lower is better); older files had a DCR percentage here. */
  dcr: number | null;
  packagesDispatched: number | null;
  packagesDelivered: number | null;
  packagesReturnedToStation: number | null;
  packagesReturnedToStationDaControllable: number | null;
  rescuedPackages: number | null;
  rtsAllExempted: number | null;
  sourceFile: string | null;
}

/** The tier cut-offs and weight for one metric. One set, replaced on each import. */
export interface MetricThreshold {
  /** The short name, for example "CDF DPMO" (see normalizeThresholdMetricName). */
  metricName: string;
  /** "POSITIVE" (higher is better) or "NEGATIVE" (lower is better). */
  indicator: string | null;
  platinumThreshold: number | null;
  goldThreshold: number | null;
  silverThreshold: number | null;
  bronzeThreshold: number | null;
  overallMetricWeight: number | null;
  /** The week the thresholds file was for. */
  sourceWeek: string | null;
  /** When it was imported (the storage layer stamps this). */
  importedAt: string | null;
}
