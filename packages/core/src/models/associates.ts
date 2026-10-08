// The Amazon associate export: the anchor record for every driver.

import {
  ID_EXPIRY_WARNING_DAYS,
  QUAL_BADGES,
  QUAL_DOT,
  QUAL_EDV,
  QUAL_STEP_VAN,
  SHIFT_REQUIREMENTS,
} from './constants';
import { daysBetween, todayDate, type IsoDate } from './dates';
import { sortedText } from './clock';

/** One row of the associate export. The Transporter ID ties a driver to route and van data. */
export interface Associate {
  name: string;
  transporterId: string;
  position: string;
  qualifications: readonly string[];
  idExpiration: IsoDate | null;
  personalPhone: string;
  workPhone: string;
  email: string;
  status: string;
  /**
   * Lifetime routes delivered, off the Tenured Workforce export. null where no
   * import has covered them yet. null is not zero: an unknown count reads as brand new.
   */
  tenure: number | null;
}

export function createAssociate(values: Partial<Associate> = {}): Associate {
  return {
    name: '',
    transporterId: '',
    position: '',
    qualifications: [],
    idExpiration: null,
    personalPhone: '',
    workPhone: '',
    email: '',
    status: '',
    tenure: null,
    ...values,
  };
}

export function isActive(associate: Pick<Associate, 'status'>): boolean {
  return associate.status.trim().toUpperCase() === 'ACTIVE';
}

/** Tenure as a number to compare. Unknown reads as brand new. */
export function tenureRoutes(associate: Pick<Associate, 'tenure'>): number {
  return associate.tenure ?? 0;
}

/** '158', or '' where no import has covered them. */
export function tenureLabel(associate: Pick<Associate, 'tenure'>): string {
  return associate.tenure !== null ? String(associate.tenure) : '';
}

export function hasQualification(
  associate: Pick<Associate, 'qualifications'>,
  qualification: string,
): boolean {
  const target = qualification.trim().toLowerCase();
  return associate.qualifications.some((q) => q.trim().toLowerCase() === target);
}

export function canDriveEdv(associate: Pick<Associate, 'qualifications'>): boolean {
  return hasQualification(associate, QUAL_EDV);
}

export function canDriveStepVan(associate: Pick<Associate, 'qualifications'>): boolean {
  return hasQualification(associate, QUAL_STEP_VAN);
}

export function isDotCertified(associate: Pick<Associate, 'qualifications'>): boolean {
  return hasQualification(associate, QUAL_DOT);
}

export function qualificationsLabel(associate: Pick<Associate, 'qualifications'>): string {
  return associate.qualifications.join(', ');
}

/** Compact badge string, e.g. 'CDV EDV SV DOT'. */
export function vanBadges(associate: Pick<Associate, 'qualifications'>): string {
  return QUAL_BADGES.filter(([qualification]) => hasQualification(associate, qualification))
    .map(([, badge]) => badge)
    .join(' ');
}

export function daysUntilIdExpiry(
  associate: Pick<Associate, 'idExpiration'>,
  today: IsoDate = todayDate(),
): number | null {
  return associate.idExpiration === null ? null : daysBetween(associate.idExpiration, today);
}

export type ExpiryState = 'unknown' | 'expired' | 'expiring' | 'ok';

export function idState(
  associate: Pick<Associate, 'idExpiration'>,
  today: IsoDate = todayDate(),
): ExpiryState {
  const days = daysUntilIdExpiry(associate, today);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= ID_EXPIRY_WARNING_DAYS) return 'expiring';
  return 'ok';
}

/** Qualifications this associate lacks for the given shift type. */
export function missingForShift(
  associate: Pick<Associate, 'qualifications'>,
  shiftType: string,
): string[] {
  const required = SHIFT_REQUIREMENTS.get(shiftType) ?? [];
  return required.filter((q) => !hasQualification(associate, q));
}

/** The imported associate roster. */
export interface AssociateBook {
  rows: Associate[];
  sourceFile: string;
  importedAt: Date | null;
}

export function createAssociateBook(values: Partial<AssociateBook> = {}): AssociateBook {
  return { rows: [], sourceFile: '', importedAt: null, ...values };
}

export function activeCount(book: Pick<AssociateBook, 'rows'>): number {
  return book.rows.filter(isActive).length;
}

/** How many have a route count on file, the rest being unknown. */
export function tenureCount(book: Pick<AssociateBook, 'rows'>): number {
  return book.rows.filter((a) => a.tenure !== null).length;
}

export function qualificationCounts(book: Pick<AssociateBook, 'rows'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const associate of book.rows) {
    for (const qualification of associate.qualifications) {
      counts.set(qualification, (counts.get(qualification) ?? 0) + 1);
    }
  }
  return counts;
}

export function qualificationVocabulary(book: Pick<AssociateBook, 'rows'>): string[] {
  return sortedText(qualificationCounts(book).keys());
}

/** Transporter ID -> associate. Where an ID repeats, the later row wins. */
export function byTransporterId(book: Pick<AssociateBook, 'rows'>): Map<string, Associate> {
  const found = new Map<string, Associate>();
  for (const associate of book.rows) {
    if (associate.transporterId) found.set(associate.transporterId, associate);
  }
  return found;
}
