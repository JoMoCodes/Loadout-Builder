// What the Associates tables say, worked out from the snapshot. The columns, words and colour
// rules are the old Associates page's.

import {
  QUAL_DOT,
  QUAL_EDV,
  QUAL_STEP_VAN,
  hasQualification,
  qualificationCounts,
  qualificationVocabulary,
  qualificationsLabel,
  tenureCount,
  tenureLabel,
} from '@loadout/core';
import type { AppSnapshot, AssociateView } from '../../../shared/snapshot';
import { plural } from '../dataPages/format';

export const ALL_STATUSES = 'All statuses';
export const ALL_QUALS = 'All qualifications';
export const STATUS_OPTIONS = [ALL_STATUSES, 'ACTIVE', 'INACTIVE'] as const;

export const ASSOCIATES_EMPTY = {
  title: 'No associate data loaded.',
  body: 'Import AssociateData.csv to match drivers to their Transporter IDs, qualifications and ID expirations.',
};

export const idOf = (view: AssociateView) => view.associate.transporterId || view.associate.name;

export type Tone = 'bad' | 'warn' | '';

/** "2026-11-30", "2026-11-30  (expired)" or "2026-11-30  (12d left)", with the colour to show it in. */
export function expiryText(view: AssociateView): { text: string; tone: Tone } {
  const stamp = view.associate.idExpiration;
  if (stamp === null) return { text: '', tone: '' };
  if (view.idState === 'expired') return { text: `${stamp}  (expired)`, tone: 'bad' };
  if (view.idState === 'expiring') {
    return { text: `${stamp}  (${view.daysUntilIdExpiry}d left)`, tone: 'warn' };
  }
  return { text: stamp, tone: '' };
}

export function associateCell(view: AssociateView, columnId: string): string {
  const { associate } = view;
  switch (columnId) {
    case 'name':
      return associate.name;
    case 'transporter_id':
      return associate.transporterId;
    case 'status':
      return associate.status;
    case 'tenure':
      return tenureLabel(associate);
    case 'vans':
      return view.vanBadges;
    case 'id_expiration':
      return expiryText(view).text;
    case 'on_loadout':
      return view.onRoster ? 'Yes' : '';
    case 'qualifications':
      return qualificationsLabel(associate);
    case 'personal_phone':
      return associate.personalPhone;
    case 'work_phone':
      return associate.workPhone;
    case 'email':
      return associate.email;
    default:
      return '';
  }
}

export const ASSOCIATE_COLUMNS = [
  { id: 'name', header: 'Name' },
  { id: 'transporter_id', header: 'Transporter ID', mono: true },
  { id: 'status', header: 'Status' },
  { id: 'tenure', header: 'Lifetime Routes', align: 'center' },
  { id: 'vans', header: 'Vans' },
  { id: 'id_expiration', header: 'ID Expires' },
  { id: 'on_loadout', header: 'On Load Out', align: 'center' },
  { id: 'qualifications', header: 'Qualifications' },
  { id: 'personal_phone', header: 'Personal Phone' },
  { id: 'work_phone', header: 'Work Phone' },
  { id: 'email', header: 'Email' },
] as const;

export const isActiveStatus = (view: AssociateView) =>
  view.associate.status.trim().toUpperCase() === 'ACTIVE';

/** Red for an expired ID, amber when it is close, grey for someone who is not active. */
export function associateTone(view: AssociateView): 'bad' | 'warn' | 'ghost' | undefined {
  const { tone } = expiryText(view);
  if (tone) return tone;
  return isActiveStatus(view) ? undefined : 'ghost';
}

export function passesAssociateFilters(
  view: AssociateView,
  status: string,
  qualification: string,
  onLoadOutOnly: boolean,
): boolean {
  if (status !== ALL_STATUSES && view.associate.status.toUpperCase() !== status) return false;
  if (qualification !== ALL_QUALS && !hasQualification(view.associate, qualification)) return false;
  if (onLoadOutOnly && !view.onRoster) return false;
  return true;
}

export function qualificationOptions(views: readonly AssociateView[]): string[] {
  return [ALL_QUALS, ...qualificationVocabulary({ rows: views.map((view) => view.associate) })];
}

/** "EDV: 12   Step Van: 8   DOT: 20". */
export function qualificationLine(views: readonly AssociateView[]): string {
  const counts = qualificationCounts({ rows: views.map((view) => view.associate) });
  return (
    `EDV: ${counts.get(QUAL_EDV) ?? 0}   ` +
    `Step Van: ${counts.get(QUAL_STEP_VAN) ?? 0}   ` +
    `DOT: ${counts.get(QUAL_DOT) ?? 0}`
  );
}

/** "IDs expired: 1   expiring soon: 2   lifetime routes: 68/78   on load out: 30/40". */
export function expiryLine(snapshot: AppSnapshot): string {
  const views = snapshot.associates;
  const expired = views.filter((view) => view.idState === 'expired').length;
  const expiring = views.filter((view) => view.idState === 'expiring').length;
  const withCount = tenureCount({ rows: views.map((view) => view.associate) });
  const parts = [
    `IDs expired: ${expired}`,
    `expiring soon: ${expiring}`,
    `lifetime routes: ${withCount}/${views.length}`,
  ];
  if (snapshot.roster.rows.length > 0) {
    parts.push(`on load out: ${snapshot.counts.matched}/${snapshot.roster.rows.length}`);
  }
  return parts.join('   ');
}

/** "78 associates  -  60 active". */
export function associateCountLine(snapshot: AppSnapshot): string {
  return `${snapshot.associates.length} associates  -  ${snapshot.counts.activeAssociates} active`;
}

/** What the status says after the associate list came in. */
export function associatesImportedMessage(
  snapshot: AppSnapshot,
  rows: number,
  fileName: string,
): string {
  let tail = '';
  if (snapshot.roster.rows.length > 0) {
    const review = snapshot.counts.needReview;
    tail = ` ${snapshot.counts.matched} of ${snapshot.roster.rows.length} drivers on the roster found`;
    tail += review ? ` (${review} need review).` : '.';
  }
  return `Imported ${rows} associates from ${fileName}.${tail}`;
}

/** What the status says after a Tenured Workforce file was folded in. */
export function tenureImportedMessage(result: {
  fileName: string;
  fileWeek: string;
  kept: number;
  keptWeek: string;
  older: boolean;
  covered: number;
  associates: number;
}): string {
  let source = result.fileName;
  if (result.older) {
    source += ` (${result.fileWeek}) - older than what's on file, newer counts kept`;
  }
  const tail =
    result.associates === 0
      ? ' Import associate data to see them against their records.'
      : ` ${result.covered}/${result.associates} associates covered.`;
  return `Imported ${source}. Lifetime routes for ${result.kept} drivers, through ${result.keptWeek}.${tail}`;
}

/** The sentence over the Lifetime Routes tab's numbers. */
export function tenureHeadline(snapshot: AppSnapshot): string {
  const { records, weekLabel } = snapshot.tenure;
  if (records === 0) return 'No Lifetime Routes counts kept yet';
  return `${plural(records, 'driver')} with a count${weekLabel ? `, through ${weekLabel}` : ''}`;
}
