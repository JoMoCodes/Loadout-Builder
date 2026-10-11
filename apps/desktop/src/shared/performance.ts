// Weekly performance: the shapes the Performance and Dashboard pages get from the main process,
// and the plain words for each kind of export. Everything here is plain data (it crosses to the
// page by structured clone). Paths never cross: a remembered folder is shown by its last part
// only ("Scorecards"), and a dropped file or folder becomes a token.

import type {
  CoachingFlag,
  DriverAverages,
  DriverMovement,
  DriverSafety,
  DriverTrend,
  FailureCategoryRollup,
  SafetyEventEntry,
  ScoreExplanation,
  TierCount,
} from '@loadout/performance';

/** The ten kinds of weekly export, in the order the old app brought them in. */
export const PERF_KINDS = [
  'roster',
  'thresholds',
  'scorecards',
  'pod',
  'cdf',
  'dsb',
  'psb',
  'dcr',
  'dcr-totals',
  'safety',
] as const;
export type PerfKind = (typeof PERF_KINDS)[number];

/** Kinds brought in as a single file (the others come as a folder of weekly files). */
export const SINGLE_FILE_KINDS: readonly PerfKind[] = ['roster', 'thresholds'];

/** How each kind is named to the person, where to get it, and how its files are recognised. */
export const PERF_KIND_WORDS: Record<
  PerfKind,
  {
    /** The card's title ("Scorecards"). */
    title: string;
    /** In a sentence ("the scorecards"). */
    the: string;
    /** One line on where the file comes from, for the card and How to use. */
    whereFrom: string;
    /** The file endings it takes. */
    endings: readonly string[];
    /** Recognises a file of this kind by its name, for a dropped folder that mixes kinds. */
    namePattern: RegExp;
  }
> = {
  roster: {
    title: 'Driver list',
    the: 'the driver list',
    whereFrom: 'The associate export (AssociateData.csv) from the DSP portal.',
    endings: ['.csv'],
    namePattern: /^AssociateData.*\.csv$/i,
  },
  thresholds: {
    title: 'Thresholds',
    the: 'the scorecard thresholds',
    whereFrom: 'The scoring metadata export (DSP_Thresholds_Scoring_Metadata_…csv).',
    endings: ['.csv'],
    namePattern: /^DSP_Thresholds_Scoring_Metadata_.*\.csv$/i,
  },
  scorecards: {
    title: 'Scorecards',
    the: 'the weekly scorecards',
    whereFrom: 'The weekly overview dashboard export (DSP_Overview_Dashboard_…csv).',
    endings: ['.csv'],
    namePattern: /^DSP_Overview_Dashboard_.*\.csv$/i,
  },
  pod: {
    title: 'POD reports',
    the: 'the POD reports',
    whereFrom: 'The photo-on-delivery details PDFs (…DA-POD-Details.pdf).',
    endings: ['.pdf'],
    namePattern: /POD-Details.*\.pdf$/i,
  },
  cdf: {
    title: 'Customer feedback (CDF)',
    the: 'the customer feedback files',
    whereFrom:
      'The negative customer delivery feedback export (DSP_Customer_Delivery_Feedback_negative_…csv).',
    endings: ['.csv'],
    namePattern: /^DSP_Customer_Delivery_Feedback_.*\.csv$/i,
  },
  dsb: {
    title: 'Delivery scans (DSB)',
    the: 'the delivery concessions files',
    whereFrom: 'The delivery concessions export (DSP_Delivery_Concessions_…csv).',
    endings: ['.csv'],
    namePattern: /^DSP_Delivery_Concessions_.*\.csv$/i,
  },
  psb: {
    title: 'Pickup failures (PSB)',
    the: 'the pickup failures files',
    whereFrom: 'The pickup failures export (DSP_Pickup_Failures_…csv).',
    endings: ['.csv'],
    namePattern: /^DSP_Pickup_Failures_.*\.csv$/i,
  },
  dcr: {
    title: 'Returned packages (DCR)',
    the: 'the returned-package files',
    whereFrom: 'The quality RTS export (Quality_RTS_…csv).',
    endings: ['.csv'],
    namePattern: /^Quality_RTS_.*\.csv$/i,
  },
  'dcr-totals': {
    title: 'DCR weekly totals',
    the: 'the DCR weekly totals',
    whereFrom: 'The quality DCR export (Quality_DCR_…csv).',
    endings: ['.csv'],
    namePattern: /^Quality_DCR_.*\.csv$/i,
  },
  safety: {
    title: 'Safety events',
    the: 'the safety files',
    whereFrom: 'The safety dashboard export (Safety_Dashboard_…csv).',
    endings: ['.csv'],
    namePattern: /^Safety_Dashboard_.*\.csv$/i,
  },
};

/** Which kind a file name belongs to, or null. */
export function kindOfFileName(fileName: string): PerfKind | null {
  for (const kind of PERF_KINDS) {
    if (PERF_KIND_WORDS[kind].namePattern.test(fileName)) return kind;
  }
  return null;
}

/** A week range. Both ends are "YYYY-Www". */
export interface WeekRange {
  from: string;
  to: string;
}

/** What one import did, for the plain-words summary. */
export interface PerfImportSummary {
  kind: PerfKind;
  filesRead: number;
  rows: number;
  /** New drivers added to the driver list. */
  driversAdded: number;
  weeks: string[];
  /** Plain words, one per problem (which file and which row number, never a row's contents). */
  problems: string[];
  /** The driver list only: drivers already known whose details were updated, and the counts by status. */
  roster?: { updated: number; active: number; inactive: number };
}

/** One card on the Imports tab. */
export interface PerfImportCard {
  kind: PerfKind;
  /** The last part of the remembered folder (or file) name, or null when none is remembered. */
  folderName: string | null;
  /** The remembered folder is not there now (an unplugged USB stick, a renamed folder). */
  folderMissing: boolean;
  /** When this kind was last brought in (ISO time), or null. */
  lastImportAt: string | null;
  /** The newest week this kind has data for, or null. */
  newestWeek: string | null;
  /** Scorecard weeks with no file of this kind (for the missing-weeks warning). */
  missingWeeks: string[];
}

/** The newest auto-import or Sync now. */
/** What saving the check file did. */
export type CheckFileOutcome =
  | { status: 'cancelled' }
  | { status: 'written'; fileName: string; drivers: number; weeks: number; rows: number };

export interface SyncSummary {
  /** ISO time it ran. */
  at: string;
  newFiles: number;
  /** Rows written from the new files. */
  rows: number;
  weeksUpdated: number;
  /** Kinds whose remembered folder is missing. */
  missingFolders: PerfKind[];
  problems: string[];
}

/** The small part of the weekly performance data the snapshot carries for every page. */
export interface PerfSnapshot {
  hasData: boolean;
  /** Every scorecard week brought in, oldest first. */
  weeks: string[];
  drivers: number;
  /** Drivers with an email address on the driver list. */
  withEmail: number;
  /** The thresholds have been brought in. */
  thresholds: boolean;
  /** At least one folder is remembered for auto-import. */
  foldersChosen: number;
  lastSync: SyncSummary | null;
  /** The email setup is complete (from address and saved app password). */
  emailReady: boolean;
  /** Reports have been made at least once. */
  reportsMade: boolean;
  /** Reports have been emailed at least once. */
  reportsEmailed: boolean;
}

export const EMPTY_PERF_SNAPSHOT: PerfSnapshot = {
  hasData: false,
  weeks: [],
  drivers: 0,
  withEmail: 0,
  thresholds: false,
  foldersChosen: 0,
  lastSync: null,
  emailReady: false,
  reportsMade: false,
  reportsEmailed: false,
};

/** One line of the Drivers tab. */
export interface PerfDriverRow {
  transporterId: string;
  name: string;
  /** "ACTIVE", "INACTIVE", "OFFBOARDED", ... (a blank status counts as OFFBOARDED). */
  status: string;
  latestWeek: string | null;
  latestTier: string | null;
  latestScore: number | null;
  /** "12 / 80", or ''. */
  latestRankDisplay: string;
  latestRank: number | null;
  latestPackages: number | null;
  averages: DriverAverages;
  /** The averages as the old grid showed them ("98.5", "—"). */
  averagesDisplay: Record<keyof DriverAverages, string>;
  trend: DriverTrend;
  safety: DriverSafety;
  hasEmail: boolean;
  /** Had a scorecard in the chosen weeks. */
  activeInRange: boolean;
}

/** The Drivers tab's data for one week range. */
export interface PerfDriversView {
  range: WeekRange | null;
  rows: PerfDriverRow[];
  /** "What changed since last week": tier moves and new safety events in the newest week. */
  changes: {
    newestWeek: string | null;
    previousWeek: string | null;
    tierUp: number;
    tierDown: number;
    newSafetyEvents: number;
    /** Each driver whose tier went up or down between the two weeks, by name. */
    tierMoves?: Array<{ transporterId: string; name: string; from: string; to: string }>;
    /** Each driver with safety events that count in the newest week, most first. */
    safetyDrivers?: Array<{ transporterId: string; name: string; count: number }>;
  };
}

/** One line of the Directory tab. */
export interface PerfDirectoryRow {
  transporterId: string;
  name: string;
  status: string;
  position: string;
  qualifications: string;
  email: string;
  personalPhone: string;
  workPhone: string;
  idExpiration: string;
}

/** One line of the thresholds table. */
export interface PerfThresholdRow {
  metricName: string;
  metricNameDisplay: string;
  /** "Higher is better" or "Lower is better". */
  direction: string;
  platinum: string;
  gold: string;
  silver: string;
  bronze: string;
  weight: string;
  sourceWeek: string;
}

/** One ID-expiry alert. */
export interface PerfComplianceRow {
  transporterId: string;
  name: string;
  status: string;
  qualifications: string;
  expiresOn: string | null;
  daysRemaining: number | null;
  severity: string;
  isAlert: boolean;
  /** "Expired 12 day(s) ago", "Expires in 9 day(s)". */
  statusDisplay: string;
}

/** The Dashboard's data for one week range. */
export interface PerfDashboardView {
  range: WeekRange | null;
  hasData: boolean;
  latestWeek: string | null;
  previousWeek: string | null;
  fleetAverage: number | null;
  fleetAverageBefore: number | null;
  activeDrivers: number;
  /** Tier counts in the newest week, and the week before, Platinum first. */
  tiers: TierCount[];
  tiersBefore: TierCount[];
  /** Drivers who moved into each tier since the week before, and out of it. */
  tierMoves: Array<{ tier: string; into: number; outOf: number }>;
  packagesDelivered: number;
  packagesDeliveredBefore: number | null;
  /** Drivers with at least one safety event that counts against the program, in the range. */
  driversWithSafetyEvents: number;
  coaching: CoachingFlag[];
  compliance: PerfComplianceRow[];
  topImproved: DriverMovement[];
  topDeclined: DriverMovement[];
  /** Fleet average Overall Score for each week in the range. */
  trend: Array<{ week: string; avg: number }>;
  /** Failure categories over the range, and whether each is growing. */
  categories: Array<FailureCategoryRollup & { firstHalf: number; secondHalf: number }>;
  /** The rule numbers used, for the explanations. */
  rules: {
    atRiskDecliningWeeks: number;
    recurringCategoryWeeks: number;
    complianceWindowDays: number;
    topN: number;
  };
}

/**
 * "Explain this score": one driver's newest scored week in the range, metric by metric, with the
 * points each earned and lost (score x weight / 100 and (100 - score) x weight / 100), the most
 * lost first. Null from the query when the driver has no scored week in the range.
 */
export type PerfScoreExplanation = ScoreExplanation & {
  /** The same for every week in the range with an Overall Score, oldest first. */
  weeks?: ScoreExplanation[];
};

/** What "Show in folder" opens: the folder of the reports, or the check file in its folder. */
export const PERF_OUTPUTS = ['reports', 'check-file'] as const;
export type PerfOutput = (typeof PERF_OUTPUTS)[number];

/** Counting up while reports are made or emailed (sent by the main process as it works). */
export interface PerfProgress {
  job: 'email' | 'generate';
  done: number;
  total: number;
}

/** What making reports did. */
export type GenerateOutcome =
  | { status: 'cancelled' }
  | { status: 'nothing' }
  | {
      status: 'written';
      /** The last part of the folder the reports went to. */
      folderName: string;
      written: number;
      failed: number;
      /**
       * Drivers asked for who have no scorecard in the weeks, so no report was made for them
       * (the old app skipped them the same way).
       */
      skipped: number;
    };

/** What emailing did (or, for a dry run, would do). */
export interface EmailOutcome {
  dryRun: boolean;
  sent: number;
  /** One per driver not sent to, with the reason in plain words ("no address on file"). */
  notSent: Array<{ transporterId: string; name: string; reason: string }>;
  /** For a dry run: who would get what. */
  wouldSend: Array<{ transporterId: string; name: string; to: string; subject: string }>;
}

/** Whether emailing is set up. */
export interface EmailStatus {
  passwordSaved: boolean;
  /** The computer can keep a password safely (it always can on Windows). */
  canSeal: boolean;
}

/** One saved ImportedFiles ledger line is never shown; only counts are. */
export type SafetyEventView = SafetyEventEntry;
