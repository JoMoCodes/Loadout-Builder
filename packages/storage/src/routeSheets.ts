import type Database from 'better-sqlite3';
import { runDay, type Decision, type RouteSheet } from '@loadout/route-sheets';
import { RS_TABLES, type RsTable } from './migrations';

/**
 * Reads and writes the route sheet runs (the `rs_` tables): one day's route sheets as read from
 * the PDF, the choices made for them, the pads typed for waves the route data does not know, and
 * which ones were sent. The sibling of PerformanceStore, on the same open database.
 *
 * The original PDF is not kept here: the main process keeps it as a file beside the database.
 */
export interface RouteSheetsStoreOptions {
  /** The clock used to stamp "updated at". Defaults to the computer's clock. */
  now?: () => Date;
}

/** How a route sheet went out: 'emailed', 'copied', 'draft', 'mail-app' or 'manual'. */
export interface SentMark {
  how: string;
  at: string;
  /** The addresses it was emailed to (only for 'emailed'). */
  to?: string[];
}

/** One day's run, in full. */
export interface StoredRun {
  /** The old app's run id: station, date and cycle ("XXX1_2026-09-01_CYCLE1"). */
  id: string;
  station: string | null;
  /** yyyy-mm-dd. */
  date: string | null;
  /** As printed on the sheets ("TUE, SEP 1, 2026"). */
  dateLabel: string | null;
  cycle: string | null;
  pdfFileName: string | null;
  importedAt: string | null;
  pageCount: number;
  warnings: string[];
  /** The Route Data file the run was matched against, for the History list. */
  routesFileName: string | null;
  /** Pads typed for wave times the route data does not know, e.g. { '09:50 AM': '3' }. */
  wavePads: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  sheets: RouteSheet[];
  /** By route code. */
  decisions: Record<string, Decision>;
  /** By route code. */
  sent: Record<string, SentMark>;
}

/** A run as the History list needs it (no sheets, choices or marks). */
export interface StoredRunListing {
  id: string;
  station: string | null;
  date: string | null;
  dateLabel: string | null;
  cycle: string | null;
  pdfFileName: string | null;
  routesFileName: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** How many route sheets it holds. */
  sheets: number;
}

type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function listing(row: Row): StoredRunListing {
  return {
    id: String(row.id),
    station: text(row.station),
    date: text(row.date),
    dateLabel: text(row.date_label),
    cycle: text(row.cycle),
    pdfFileName: text(row.pdf_file_name),
    routesFileName: text(row.routes_file_name),
    importedAt: text(row.imported_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sheets: Number(row.sheets ?? 0),
  };
}

function decisionFrom(row: Row): Decision {
  const decision: Decision = {};
  if (row.recipients !== null && row.recipients !== undefined) {
    decision.recipients = parseJson<string[]>(row.recipients, []);
  }
  if (row.skipped) decision.skipped = true;
  if (row.manual) decision.manual = true;
  if (row.via_suggestion) decision.viaSuggestion = true;
  if (row.at !== null && row.at !== undefined) decision.at = String(row.at);
  return decision;
}

function sentFrom(row: Row): SentMark {
  const mark: SentMark = { how: String(row.how), at: String(row.at) };
  if (row.sent_to !== null && row.sent_to !== undefined) {
    mark.to = parseJson<string[]>(row.sent_to, []);
  }
  return mark;
}

export class RouteSheetsStore {
  private readonly now: () => Date;

  /** Works on an open database that has been through the setup steps (a Store's `db`). */
  constructor(
    readonly db: Database.Database,
    options: RouteSheetsStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  /** Run several changes as one: all of them land, or none do. */
  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  /** How many rows each route sheet table holds. Counts only. */
  tableCounts(): Record<RsTable, number> {
    const counts = {} as Record<RsTable, number>;
    for (const table of RS_TABLES) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      counts[table] = row.n;
    }
    return counts;
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private touch(runId: string): void {
    this.db.prepare('UPDATE rs_runs SET updated_at = ? WHERE id = ?').run(this.stamp(), runId);
  }

  hasRun(id: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM rs_runs WHERE id = ?').get(id);
  }

  /**
   * Saves the whole run, replacing what was saved under its id (sheets, choices and marks
   * included). Stamps it as changed now. Returns the stamp.
   */
  saveRun(run: StoredRun): string {
    const updatedAt = this.stamp();
    this.transaction(() => {
      this.db.prepare('DELETE FROM rs_runs WHERE id = ?').run(run.id);
      this.db
        .prepare(
          `INSERT INTO rs_runs
             (id, station, date, date_label, cycle, pdf_file_name, imported_at, page_count,
              warnings, routes_file_name, wave_pads, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.id,
          run.station,
          run.date,
          run.dateLabel,
          run.cycle,
          run.pdfFileName,
          run.importedAt,
          run.pageCount,
          JSON.stringify(run.warnings),
          run.routesFileName,
          JSON.stringify(run.wavePads),
          run.createdAt,
          updatedAt,
        );
      const sheet = this.db.prepare(
        `INSERT OR REPLACE INTO rs_sheets (run_id, route_code, position, sheet, page_numbers)
         VALUES (?, ?, ?, ?, ?)`,
      );
      run.sheets.forEach((s, index) => {
        sheet.run(
          run.id,
          s.routeCode ?? '',
          index,
          JSON.stringify(s),
          JSON.stringify(s.pageNumbers ?? [s.pageNumber]),
        );
      });
      for (const [code, decision] of Object.entries(run.decisions)) {
        this.insertDecision(run.id, code, decision);
      }
      for (const [code, mark] of Object.entries(run.sent)) this.insertSent(run.id, code, mark);
    });
    return updatedAt;
  }

  loadRun(id: string): StoredRun | null {
    const row = this.db.prepare('SELECT * FROM rs_runs WHERE id = ?').get(id) as Row | undefined;
    if (!row) return null;
    const sheets = (
      this.db
        .prepare('SELECT sheet FROM rs_sheets WHERE run_id = ? ORDER BY position')
        .all(id) as Row[]
    ).map((r) => parseJson<RouteSheet>(r.sheet, null as unknown as RouteSheet));
    const decisions: Record<string, Decision> = {};
    for (const r of this.db
      .prepare('SELECT * FROM rs_decisions WHERE run_id = ? ORDER BY rowid')
      .all(id) as Row[]) {
      decisions[String(r.route_code)] = decisionFrom(r);
    }
    const sent: Record<string, SentMark> = {};
    for (const r of this.db
      .prepare('SELECT * FROM rs_sent WHERE run_id = ? ORDER BY rowid')
      .all(id) as Row[]) {
      sent[String(r.route_code)] = sentFrom(r);
    }
    const base = listing({ ...row, sheets: sheets.length });
    return {
      id: base.id,
      station: base.station,
      date: base.date,
      dateLabel: base.dateLabel,
      cycle: base.cycle,
      pdfFileName: base.pdfFileName,
      importedAt: base.importedAt,
      pageCount: Number(row.page_count ?? 0),
      warnings: parseJson<string[]>(row.warnings, []),
      routesFileName: base.routesFileName,
      wavePads: parseJson<Record<string, string>>(row.wave_pads, {}),
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      sheets: sheets.filter((s) => s !== null),
      decisions,
      sent,
    };
  }

  /** Every saved run, newest day first (then the one changed last), as the old app listed them. */
  listRuns(): StoredRunListing[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, (SELECT COUNT(*) FROM rs_sheets s WHERE s.run_id = r.id) AS sheets
         FROM rs_runs r`,
      )
      .all() as Row[];
    return rows
      .map(listing)
      .sort(
        (a, b) =>
          String(b.date || '').localeCompare(String(a.date || '')) ||
          String(b.updatedAt).localeCompare(String(a.updatedAt)),
      );
  }

  /** Removes a run with its sheets, choices and marks. Whether there was one. */
  deleteRun(id: string): boolean {
    return this.db.prepare('DELETE FROM rs_runs WHERE id = ?').run(id).changes > 0;
  }

  /**
   * Removes every run for a day before `day` (yyyy-mm-dd): its route sheet date, or the day it
   * was last changed when it has none. Returns the ids removed.
   */
  deleteRunsBefore(day: string): string[] {
    const old = this.listRuns()
      .filter((r) => {
        const d = runDay(r);
        return d !== '' && d < day;
      })
      .map((r) => r.id);
    this.transaction(() => {
      for (const id of old) this.deleteRun(id);
    });
    return old;
  }

  private insertDecision(runId: string, code: string, d: Decision): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rs_decisions
           (run_id, route_code, recipients, skipped, manual, via_suggestion, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        code,
        d.recipients === undefined ? null : JSON.stringify(d.recipients),
        d.skipped ? 1 : 0,
        d.manual ? 1 : 0,
        d.viaSuggestion ? 1 : 0,
        d.at ?? null,
      );
  }

  private insertSent(runId: string, code: string, mark: SentMark): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rs_sent (run_id, route_code, how, at, sent_to)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(runId, code, mark.how, mark.at, mark.to === undefined ? null : JSON.stringify(mark.to));
  }

  /** Sets (or, with null, removes) the choice for one route of a saved run. */
  setDecision(runId: string, routeCode: string, decision: Decision | null): void {
    this.transaction(() => {
      this.db
        .prepare('DELETE FROM rs_decisions WHERE run_id = ? AND route_code = ?')
        .run(runId, routeCode);
      if (decision) this.insertDecision(runId, routeCode, decision);
      this.touch(runId);
    });
  }

  /** Replaces every choice of a saved run. */
  setDecisions(runId: string, decisions: Record<string, Decision>): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM rs_decisions WHERE run_id = ?').run(runId);
      for (const [code, d] of Object.entries(decisions)) this.insertDecision(runId, code, d);
      this.touch(runId);
    });
  }

  /** Marks one route of a saved run as sent (or, with null, as not sent). */
  markSent(runId: string, routeCode: string, mark: SentMark | null): void {
    this.transaction(() => {
      this.db
        .prepare('DELETE FROM rs_sent WHERE run_id = ? AND route_code = ?')
        .run(runId, routeCode);
      if (mark) this.insertSent(runId, routeCode, mark);
      this.touch(runId);
    });
  }

  /** Replaces the pads typed for a saved run's waves. */
  setWavePads(runId: string, pads: Record<string, string>): void {
    this.db
      .prepare('UPDATE rs_runs SET wave_pads = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(pads), this.stamp(), runId);
  }
}
