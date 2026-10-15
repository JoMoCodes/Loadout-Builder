import { describe, expect, it } from 'vitest';
import { SHEETS } from '../matcher/testkit';
import type { SheetWithPad } from '../types';
import { renderEmailHtml, renderEmailText, subjectFor } from './render';
import { DEFAULT_ROUTE_SHEET_WORDING } from './template';

const first = SHEETS[0]!;

describe('email', () => {
  it('Email: when the page failed its number check, the email tells the driver to use the attached PDF', () => {
    const bad = SHEETS.find((x) => x.routeCode === 'CX108')!;
    expect(bad.check.ok).toBe(false);
    expect(renderEmailHtml(bad, { name: 'Abigail Gresham' })).toContain(
      '<b>Please use the attached PDF.</b>',
    );
    expect(renderEmailText(bad, { name: 'Abigail Gresham' })).toMatch(
      /PLEASE USE THE ATTACHED PDF/,
    );
    // a page that read fine has no such note
    expect(renderEmailHtml(first, { name: 'Abigail Gresham' })).not.toContain('attached PDF');
  });

  it('Email HTML escapes values and marks blank cells', () => {
    const s = { ...first, staging: '<b>x</b>' };
    const html = renderEmailHtml(s, { name: 'Abigail Damian Gresham' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('Hi Abigail,');
    expect(html).toContain('blank on sheet');
  });

  it('Email: the pad shows as its own box and in the subject only when one is set', () => {
    const plain = first;
    expect(renderEmailHtml(plain)).not.toContain('Pad #');
    expect(subjectFor(plain)).not.toContain('Pad');

    const s = { ...plain, pad: '3 <b>' };
    const html = renderEmailHtml(s, { name: 'Abigail Damian Gresham' });
    expect(html).toContain('Pad #');
    expect(html).toContain('3 &lt;b&gt;'); // the pad is escaped like every other value
    expect(subjectFor(s).endsWith(' · 09:50 AM · Pad 3 <b>')).toBe(true);
    expect(renderEmailText(s)).toMatch(/\r\nPAD #: 3 <b>\r\n/);
  });

  it('Email: the pad is a tall box on the right, beside the route, staging, wave and date', () => {
    const plain = first;
    const html = renderEmailHtml({ ...plain, pad: '12' });
    const topRow = html.slice(html.indexOf('<tr>'), html.indexOf('</tr>'));
    expect(topRow.match(/>(Route|Staging|Pad #)</g)).toEqual(['>Route<', '>Staging<', '>Pad #<']);
    // reaches down beside Wave and Date
    expect(topRow).toMatch(/<td rowspan="2"[^>]*>\s*<div[^>]*>Pad #</);
    expect(renderEmailHtml(plain)).not.toContain('rowspan'); // no pad, no pad column

    // "Pad #" is bigger and bolder than the other labels.
    const labelSize = (label: string) =>
      Number(html.match(new RegExp(`font-size:(\\d+)px;[^"]*">${label}<`))![1]);
    expect(labelSize('Pad #')).toBeGreaterThan(labelSize('Route'));
    expect(html).toMatch(/font-weight:800;[^"]*">Pad #</);

    // Values never split onto two lines by themselves, even on a narrow phone.
    expect(html).toMatch(/white-space:nowrap;">09:50 AM</);

    const size = (pad: string) =>
      Number(
        renderEmailHtml({ ...plain, pad }).match(
          />Pad #<\/div>\s*<div style="font-size:(\d+)px;/,
        )![1],
      );
    expect(size('1')).toBe(size('12'));
    // longer pads get a smaller number so they fit
    expect(size('12')).toBeGreaterThan(size('B12'));
    expect(size('B12')).toBeGreaterThan(size('DOOR 10 B2'));
  });

  it('Email: the Date box shows the full day name, with the date on the line under it', () => {
    const dateBox = (sheet: typeof first) =>
      renderEmailHtml(sheet).match(/>Date<\/div>\s*<div style="([^"]*)">(.*?)<\/div>/)!;
    const [, style, text] = dateBox(first);
    expect(text).toBe('Thursday<br>Sep 24, 2026');
    expect(style).toMatch(/white-space:nowrap;/); // "Sep 24" stays with "2026"

    const days = {
      MON: 'Monday',
      TUE: 'Tuesday',
      WED: 'Wednesday',
      THU: 'Thursday',
      FRI: 'Friday',
      SAT: 'Saturday',
      SUN: 'Sunday',
    };
    for (const [abbr, day] of Object.entries(days))
      expect(dateBox({ ...first, dateLabel: `${abbr}, MAY 5, 2027` })[2]).toBe(
        `${day}<br>May 5, 2027`,
      );
    // no printed date: the plain one, as before
    expect(dateBox({ ...first, dateLabel: null })[2]).toBe('2026-09-24');
  });

  it('Email: the greeting says the full day name too; the subject keeps it short', () => {
    const who = { name: 'Abigail Gresham' };
    expect(renderEmailHtml(first, who)).toContain(
      'Hi Abigail, here is your route sheet for <span style="white-space:nowrap;">Thursday, Sep 24, 2026.</span></p>',
    );
    const text = renderEmailText(first, who);
    expect(
      text.startsWith('Hi Abigail, here is your route sheet for Thursday, Sep 24, 2026.\r\n'),
    ).toBe(true);
    expect(text).toMatch(/\r\nWAVE: 09:50 AM {4}DATE: Thursday, Sep 24, 2026\r\n/);
    expect(subjectFor(first)).toMatch(/ · Thu, Sep 24, 2026 · 09:50 AM$/);
  });

  it('Email: the date stands out in a maroon box with white writing and a big, bold label', () => {
    for (const sheet of [first, { ...first, pad: '1' }] as SheetWithPad[]) {
      const html = renderEmailHtml(sheet);
      const dateBox = html.match(/<td [^>]*>\s*<div[^>]*>Date<\/div>\s*<div[^>]*>/)![0];
      expect(dateBox).toMatch(/background:#8b1a2b;/);
      // the date itself is white
      expect(dateBox).toMatch(/<div style="[^"]*color:#ffffff;[^"]*">$/);
      // only the date box is maroon
      expect(html.match(/background:#8b1a2b;/g)!.length).toBe(1);
    }
    const html = renderEmailHtml({ ...first, pad: '1' });
    const labelStyle = (label: string) =>
      html.match(new RegExp(`<div style="([^"]*)">${label}</div>`))![1];
    // "Date" is as big and bold as "Pad #"
    expect(labelStyle('Date')).toBe(labelStyle('Pad #'));
    expect(labelStyle('Date')).not.toBe(labelStyle('Wave'));
  });

  it('Email: the wording can be changed; the default is the old wording', () => {
    const who = { name: 'Abigail Gresham' };
    expect(subjectFor(first, who, DEFAULT_ROUTE_SHEET_WORDING)).toBe(subjectFor(first));
    expect(renderEmailHtml(first, who, DEFAULT_ROUTE_SHEET_WORDING)).toBe(
      renderEmailHtml(first, who),
    );

    const wording = {
      subjectTemplate: '{name}: {route} on {date} ({staging}) · Pad {pad}',
      bodyTemplate:
        "Morning {name} <3,\nRoute {route} is at {staging} on {date}.\n\nDon't be late!",
    };
    expect(subjectFor(first, who, wording)).toBe('Abigail: CX101 on Thu, Sep 24, 2026 (STG.A1.1)');
    expect(subjectFor({ ...first, pad: '7' }, who, wording)).toBe(
      'Abigail: CX101 on Thu, Sep 24, 2026 (STG.A1.1) · Pad 7',
    );
    const html = renderEmailHtml(first, who, wording);
    // The wording is escaped as typed, the values as filled in, and the date never wraps.
    expect(html).toContain(
      '<p style="margin:0 0 14px;font-size:15px;color:#1b2430;">Morning Abigail &lt;3,<br>Route CX101 is at STG.A1.1 on <span style="white-space:nowrap;">Thursday, Sep 24, 2026.</span></p>' +
        '<p style="margin:0 0 14px;font-size:15px;color:#1b2430;">Don&#39;t be late!</p>',
    );
    expect(html).toContain('<title>Abigail: CX101 on Thu, Sep 24, 2026 (STG.A1.1)</title>');
    expect(
      renderEmailText(first, who, wording).startsWith(
        "Morning Abigail <3,\r\nRoute CX101 is at STG.A1.1 on Thursday, Sep 24, 2026.\r\n\r\nDon't be late!\r\n\r\nROUTE: ",
      ),
    ).toBe(true);
    // Nobody to greet: the lines that name them go, the rest stays.
    expect(renderEmailText(first, null, wording).startsWith('Route CX101 is at')).toBe(true);
    expect(renderEmailHtml(first, null, { ...wording, bodyTemplate: 'Hi {name}' })).not.toContain(
      'margin:0 0 14px',
    );
  });

  it('Email: the words in every box at the top are centered, side to side and top to bottom', () => {
    for (const sheet of [first, { ...first, pad: '1' }] as SheetWithPad[]) {
      const html = renderEmailHtml(sheet);
      const boxes = html
        .slice(html.indexOf('<table'), html.indexOf('</table>'))
        .match(/<td [^>]*>/g)!;
      expect(boxes.length).toBe(sheet.pad ? 5 : 4);
      for (const box of boxes) expect(box).toMatch(/text-align:center;vertical-align:middle;/);
    }
  });
});
