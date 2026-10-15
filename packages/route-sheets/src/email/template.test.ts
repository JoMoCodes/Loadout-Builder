import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE_SHEET_WORDING,
  fillRouteSheetTemplate,
  type RouteSheetValues,
} from './template';

const full: RouteSheetValues = {
  name: 'Abigail',
  route: 'CX108',
  date: 'Thu, Sep 24, 2026',
  staging: 'STG.A1',
  wave: '09:50 AM',
  pad: '3',
};

describe('route sheet email wording', () => {
  it('fills every placeholder', () => {
    expect(fillRouteSheetTemplate(DEFAULT_ROUTE_SHEET_WORDING.subjectTemplate, full)).toBe(
      'Route Sheet: CX108 · STG.A1 · Thu, Sep 24, 2026 · 09:50 AM · Pad 3',
    );
    expect(fillRouteSheetTemplate(DEFAULT_ROUTE_SHEET_WORDING.bodyTemplate, full)).toBe(
      'Hi Abigail, here is your route sheet for Thu, Sep 24, 2026.',
    );
    expect(fillRouteSheetTemplate('{route}{route} {pad}', full)).toBe('CX108CX108 3');
  });

  it('an empty pad or wave disappears with its piece of the line, as the old subject did', () => {
    const subject = DEFAULT_ROUTE_SHEET_WORDING.subjectTemplate;
    expect(fillRouteSheetTemplate(subject, { ...full, pad: '' })).toBe(
      'Route Sheet: CX108 · STG.A1 · Thu, Sep 24, 2026 · 09:50 AM',
    );
    expect(fillRouteSheetTemplate(subject, { ...full, pad: '', wave: '' })).toBe(
      'Route Sheet: CX108 · STG.A1 · Thu, Sep 24, 2026',
    );
    expect(fillRouteSheetTemplate(subject, { ...full, wave: '' })).toBe(
      'Route Sheet: CX108 · STG.A1 · Thu, Sep 24, 2026 · Pad 3',
    );
  });

  it('a line whose every piece is emptied goes, and nobody to greet means no greeting', () => {
    expect(
      fillRouteSheetTemplate(DEFAULT_ROUTE_SHEET_WORDING.bodyTemplate, { ...full, name: '' }),
    ).toBe('');
    expect(
      fillRouteSheetTemplate('Hi {name},\nYour route is {route}.\nPad {pad}\nSee you!', {
        ...full,
        name: '',
        pad: '',
      }),
    ).toBe('Your route is CX108.\nSee you!');
    // A line with no placeholder stays, even when it is blank.
    expect(fillRouteSheetTemplate('Hello\n\n{pad}', { ...full, pad: '' })).toBe('Hello\n');
  });

  it('leaves unknown braces alone and tidies Windows line ends', () => {
    expect(fillRouteSheetTemplate('{route} {other} {}', full)).toBe('CX108 {other} {}');
    expect(fillRouteSheetTemplate('a\r\nb {pad}', { ...full, pad: '' })).toBe('a');
    expect(fillRouteSheetTemplate('', full)).toBe('');
  });
});
