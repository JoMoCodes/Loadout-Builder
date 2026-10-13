import { describe, expect, it } from 'vitest';
import {
  acceptedWords,
  daysSince,
  emailAllWords,
  exportWords,
  firstName,
  isOverdue,
  routeDataWords,
  sendOneWords,
  sentWords,
  shortWhen,
  waveId,
} from './words';

describe('the Route Sheets page’s words', () => {
  it('names the route data it reads, and asks for the Routes export when none is loaded', () => {
    expect(routeDataWords(null)).toMatch(
      /^No Routes export is loaded\. Bring in the Routes export/,
    );
    expect(routeDataWords({ kind: 'routes', label: 'Routes', fileName: 'Routes_XXX1.xlsx' })).toBe(
      'Matching with the Routes export: Routes_XXX1.xlsx.',
    );
    expect(
      routeDataWords({ kind: 'itineraries', label: 'Itineraries', fileName: 'Itin.xlsx' }),
    ).toBe('Matching with the Itineraries export: Itin.xlsx.');
    expect(
      routeDataWords({ kind: 'schedule', label: 'Weekly Schedule', fileName: 'Week-38.xlsx' }),
    ).toBe('Matching with the Weekly Schedule: Week-38.xlsx.');
  });

  it('says the driver list is over a month old once its due time has come', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue('2026-10-14T00:00:00Z', now)).toBe(false);
    expect(isOverdue('2026-10-13T12:00:00Z', now)).toBe(true);
    expect(isOverdue('not a date', now)).toBe(false);
    expect(daysSince('2026-09-01T12:00:00Z', now)).toBe(42);
    expect(daysSince(null, now)).toBe(0);
  });

  it('turns a wave time into a test id part', () => {
    expect(waveId('10:20 AM')).toBe('10-20-AM');
    expect(waveId('02:30 PM')).toBe('02-30-PM');
  });

  it('says what was done in plain words', () => {
    expect(acceptedWords(1)).toBe('Accepted 1 suggestion.');
    expect(acceptedWords(3)).toBe('Accepted 3 suggestions.');
    expect(exportWords(1, 'Route sheets XXX1')).toBe(
      'Wrote 1 email draft and the PDFs into Route sheets XXX1.',
    );
    expect(firstName('Carmen Abernathy')).toBe('Carmen');
    expect(
      sendOneWords('CX101', { sent: ['CX101'], failed: [], skipped: [] }, ['a@example.com']),
    ).toBe('Emailed CX101 to a@example.com.');
  });

  it('tallies Email all: sent, could not send, left out', () => {
    expect(emailAllWords({ sent: ['CX101', 'CX102'], failed: [], skipped: [] })).toBe('Sent 2.');
    expect(
      emailAllWords({
        sent: ['CX101'],
        failed: [{ routeCode: 'CX102', error: 'The email server refused this address.' }],
        skipped: [
          { routeCode: 'CX103', reason: 'No email address on file' },
          { routeCode: 'CX104', reason: 'Not ready' },
        ],
      }),
    ).toBe(
      'Sent 1. Could not send 1: CX102: The email server refused this address. ' +
        'Left out 2: CX103: No email address on file; CX104: Not ready.',
    );
  });

  it('marks a route sheet that went out with how and when', () => {
    const at = new Date(2026, 9, 13, 9, 5).toISOString();
    expect(shortWhen(at)).toBe('Oct 13, 9:05 AM');
    expect(sentWords({ how: 'emailed', at })).toBe('✓ Emailed Oct 13, 9:05 AM');
    expect(sentWords({ how: 'manual', at })).toBe('✓ Marked sent Oct 13, 9:05 AM');
    expect(shortWhen(null)).toBe('');
  });
});
