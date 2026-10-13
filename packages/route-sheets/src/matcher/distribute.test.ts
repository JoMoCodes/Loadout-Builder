import { describe, expect, it } from 'vitest';
import { distribute, type Distribution } from './distribute';
import { namesAgree } from './names';
import { ASSOCIATES, ID, ROUTES, SHEETS } from './testkit';

const byCode = (d: Distribution, code: string) => d.routes.find((r) => r.routeCode === code)!;

describe('names', () => {
  it('Name check tolerates middle names but catches a different person', () => {
    expect(namesAgree('Abigail Gresham', 'Abigail Damian Gresham')).toBe(true);
    expect(namesAgree('Amelia Blackwell', 'Amelia Aaron  Blackwell')).toBe(true);
    expect(namesAgree('Adrian Danforth', 'Abigail Damian Gresham')).toBe(false);
  });
});

describe('distribute', () => {
  it('Distribute: exact single match is ready; everything else needs a person to decide', () => {
    const d = distribute({ sheets: SHEETS, routes: ROUTES, associates: ASSOCIATES });
    expect(byCode(d, 'CX101').state).toBe('ready');
    expect(byCode(d, 'CX101').recipients.map((p) => p.transporterId)).toEqual([ID.abigail]);

    const dup = byCode(d, 'CX102');
    expect(dup.state).toBe('needs-decision');
    expect(dup.suggestion).toBe(ID.adrian); // Beatrice is on two routes, so Adrian is suggested

    expect(byCode(d, 'CX104').state).toBe('exception');
    expect(byCode(d, 'CX104').headline).toMatch(/INACTIVE/);
    expect(byCode(d, 'CX105').state).toBe('exception');
    expect(byCode(d, 'CX105').headline).toMatch(/not in the associate data/);
    expect(byCode(d, 'CX107').state).toBe('exception');
    expect(byCode(d, 'CX107').headline).toMatch(/not on the routes file/);
    expect(byCode(d, 'CX108').state).toBe('exception');
    expect(byCode(d, 'CX108').headline).toMatch(/couldn't read its tables.*attached PDF/);
    expect(byCode(d, 'CX999').state).toBe('no-sheet');
  });

  it('Distribute: explains who gets no route sheet and why; flags people getting several', () => {
    const d = distribute({
      sheets: SHEETS,
      routes: ROUTES,
      associates: ASSOCIATES,
      decisions: { CX102: { recipients: [ID.adrian] }, CX103: { skipped: true } },
    });
    const beatrice = d.people.notReceiving.find((p) => p.transporterId === ID.beatrice)!;
    expect(beatrice.routes.map((r) => r.reason)).toEqual([
      'CX102 is going to Adrian Danforth instead',
      'You chose not to send CX103',
    ]);
    const caleb = d.people.notReceiving.find((p) => p.transporterId === ID.caleb)!;
    expect(caleb.inRoster).toBe(false);
    expect(caleb.routes[0]!.reason).toMatch(/not in the associate data/);
    const abigail = d.people.notReceiving.find((p) => p.transporterId === ID.abigail);
    // Abigail receives CX101, so she is not listed even though CX999 has no sheet
    expect(abigail).toBeUndefined();
    expect(d.people.multiple.map((p) => [p.transporterId, p.routes])).toEqual([
      [ID.abigail, ['CX101', 'CX106']],
    ]);
  });

  it('Distribute: manual assignment resolves an exception', () => {
    const d = distribute({
      sheets: SHEETS,
      routes: ROUTES,
      associates: ASSOCIATES,
      decisions: { CX107: { recipients: [ID.beatrice], manual: true } },
    });
    expect(byCode(d, 'CX107').state).toBe('ready');
    expect(byCode(d, 'CX107').recipients[0]!.name).toBe('Beatrice Redmond');
  });

  it('Distribute: lists each wave time in clock order with its route count and pad', () => {
    const d = distribute({
      sheets: SHEETS,
      routes: ROUTES,
      associates: ASSOCIATES,
      wavePads: { '09:55 AM': '2' },
    });
    expect(d.waves).toEqual([
      { waveTime: '09:50 AM', routes: 1, pad: null },
      { waveTime: '09:55 AM', routes: 7, pad: '2' },
    ]);
    expect(byCode(d, 'CX101').sheet!.pad).toBeNull();
    expect(byCode(d, 'CX102').sheet!.pad).toBe('2');
    // a route with no page has no sheet, so no pad
    expect(byCode(d, 'CX999').sheet).toBeNull();
  });
});
