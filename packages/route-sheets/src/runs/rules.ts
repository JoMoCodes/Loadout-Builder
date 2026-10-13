// The rules for a day's run: its name, its label, which decisions still fit, what Email all would
// send, and which saved runs are old enough to remove. Ported from the old service.js; pure, so
// they are tested without Electron or a database.

import { isEmail } from '../email/address';
import {
  STATES,
  type Decision,
  type Distribution,
  type RouteInput,
  type RouteResult,
} from '../matcher/distribute';

/** The id of a run that has no route sheet PDF yet. */
export const DRAFT_ID = 'draft';

/** A date as yyyy-mm-dd, in local time. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The same moment one calendar month later; Jan 31 becomes the last day of February. */
export function addMonth(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString();
}

/** What a saved run needs to say which day it is for. */
export interface RunDayInput {
  date?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

/** The day a saved run is for: its route sheet date, or the day it was last changed if it has none. */
export function runDay(run: RunDayInput): string {
  if (run.date) return run.date;
  const d = new Date((run.updatedAt || run.createdAt) as string);
  return Number.isNaN(d.getTime()) ? '' : localDay(d);
}

/** What a sheet needs to name its run. */
export interface RunIdInput {
  station?: string | null;
  date?: string | null;
  cycle?: string | null;
}

export function runIdFor(sheet: RunIdInput): string {
  const parts = [sheet.station, sheet.date, sheet.cycle]
    .filter(Boolean)
    .map((p) => String(p).replace(/[^A-Za-z0-9-]/g, ''));
  return parts.length ? parts.join('_') : `run_${Date.now()}`;
}

export interface RunLabelInput {
  id: string;
  station?: string | null;
  date?: string | null;
  cycle?: string | null;
}

export function runLabel(run: RunLabelInput | null | undefined): string {
  if (!run || !run.date)
    return run && run.id === DRAFT_ID ? 'New run (no route sheet PDF yet)' : run?.id || '';
  const d = new Date(`${run.date}T12:00:00`);
  const pretty = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return [run.station, pretty, run.cycle].filter(Boolean).join(' · ');
}

/**
 * Drops decisions that no longer make sense after the routes file changes (for example a chosen
 * driver left the route). Hand-made and "don't send" decisions stay. Returns a pruned copy.
 */
export function pruneDecisions(
  decisions: Record<string, Decision>,
  routes: RouteInput[],
): Record<string, Decision> {
  const listed = new Map(routes.map((r) => [r.routeCode, r.drivers.map((d) => d.transporterId)]));
  const kept: Record<string, Decision> = {};
  for (const [code, d] of Object.entries(decisions)) {
    if (!d.manual && !d.skipped) {
      const ids = listed.get(code) || [];
      if (!(d.recipients || []).every((id) => ids.includes(id))) continue;
    }
    kept[code] = d;
  }
  return kept;
}

/** Why this route can't be emailed right now, or null if it can. */
export function sendProblem(route: RouteResult | null | undefined): string | null {
  if (!route) return 'That route is not in this run.';
  if (route.state !== STATES.READY)
    return route.headline || 'This route sheet is not ready to send.';
  if (!route.recipients.length) return 'Nobody is chosen to receive this route sheet.';
  const noEmail = route.recipients.filter((p) => !p.email);
  if (noEmail.length)
    return `No email address on file for ${noEmail.map((p) => p.name).join(' & ')}.`;
  const bad = route.recipients.find((p) => !isEmail(p.email));
  if (bad) return `"${bad.email}" (${bad.name}) is not a valid email address.`;
  return null;
}

/** Routes "Email all" would send: ready, with an email address, and not already marked sent. */
export function unsentRoutes(dist: Distribution, sent: Record<string, unknown>): string[] {
  return dist.routes.filter((r) => !sent[r.routeCode] && !sendProblem(r)).map((r) => r.routeCode);
}

/**
 * The ids of saved runs that are more than `days` days older than `today` (yyyy-mm-dd, local).
 * The app removes these quietly when it opens. A run with no readable day is kept.
 */
export function staleRunIds(
  runs: { id: string; date: string | null; updatedAt?: string }[],
  today: string,
  days = 30,
): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const cutoff = localDay(new Date(y!, m! - 1, d! - days));
  return runs
    .filter((r) => {
      const day = runDay(r);
      return day !== '' && day < cutoff;
    })
    .map((r) => r.id);
}
