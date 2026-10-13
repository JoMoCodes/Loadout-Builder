// What crosses to the Route Sheets page: plain data only. The snapshot carries the counts; the
// page asks for the rest with the routeSheets:* queries (shared/channels/routeSheets.ts).

import type { Decision, Distribution, Person, RouteResult } from '@loadout/route-sheets';

/** How a route sheet went out. 'manual' is Mark as sent. */
export const SENT_HOWS = ['emailed', 'copied', 'draft', 'mail-app', 'manual'] as const;
export type SentHow = (typeof SENT_HOWS)[number];

export interface SentMarkView {
  how: string;
  at: string;
  /** The addresses it was emailed to (only for 'emailed'). */
  to?: string[];
}

/** The route sheet numbers a header or a badge needs. */
export interface RouteSheetsCounts {
  /** The open run's id, or null when no route sheet PDF is open. */
  runId: string | null;
  /** Route sheets read from the PDF. */
  sheets: number;
  ready: number;
  needsDecision: number;
  exceptions: number;
  noSheet: number;
  skipped: number;
  /** What Email all would send now. */
  unsent: number;
  /** Saved runs (History). */
  runs: number;
}

export const EMPTY_ROUTE_SHEETS: RouteSheetsCounts = {
  runId: null,
  sheets: 0,
  ready: 0,
  needsDecision: 0,
  exceptions: 0,
  noSheet: 0,
  skipped: 0,
  unsent: 0,
  runs: 0,
};

/** Which route export the matcher reads, of the ones on the Route Data page. */
export type RouteDataKindInUse = 'routes' | 'itineraries' | 'schedule';

/** The open run. */
export interface RouteSheetsRunView {
  id: string;
  /** "XXX1 · Tue, Sep 1, 2026 · CYCLE_1", or "New run (no route sheet PDF yet)". */
  label: string;
  /** False for a new run with no route sheet PDF yet (nothing is saved). */
  saved: boolean;
  station: string | null;
  date: string | null;
  dateLabel: string | null;
  cycle: string | null;
  pdfFileName: string | null;
  importedAt: string | null;
  pageCount: number;
  /** The PDF reader's notes (pages skipped, a route on two pages). */
  warnings: string[];
  routesFileName: string | null;
  sheetCount: number;
  /** Route codes whose page did not pass the number check. */
  checkFailures: string[];
  sent: Record<string, SentMarkView>;
  decisions: Record<string, Decision>;
  /** Pads typed for wave times the route data does not know. */
  typedPads: Record<string, string>;
  /** The original PDF is not beside the database any more: single pages cannot be cut. */
  pdfMissing: boolean;
}

/** One saved run, for History. */
export interface RouteSheetsRunListing {
  id: string;
  label: string;
  date: string | null;
  updatedAt: string;
  sheets: number;
  pdfFileName: string | null;
  routesFileName: string | null;
  pdfMissing: boolean;
}

export interface RouteSheetsStateView {
  run: RouteSheetsRunView;
  runs: RouteSheetsRunListing[];
  /** The route export the matcher reads, or null when none with route codes is loaded. */
  routeData: { kind: RouteDataKindInUse; label: string; fileName: string } | null;
  /** The Associates page's driver list. */
  driverList: {
    count: number;
    fileName: string;
    importedAt: string | null;
    /** When a newer driver list is due (one calendar month after the import), or null. */
    refreshDueAt: string | null;
  };
  /** The old Route Sheet Distributor's data folder is on this computer. */
  oldAppFolder: boolean;
  /** What the email setup still needs, in plain words, or null when it is ready. */
  emailProblem: string | null;
  /** Emails are being sent right now. */
  sending: boolean;
  /** What Email all would send now. */
  unsent: number;
}

/** The Distribute tab: the matcher's answer, plus what Email all would send. */
export interface RouteSheetsDistributionView extends Distribution {
  /** Route codes Email all would send now. */
  unsent: string[];
  /** Wave times on the PDF that match no dispatch time in the route data (the typed-pad box). */
  typedPadWaves: string[];
}

export interface RouteSheetsPreview {
  routeCode: string;
  subject: string | null;
  html: string | null;
  text: string | null;
  /** Who it goes to (only when the route is ready). */
  recipients: Person[];
  route: RouteResult | null;
}

export interface EmailRoutesResult {
  sent: string[];
  failed: Array<{ routeCode: string; error: string }>;
  skipped: Array<{ routeCode: string; reason: string }>;
}

export interface ExportAllResult {
  /** The name of the folder made inside the chosen one. */
  folder: string;
  /** How many email drafts were written. */
  drafts: number;
}

/** What bringing in a route sheet PDF did, in the old app's words. */
export interface RouteSheetsImportResult {
  message: string;
  warnings: string[];
  runId: string;
}
