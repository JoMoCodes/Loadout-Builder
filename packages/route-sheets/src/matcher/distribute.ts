// Decides who receives each route sheet. Matching is by exact Transporter ID only. Ported from
// the old matcher.js: same states, same words, same sort.
//
// A route sheet is sent automatically only when ALL of these are true:
//   - the route has a page in the PDF and that page passed its number check,
//   - the routes file lists exactly one Transporter ID for it,
//   - that ID is in the driver list and is ACTIVE.
// Anything else waits for a decision from the person and is explained in plain words.

import type { RouteSheet } from '../types';
import { namesAgree } from './names';

export const STATES = {
  READY: 'ready',
  NEEDS_DECISION: 'needs-decision', // more than one Transporter ID on the route
  EXCEPTION: 'exception', // no exact match possible
  SKIPPED: 'skipped', // the person chose not to send
  NO_SHEET: 'no-sheet', // route is on the routes file but has no PDF page
} as const;

export type RouteState = (typeof STATES)[keyof typeof STATES];

/** One route on the Routes file: its code and every driver listed on it. */
export interface RouteInput {
  routeCode: string;
  drivers: { transporterId: string; driverName: string }[];
  dsp?: string;
  serviceType?: string;
  plannedDeparture?: string;
}

/** One person on the driver list. */
export interface AssociateInput {
  transporterId: string;
  name: string;
  email: string;
  status: string;
}

/** What the person chose for one route. */
export interface Decision {
  recipients?: string[];
  skipped?: boolean;
  manual?: boolean;
  viaSuggestion?: boolean;
  at?: string;
}

/** Pad number for each wave time, e.g. { '09:50 AM': '3' }. */
export type WavePads = Record<string, string>;

export interface SheetSummary {
  pageNumber: number;
  pageNumbers: number[];
  staging: string | null;
  waveTime: string | null;
  /** The pad chosen for this sheet's wave time, or null. */
  pad: string | null;
  serviceType: string | null;
  dsp: string | null;
  station: string | null;
  date: string | null;
  dateLabel: string | null;
  cycle: string | null;
  bagCount: number | null;
  overflowCount: number | null;
  totalPackages: number | null;
  commercialPackages: number | null;
  checkOk: boolean;
  checkProblems: string[];
  notes: string[];
}

export interface Person {
  transporterId: string;
  name: string;
  email: string;
  status: string;
}

/** One driver listed on a route, with what the driver list says about them. */
export interface ListedCandidate {
  transporterId: string;
  routesName: string;
  found: boolean;
  rosterName: string | null;
  status: string | null;
  email: string;
  otherRoutes: string[];
  nameMismatch: boolean;
  problem: string | null;
  valid: boolean;
}

export interface Issue {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export interface RouteResult {
  routeCode: string;
  hasSheet: boolean;
  onRoutesFile: boolean;
  sheet: SheetSummary | null;
  listed: ListedCandidate[];
  kind: 'no-sheet' | 'unassigned' | 'duplicate' | 'single';
  state: RouteState;
  source: 'auto' | 'decision';
  recipients: Person[];
  suggestion: string | null;
  suggestionReason: string | null;
  headline: string;
  issues: Issue[];
}

export interface MissingPersonRoute {
  routeCode: string;
  reason: string;
}

export interface MissingPerson {
  transporterId: string;
  name: string;
  inRoster: boolean;
  status: string | null;
  routes: MissingPersonRoute[];
}

export interface PeopleSummary {
  notReceiving: MissingPerson[];
  multiple: { transporterId: string; name: string; routes: string[] }[];
}

export type StateCounts = { total: number; missingEmail: number } & Record<RouteState, number>;

export interface WaveSummary {
  waveTime: string;
  routes: number;
  pad: string | null;
}

export interface Distribution {
  routes: RouteResult[];
  people: PeopleSummary;
  counts: StateCounts;
  waves: WaveSummary[];
}

export interface DistributeInput {
  sheets?: RouteSheet[];
  routes?: RouteInput[];
  associates?: AssociateInput[];
  /** Keyed by route code. */
  decisions?: Record<string, Decision>;
  wavePads?: WavePads;
}

export function summarizeSheet(
  s: RouteSheet | null | undefined,
  pad: string | null = null,
): SheetSummary | null {
  if (!s) return null;
  return {
    pageNumber: s.pageNumber,
    pageNumbers: s.pageNumbers || [s.pageNumber],
    staging: s.staging,
    waveTime: s.waveTime,
    pad, // the pad for this sheet's wave time, or null
    serviceType: s.serviceType,
    dsp: s.dsp,
    station: s.station,
    date: s.date,
    dateLabel: s.dateLabel,
    cycle: s.cycle,
    bagCount: s.bagCount,
    overflowCount: s.overflowCount,
    totalPackages: s.totalPackages,
    commercialPackages: s.commercialPackages,
    checkOk: s.check.ok,
    checkProblems: s.check.problems,
    notes: s.check.notes || [],
  };
}

const person = (a: AssociateInput): Person => ({
  transporterId: a.transporterId,
  name: a.name,
  email: a.email,
  status: a.status,
});

export function distribute({
  sheets = [],
  routes = [],
  associates = [],
  decisions = {},
  wavePads = {},
}: DistributeInput): Distribution {
  const roster = new Map(associates.map((a) => [a.transporterId, a]));
  const sheetByCode = new Map(sheets.map((s) => [s.routeCode, s]));
  const routeByCode = new Map(routes.map((r) => [r.routeCode, r]));

  // Which routes each Transporter ID is listed on (used to explain and suggest duplicates).
  const routesById = new Map<string, string[]>();
  for (const r of routes) {
    for (const d of r.drivers) {
      if (!d.transporterId) continue;
      const list = routesById.get(d.transporterId);
      if (list) list.push(r.routeCode);
      else routesById.set(d.transporterId, [r.routeCode]);
    }
  }

  const codes = [
    ...new Set([...sheets.map((s) => s.routeCode), ...routes.map((r) => r.routeCode)]),
  ] as string[];
  const results = codes.map((routeCode): RouteResult => {
    const sheet = sheetByCode.get(routeCode) || null;
    const route = routeByCode.get(routeCode) || null;
    const issues: Issue[] = [];

    const listed = (route ? route.drivers : []).map((d): ListedCandidate => {
      const a = d.transporterId ? roster.get(d.transporterId) : undefined;
      const c: ListedCandidate = {
        transporterId: d.transporterId,
        routesName: d.driverName,
        found: !!a,
        rosterName: a ? a.name : null,
        status: a ? a.status : null,
        email: a ? a.email : '',
        otherRoutes: d.transporterId
          ? (routesById.get(d.transporterId) || []).filter((x) => x !== routeCode)
          : [],
        nameMismatch: !!a && !!d.driverName && !namesAgree(d.driverName, a.name),
        problem: null,
        valid: false,
      };
      const label = d.driverName || c.rosterName || 'Unnamed driver';
      if (!d.transporterId) c.problem = `${label} has no Transporter ID on the routes file`;
      else if (!a)
        c.problem = `Transporter ID ${d.transporterId} (${label}) is not in the associate data`;
      else if (a.status !== 'ACTIVE')
        c.problem = `${a.name} (${d.transporterId}) is ${a.status} in the associate data`;
      c.valid = !c.problem;
      return c;
    });

    for (const c of listed) {
      if (c.problem) issues.push({ level: 'error', text: c.problem });
      if (c.nameMismatch)
        issues.push({
          level: 'warn',
          text: `Name check: routes file says "${c.routesName}" but ${c.transporterId} belongs to "${c.rosterName}" in the associate data`,
        });
    }
    if (sheet && !sheet.check.ok) {
      for (const p of sheet.check.problems)
        issues.push({ level: 'error', text: `Route sheet check failed: ${p}` });
    }
    if (sheet) for (const n of sheet.check.notes || []) issues.push({ level: 'info', text: n });

    // The state is set below, always before the result is returned.
    const res = {
      routeCode,
      hasSheet: !!sheet,
      onRoutesFile: !!route,
      sheet: summarizeSheet(sheet, wavePadFor(wavePads, sheet && sheet.waveTime)),
      listed,
      kind: !sheet
        ? 'no-sheet'
        : listed.length === 0
          ? 'unassigned'
          : listed.length > 1
            ? 'duplicate'
            : 'single',
      state: null as RouteState | null,
      source: 'auto',
      recipients: [] as Person[],
      suggestion: null as string | null,
      suggestionReason: null as string | null,
      headline: '',
      issues,
    } as Omit<RouteResult, 'state'> & { state: RouteState | null };

    // Suggest a recipient for duplicate routes: the only valid ID, or the only one not listed elsewhere.
    const valid = listed.filter((c) => c.valid);
    if (res.kind === 'duplicate' && valid.length) {
      const unique = valid.filter((c) => c.otherRoutes.length === 0);
      if (valid.length === 1) {
        res.suggestion = valid[0]!.transporterId;
        res.suggestionReason = 'Only active associate found in the associate data for this route';
      } else if (unique.length === 1) {
        res.suggestion = unique[0]!.transporterId;
        res.suggestionReason = 'Only driver on this route who is not also listed on another route';
      }
    }

    if (!sheet) {
      res.state = STATES.NO_SHEET;
      res.headline = 'No page for this route in the route sheet PDF';
      issues.unshift({
        level: 'error',
        text: `${routeCode} is on the routes file but has no page in the route sheet PDF, so there is nothing to send.`,
      });
      return res as RouteResult;
    }

    const decision = decisions[routeCode];
    if (decision) {
      res.source = 'decision';
      if (decision.skipped) {
        res.state = STATES.SKIPPED;
        res.headline = 'You chose not to send this route sheet';
        return res as RouteResult;
      }
      const chosen = (decision.recipients || [])
        .map((id) => roster.get(id))
        .filter((a): a is AssociateInput => !!a);
      const missing = (decision.recipients || []).filter((id) => !roster.has(id));
      for (const id of missing)
        issues.push({
          level: 'error',
          text: `Previously chosen recipient ${id} is no longer in the associate data`,
        });
      if (chosen.length) {
        res.recipients = chosen.map(person);
        res.state = STATES.READY;
        res.headline = decision.manual ? 'Assigned by you' : 'Resolved by you';
        for (const a of chosen)
          if (a.status !== 'ACTIVE')
            issues.push({
              level: 'warn',
              text: `${a.name} is ${a.status} — you chose to send anyway`,
            });
      }
    }

    if (!res.state) {
      res.source = 'auto';
      if (!sheet.check.ok) {
        res.state = STATES.EXCEPTION;
        res.headline =
          "Found this route's page, but the app couldn't read its tables. Check the original page, then send it so the driver uses the attached PDF.";
      } else if (res.kind === 'unassigned') {
        res.state = STATES.EXCEPTION;
        res.headline = route
          ? 'Routes file lists no driver for this route'
          : 'Route is in the PDF but not on the routes file';
        if (!route)
          issues.unshift({
            level: 'error',
            text: `${routeCode} has a route sheet page but is not on the routes file, so no driver is assigned.`,
          });
        else
          issues.unshift({
            level: 'error',
            text: `${routeCode} is on the routes file with no Transporter ID.`,
          });
      } else if (res.kind === 'duplicate') {
        res.state = STATES.NEEDS_DECISION;
        res.headline = `${listed.length} Transporter IDs are listed on this route`;
      } else if (!listed[0]!.valid) {
        res.state = STATES.EXCEPTION;
        res.headline = listed[0]!.problem ?? '';
      } else {
        const a = roster.get(listed[0]!.transporterId)!;
        res.recipients = [person(a)];
        res.state = STATES.READY;
        res.headline = 'Exact Transporter ID match';
      }
    }

    for (const r of res.recipients) {
      if (!r.email)
        issues.push({
          level: 'warn',
          text: `No email on file for ${r.name} — copy the sheet and send it another way`,
        });
    }
    return res as RouteResult;
  });

  results.sort(
    (a, b) =>
      stateOrder(a.state) - stateOrder(b.state) ||
      waveKey(a).localeCompare(waveKey(b)) ||
      a.routeCode.localeCompare(b.routeCode, undefined, { numeric: true }),
  );

  return {
    routes: results,
    people: summarizePeople(results, roster),
    counts: countStates(results),
    waves: summarizeWaves(sheets, wavePads),
  };
}

export function wavePadFor(
  wavePads: WavePads | null | undefined,
  waveTime: string | null | undefined,
): string | null {
  return (waveTime && wavePads && wavePads[waveTime]) || null;
}

/** Each wave time on the route sheets, earliest first, with how many routes it has and its pad. */
export function summarizeWaves(
  sheets: RouteSheet[],
  wavePads: WavePads | null | undefined,
): WaveSummary[] {
  const counts = new Map<string, number>();
  for (const s of sheets) {
    if (!s.waveTime) continue;
    counts.set(s.waveTime, (counts.get(s.waveTime) || 0) + 1);
  }
  return [...counts]
    .map(([waveTime, routes]) => ({ waveTime, routes, pad: wavePadFor(wavePads, waveTime) }))
    .sort((a, b) => waveSortKey(a.waveTime).localeCompare(waveSortKey(b.waveTime)));
}

function stateOrder(s: RouteState): number {
  return [
    STATES.NEEDS_DECISION,
    STATES.EXCEPTION,
    STATES.NO_SHEET,
    STATES.READY,
    STATES.SKIPPED,
  ].indexOf(s as never);
}

function waveKey(r: RouteResult): string {
  return waveSortKey(r.sheet && r.sheet.waveTime);
}

/** "09:50 AM" -> "09:50", "1:05 PM" -> "13:05", so wave times sort in clock order. */
export function waveSortKey(waveTime: string | null | undefined): string {
  if (!waveTime) return '99';
  const m = String(waveTime).match(/(\d+):(\d+)\s*([AP])M/i);
  if (!m) return String(waveTime);
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === 'P') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function countStates(results: RouteResult[]): StateCounts {
  const counts: Record<string, number> = { total: results.length };
  for (const s of Object.values(STATES)) counts[s] = 0;
  for (const r of results) counts[r.state] = (counts[r.state] ?? 0) + 1;
  counts.missingEmail = results.filter(
    (r) => r.state === STATES.READY && r.recipients.some((p) => !p.email),
  ).length;
  return counts as StateCounts;
}

/** Everyone named on the routes file who ends up with no route sheet, and why; plus anyone getting more than one. */
export function summarizePeople(
  results: RouteResult[],
  roster: Map<string, AssociateInput>,
): PeopleSummary {
  const received = new Map<string, string[]>(); // transporterId -> [routeCodes]
  for (const r of results) {
    if (r.state !== STATES.READY) continue;
    for (const p of r.recipients) {
      const list = received.get(p.transporterId);
      if (list) list.push(r.routeCode);
      else received.set(p.transporterId, [r.routeCode]);
    }
  }

  const missing = new Map<string, MissingPerson>();
  for (const r of results) {
    for (const c of r.listed) {
      const key = c.transporterId || `name:${c.routesName}`;
      if (c.transporterId && received.has(c.transporterId)) continue;
      let entry = missing.get(key);
      if (!entry) {
        entry = {
          transporterId: c.transporterId,
          name: c.rosterName || c.routesName || '(no name)',
          inRoster: c.found,
          status: c.status,
          routes: [],
        };
        missing.set(key, entry);
      }
      entry.routes.push({ routeCode: r.routeCode, reason: reasonNotReceiving(r, c) });
    }
  }

  const multiple = [...received.entries()]
    .filter(([, codes]) => codes.length > 1)
    .map(([id, codes]) => ({
      transporterId: id,
      name: roster.get(id)?.name || id,
      routes: codes,
    }));

  return {
    notReceiving: [...missing.values()].sort((a, b) => a.name.localeCompare(b.name)),
    multiple,
  };
}

function reasonNotReceiving(r: RouteResult, c: ListedCandidate): string {
  const others = r.listed
    .filter((x) => x !== c)
    .map((x) => x.rosterName || x.routesName || x.transporterId);
  switch (r.state) {
    case STATES.NO_SHEET:
      return `No page for ${r.routeCode} in the route sheet PDF`;
    case STATES.SKIPPED:
      return `You chose not to send ${r.routeCode}`;
    case STATES.READY:
      return `${r.routeCode} is going to ${r.recipients.map((p) => p.name).join(' & ')} instead`;
    case STATES.NEEDS_DECISION:
      return `Waiting on your decision — ${r.routeCode} also lists ${others.join(', ')}`;
    default:
      return c.problem || r.headline;
  }
}
