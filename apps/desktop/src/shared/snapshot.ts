// What a page needs to draw itself, in one plain object. The main process builds it from the
// core's AppState; pages read it and never keep their own copy of the day's data.
//
// It crosses to the page by structured clone: Map, Set and Date arrive as themselves, but a class
// instance would lose its methods. Everything here is therefore plain data (see snapshot.test.ts,
// which walks a real snapshot and fails on any class instance).

import type {
  Associate,
  DriverRow,
  DwpDataSet,
  ExpiryState,
  MatchMethod,
  Roster,
  RouteDataSet,
  Vehicle,
  printing,
} from '@loadout/core';

type PrintSpec = printing.PrintSpec;

export interface MatchCandidate {
  name: string;
  transporterId: string;
}

/** Who a roster driver was matched to, and how. */
export interface MatchView {
  method: MatchMethod;
  /** More than one possible associate: the person has to pick. */
  ambiguous: boolean;
  candidates: MatchCandidate[];
}

export interface RosterRowView {
  /**
   * The row's place on the roster. Commands that act on a row send this. It is only good for the
   * revision it came from: a page sends the snapshot's `revision` too, or re-reads first.
   */
  index: number;
  row: DriverRow;
  match: MatchView;
  /** The matched associate's Transporter ID, or '' for none. */
  associateId: string;
  associateName: string;
  /** The van badges ("CDV EDV"), plus LMR where approved. */
  vanBadges: string;
  tenure: number | null;
  /** What the Check column says: "OK", what is wrong, or '' when there is no driver list yet. */
  check: string;
  /** How the van was arrived at, in words ("primary affinity", "by hand"), or ''. */
  assignMethodLabel: string;
  /** The same problems as `check`, one per entry. */
  issues: string[];
}

export interface AssociateView {
  associate: Associate;
  vanBadges: string;
  lmrApproved: boolean;
  idState: ExpiryState;
  daysUntilIdExpiry: number | null;
  /** On today's roster. */
  onRoster: boolean;
}

export interface VehicleView {
  vehicle: Vehicle;
  /** In service, after any change made here. */
  operational: boolean;
  /** Changed here from what the export said. */
  overridden: boolean;
  /** The priority number as text, or ''. */
  priority: string;
  /** Slot name to Transporter ID, for the associates tied to this van. */
  affinity: Record<string, string>;
  /** A Last Mile Rental (only approved drivers may take one). */
  rental: boolean;
  /** Held by someone on today's roster. */
  inUse: boolean;
  /** In service and not held: what the Available Vans list shows. */
  available: boolean;
}

export interface RouteSetView extends RouteDataSet {
  /** The name people see ("Routes", "Itineraries", "Weekly Schedule"). */
  label: string;
}

export interface DwpView {
  set: DwpDataSet;
  /** How many drivers on the roster have a line in the sheet. */
  matchedCount: number;
  /** 'ok', 'unknown' or 'mismatch': whether the sheet is for the roster's day. */
  dayStatus: string;
}

export interface TenureSummary {
  /** Drivers the Tenured Workforce file has a count for. */
  records: number;
  sourceFile: string;
  importedAt: Date | null;
  /** Associates that now carry a count. */
  associatesWithCount: number;
  /** The newest week any kept count was read in ("Week 34, 2026"), or ''. */
  weekLabel: string;
}

/** Which file a list came from and when, for the line under a page's heading. */
export interface SourceInfo {
  sourceFile: string;
  importedAt: Date | null;
}

export interface SnapshotCounts {
  rosterRows: number;
  matched: number;
  needReview: number;
  associates: number;
  activeAssociates: number;
  vehicles: number;
  operationalVehicles: number;
  availableVehicles: number;
  overriddenVehicles: number;
  rentalVehicles: number;
  lmrApproved: number;
  dwpRows: number;
  dwpMatched: number;
  previousRosterRows: number;
  /** Drivers who had a van on the previous roster and are on today's roster too. */
  previousOnToday: number;
  links: number;
  affinitySlots: number;
  /** Rows per route export, by kind ("routes", "itineraries", "schedule"). */
  routeRows: Record<string, number>;
}

export interface AppSnapshot {
  /** Goes up by one after every command. Compare it with `state:changed`. */
  revision: number;
  /** The day the main process counted as today (IDs and registrations are checked against it). */
  today: string;
  /** "real" is the person's saved data; "demo" is the made-up data. */
  mode: 'real' | 'demo';
  loadOutDate: string | null;
  roster: {
    sourceFile: string;
    importedAt: Date | null;
    /** Which route export the dispatch times on the rows came from. */
    routeSource: string;
    rows: RosterRowView[];
  };
  associates: AssociateView[];
  vehicles: VehicleView[];
  /** Where the associate list and the fleet came from. */
  sources: { associates: SourceInfo; vehicles: SourceInfo };
  routeSets: RouteSetView[];
  dwp: DwpView;
  previousRoster: Roster;
  /** Transporter IDs approved for Last Mile Rentals. */
  lmrApproved: string[];
  /**
   * Van affinity in full: VIN to slot to Transporter ID. Includes vans that are no longer in the
   * fleet (affinity is kept when the fleet is cleared), which `vehicles[].affinity` cannot show.
   */
  affinity: Record<string, Record<string, string>>;
  /** Driver key to the Transporter ID they were linked to (null: "not an associate"). */
  links: Map<string, string | null>;
  tenure: TenureSummary;
  print: {
    spec: PrintSpec;
    /** Names of the saved layouts. */
    presets: string[];
  };
  /** How many drivers are in each kind of match ("exact", "fuzzy", "none", ...). */
  matchSummary: Map<string, number>;
  counts: SnapshotCounts;
}
