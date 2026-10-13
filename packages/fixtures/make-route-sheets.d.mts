/** One sheet to draw. Table rows are [index, sortZone, bag, pkgs] and [index, sortZone, pkgs]. */
export interface RouteSheetSpec {
  routeCode?: string;
  staging?: string;
  /** The service type printed after the DSP, e.g. "Standard Parcel". */
  service?: string;
  /** The wave time as printed, e.g. "09:50 AM". */
  wave?: string;
  bags?: string[][];
  overflow?: string[][];
  total?: number;
  commercial?: number;
  /** The tables spill onto a second page. */
  continued?: boolean;
  /** A blank page. */
  blank?: boolean;
  /** A page of ordinary text with no route code. */
  notRouteSheet?: boolean;
  /** Defaults to the fixture station. */
  station?: string;
  /** Defaults to the fixture DSP. */
  dsp?: string;
  /** The weekday and date as printed, e.g. "THU, SEP 24, 2026" (the default). */
  dateLine?: string;
}

export interface BuildOptions {
  /** Draw the layout where the headings and the service line are split into separate runs. */
  splitRuns?: boolean;
}

/** One row of a fixture Routes export, keyed by its header. */
export type RoutesRow = Record<string, string | number | boolean | Date | null | undefined>;

export const ROUTE_SHEET_DAYS: string[];

export function buildRouteSheetPdf(
  sheets: RouteSheetSpec[],
  options?: BuildOptions,
): Promise<Uint8Array>;

/** "10:20am" becomes "10:20 AM". */
export function waveFromDeparture(value: unknown): string;

/** "2026-09-01" becomes "TUE, SEP 1, 2026". */
export function dateLineFor(day: string): string;

export function sheetsForDay(routesRows: RoutesRow[], day: string): RouteSheetSpec[];

export function readRoutesRows(day: string): Promise<RoutesRow[]>;

export function writeRouteSheetFixtures(): Promise<void>;
