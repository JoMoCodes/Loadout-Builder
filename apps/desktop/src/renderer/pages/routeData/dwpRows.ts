// What the DWP tab says, worked out from the snapshot. The wording is the old app's.

import {
  DWP_DAY_MISMATCH,
  DWP_DAY_OK,
  duplicateCodes,
  dwpDateLabel,
  longDateLabel,
  routeKey,
  type DwpEntry,
} from '@loadout/core';
import type { AppSnapshot } from '../../../shared/snapshot';
import { baseName, codeList } from '../dataPages/format';

export const DWP_EMPTY = {
  title: 'No DWP sheet loaded.',
  body: "Import DWP_DSP-<station>_<date>.xlsx to bring in each route's bags, OVS and staging. 'Export with DWP' on the Load Out page prints them beside the driver running that route.",
};

export interface DwpRow {
  index: number;
  entry: DwpEntry;
  /** A driver on the roster runs this route. Only meaningful when the roster has route codes. */
  onRoster: boolean;
}

/** Every route code on the roster, ready to compare against (empty ones left out). */
export function rosterCodes(snapshot: AppSnapshot): Set<string> {
  const codes = new Set(snapshot.roster.rows.map((row) => routeKey(row.row.routes)));
  codes.delete('');
  return codes;
}

export function rosterHasRouteCodes(snapshot: AppSnapshot): boolean {
  return snapshot.roster.rows.some((row) => row.row.routes.trim() !== '');
}

export function buildDwpRows(snapshot: AppSnapshot): DwpRow[] {
  const codes = rosterCodes(snapshot);
  return snapshot.dwp.set.rows.map((entry, index) => ({
    index,
    entry,
    onRoster: codes.has(routeKey(entry.routeCode)),
  }));
}

/** Grey a route out only once there is a roster with route codes to be missing from. */
export function dwpTone(row: DwpRow, checkRoster: boolean): 'ghost' | undefined {
  return checkRoster && !row.onRoster ? 'ghost' : undefined;
}

/** The tick box "Not on the roster": routes nobody on the roster runs (none until codes exist). */
export function passesUnmatchedOnly(row: DwpRow, checkRoster: boolean): boolean {
  return !(row.onRoster || !checkRoster);
}

/** "12 of 40 drivers matched by route code", or "no roster loaded". */
export function dwpMatchLine(snapshot: AppSnapshot): string {
  if (snapshot.roster.rows.length === 0) return 'no roster loaded';
  return `${snapshot.dwp.matchedCount} of ${snapshot.roster.rows.length} drivers matched by route code`;
}

/** The notes under the match line. */
export function dwpNotes(snapshot: AppSnapshot): string {
  const notes: string[] = [];
  if (snapshot.roster.rows.length > 0 && !rosterHasRouteCodes(snapshot)) {
    notes.push('the roster carries no route codes yet');
  }
  const repeated = duplicateCodes(snapshot.dwp.set);
  if (repeated.length > 0) notes.push(`${repeated.length} route code(s) listed twice`);
  return notes.join('   ');
}

/** What the status says after the sheet came in. */
export function dwpImportedMessage(snapshot: AppSnapshot, filePath: string): string {
  const rows = snapshot.dwp.set.rows.length;
  const matched = snapshot.dwp.matchedCount;
  let tail: string;
  if (snapshot.roster.rows.length === 0) {
    tail = ' No roster loaded to match them against yet.';
  } else if (matched) {
    tail = ` ${matched} of ${snapshot.roster.rows.length} drivers matched by route code.`;
  } else if (!rosterHasRouteCodes(snapshot)) {
    tail =
      " No driver has a route code yet - use 'Bring Over Route Data' on the Load Out page first.";
  } else {
    tail = ' No route code on the roster matches this sheet.';
  }
  const repeated = duplicateCodes(snapshot.dwp.set);
  if (repeated.length > 0) {
    tail += ` Listed twice: ${codeList(repeated)} - the first line is used.`;
  }
  return `Imported ${rows} routes from ${baseName(filePath)}.${tail}`;
}

export interface DayNote {
  tone: 'ok' | 'warn' | 'info';
  /** A short label for the chip. */
  chip: string;
  /** The longer sentence. */
  text: string;
}

/**
 * Whether the loaded sheet is the roster's day, in the old app's words for "wrong day" and "can't
 * tell". The sheet carries no date inside it, so the day comes from its file name.
 */
export function dwpDayNote(snapshot: AppSnapshot): DayNote | null {
  const { set, dayStatus } = snapshot.dwp;
  if (set.rows.length === 0) return null;
  const name = baseName(set.sourceFile) || 'The DWP sheet';
  const rosterDay = snapshot.loadOutDate ? longDateLabel(snapshot.loadOutDate) : 'an unknown date';

  if (dayStatus === DWP_DAY_OK) {
    return {
      tone: 'ok',
      chip: "Matches the roster's day",
      text: `${name} is for ${dwpDateLabel(set)}, the roster's day.`,
    };
  }
  if (dayStatus === DWP_DAY_MISMATCH) {
    return {
      tone: 'warn',
      chip: 'Wrong day',
      text: `${name} is for ${dwpDateLabel(set)}. The roster is for ${rosterDay}.`,
    };
  }
  if (set.day !== null) {
    // The name does say a day; there is just no roster to compare it with yet.
    return {
      tone: 'info',
      chip: 'No roster to compare',
      text: `${name} is for ${dwpDateLabel(set)}. No roster is loaded to compare it with.`,
    };
  }
  return {
    tone: 'warn',
    chip: "Can't tell the day",
    text:
      `Can't tell which day ${name} is for - a DWP sheet carries no date inside it, and this ` +
      `one's file name doesn't say either. The roster is for ${rosterDay}.`,
  };
}
