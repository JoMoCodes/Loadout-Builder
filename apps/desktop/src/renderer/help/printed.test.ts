import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRINTED_EVENT, notePrinted } from './printed';

let heard: number;

beforeEach(() => {
  heard = 0;
  const target = new EventTarget();
  target.addEventListener(PRINTED_EVENT, () => (heard += 1));
  vi.stubGlobal('window', target);
});

afterEach(() => vi.unstubAllGlobals());

describe('the "a roster was printed" note for the checklist', () => {
  it('is sent when Print Page or an export wrote a file', () => {
    notePrinted('print:print', { ok: true, value: { status: 'written', fileName: 'x.pdf' } });
    notePrinted('print:export', { ok: true, value: { status: 'written', fileName: 'x.xlsx' } });
    expect(heard).toBe(2);
  });

  it('is not sent when nothing was written', () => {
    notePrinted('print:print', { ok: true, value: { status: 'cancelled' } });
    notePrinted('print:export', { ok: true, value: { status: 'nothing', reason: 'no-roster' } });
    notePrinted('print:print', { ok: false, reason: 'failed' });
    notePrinted('print:preview', { ok: true, value: { status: 'written' } });
    notePrinted('files:import', { ok: true, value: { status: 'written' } });
    notePrinted('print:print', null);
    expect(heard).toBe(0);
  });
});
