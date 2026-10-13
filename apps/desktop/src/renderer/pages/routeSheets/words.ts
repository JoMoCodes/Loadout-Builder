// The words the Route Sheets page says, as plain functions so they can be tested on their own.
// Most of the wording is the old Route Sheet Distributor's.

import type { ListedCandidate, RouteResult, RouteState } from '@loadout/route-sheets';
import type { Tone } from '../../ui/chip';
import type {
  EmailRoutesResult,
  RouteDataKindInUse,
  RouteSheetsStateView,
} from '../../../shared/routeSheets';
import { plural } from '../dataPages/format';

/** Each state's words and the app's tone for it (the old app's labels and colours). */
export const STATE_INFO: Record<RouteState, { label: string; tone: Tone }> = {
  ready: { label: 'Ready to send', tone: 'ok' },
  'needs-decision': { label: 'Needs your decision', tone: 'warn' },
  exception: { label: 'No exact match', tone: 'bad' },
  'no-sheet': { label: 'No route sheet', tone: 'bad' },
  skipped: { label: 'Not sending', tone: 'neutral' },
};

/** How a route sheet went out, in the old app's words. */
export const SENT_LABEL: Record<string, string> = {
  emailed: 'Emailed',
  copied: 'Copied',
  draft: 'Draft opened',
  'mail-app': 'Mail app opened',
  manual: 'Marked sent',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 13, 9:05 AM", the old app's short date and time, or '' when there is none. */
export function shortWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const hour = when.getHours() % 12 || 12;
  const half = when.getHours() < 12 ? 'AM' : 'PM';
  const minutes = String(when.getMinutes()).padStart(2, '0');
  return `${MONTHS[when.getMonth()]} ${when.getDate()}, ${hour}:${minutes} ${half}`;
}

/** The tick after a route sheet that went out: "✓ Emailed Oct 13, 9:05 AM". */
export function sentWords(mark: { how: string; at: string }): string {
  return `✓ ${SENT_LABEL[mark.how] ?? 'Sent'} ${shortWhen(mark.at)}`.trim();
}

/** The first word of a name ("Send to Carmen"). */
export function firstName(name: string | null | undefined): string {
  return String(name ?? '').split(/\s+/)[0] ?? '';
}

/** The name a listed driver goes by: the driver list's, else the Routes file's. */
export function candidateName(c: ListedCandidate): string {
  return c.rosterName || c.routesName || '(no name)';
}

/** "Staging · 10:20 AM · Pad 3 · 212 pkgs · Standard Parcel": the old app's line under a route. */
export function routeMeta(r: RouteResult): string {
  const s = r.sheet;
  if (!s) return 'No route sheet page';
  return [
    s.staging,
    s.waveTime,
    s.pad && `Pad ${s.pad}`,
    s.totalPackages !== null ? `${s.totalPackages} pkgs` : null,
    s.serviceType,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What the page says about the route data the matching reads. */
export function routeDataWords(routeData: RouteSheetsStateView['routeData']): string {
  if (!routeData) {
    return 'No Routes export is loaded. Bring in the Routes export on the Route Data page, so each route sheet can be matched to its driver.';
  }
  const what: Record<RouteDataKindInUse, string> = {
    routes: 'the Routes export',
    itineraries: 'the Itineraries export',
    schedule: 'the Weekly Schedule',
  };
  return `Using ${what[routeData.kind]} ${routeData.fileName}`.trim();
}

/** True once the driver list is due for a newer copy (one calendar month after it came in). */
export function isOverdue(refreshDueAt: string | null, now: Date = new Date()): boolean {
  if (!refreshDueAt) return false;
  const due = Date.parse(refreshDueAt);
  return !Number.isNaN(due) && now.getTime() >= due;
}

/** Whole days since a time, never below 0. */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.floor((now.getTime() - at) / 86_400_000));
}

/** A wave time as a test id part: "10:20 AM" -> "10-20-AM". */
export function waveId(waveTime: string): string {
  return waveTime.replace(/[\s:]+/g, '-');
}

/** What Accept all suggestions did. */
export function acceptedWords(n: number): string {
  return `Accepted ${plural(n, 'suggestion')}.`;
}

/** The tally after Email all: "Sent 3. Could not send 1: CX2: reason. Left out 1: CX4: reason." */
export function emailAllWords(result: EmailRoutesResult): string {
  const parts = [`Sent ${result.sent.length}.`];
  if (result.failed.length) {
    parts.push(
      `Could not send ${result.failed.length}: ${result.failed
        .map((f) => `${f.routeCode}: ${trimStop(f.error)}`)
        .join('; ')}.`,
    );
  }
  if (result.skipped.length) {
    parts.push(
      `Left out ${result.skipped.length}: ${result.skipped
        .map((s) => `${s.routeCode}: ${trimStop(s.reason)}`)
        .join('; ')}.`,
    );
  }
  return parts.join(' ');
}

/** What Send email did for one route. */
export function sendOneWords(routeCode: string, result: EmailRoutesResult, to: string[]): string {
  if (result.sent.includes(routeCode)) {
    return `Emailed ${routeCode}${to.length ? ` to ${to.join(', ')}` : ''}.`;
  }
  return emailAllWords(result);
}

/** What Export all did. */
export function exportWords(drafts: number, folder: string): string {
  return `Wrote ${plural(drafts, 'email draft')} and the PDFs into ${folder}.`;
}

/** The words in the Notes column of All routes. */
export function routeNotes(r: RouteResult): string {
  const notes: string[] = [];
  if (r.source === 'decision') notes.push('Your choice');
  if (r.state === 'ready' && r.recipients.some((p) => !p.email)) notes.push('No email on file');
  if (r.state !== 'ready') notes.push(r.headline);
  return notes.filter(Boolean).join('. ');
}

function trimStop(text: string): string {
  return text.replace(/\.\s*$/, '');
}
