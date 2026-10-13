import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { distribute } from '../matcher/distribute';
import { ASSOCIATES, ID, ROUTES, SHEETS } from '../matcher/testkit';
import { runIdFor } from '../runs/rules';
import { buildEml } from './eml';
import { extractPages } from './pages';
import { planExportAll } from './plan';
import { buildRouteEmail } from './routeEmail';

/** A made-up PDF with one blank page per sheet, so single pages can be cut out of it. */
async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return doc.save();
}

const decoder = new TextDecoder();
const asText = (c: Uint8Array | string) => (typeof c === 'string' ? c : decoder.decode(c));

describe('export', () => {
  it('Export: the PDF a driver gets carries both pages of a long route', async () => {
    const pdf = await blankPdf(3);
    const both = await PDFDocument.load(await extractPages(pdf, [2, 3]));
    expect(both.getPageCount()).toBe(2);
  });

  it('EML draft opens as unsent with recipients, HTML body and PDF attachment', async () => {
    const pdf = await extractPages(await blankPdf(8), [1]);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const eml = buildEml({
      to: ['a@example.com'],
      subject: 'Route Sheet: CX101 · STG',
      html: '<p>hi</p>',
      text: 'hi',
      attachments: [{ filename: 'x.pdf', content: pdf, contentType: 'application/pdf' }],
    });
    expect(eml).toMatch(/^X-Unsent: 1\r\n/);
    expect(eml).toMatch(/\r\nTo: a@example\.com\r\n/);
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(eml).toMatch(/Content-Type: text\/html/);
    expect(eml).toMatch(/filename="x.pdf"/);
  });

  it('Service: import in any order, persist decisions, export drafts', async () => {
    const pdf = await blankPdf(SHEETS.length);
    expect(runIdFor(SHEETS[0]!)).toBe('XXX1_2026-09-24_CYCLE1');

    // Accept every suggestion, as the old "Accept all suggestions" did.
    const first = distribute({ sheets: SHEETS, routes: ROUTES, associates: ASSOCIATES });
    const decisions: Record<string, { recipients: string[]; viaSuggestion: boolean }> = {};
    for (const r of first.routes)
      if (r.state === 'needs-decision' && r.suggestion)
        decisions[r.routeCode] = { recipients: [r.suggestion], viaSuggestion: true };
    expect(Object.keys(decisions).length).toBe(2);
    expect(decisions.CX102!.recipients).toEqual([ID.adrian]);

    const dist = distribute({ sheets: SHEETS, routes: ROUTES, associates: ASSOCIATES, decisions });
    const plan = await planExportAll('XXX1 · Thu, Sep 24, 2026 · CYCLE_1', dist, (code) => {
      const sheet = SHEETS.find((s) => s.routeCode === code)!;
      const route = dist.routes.find((r) => r.routeCode === code)!;
      return buildRouteEmail(sheet, route.state === 'ready' ? route.recipients : [], pdf);
    });
    expect(plan.folder).toBe('XXX1 - Thu, Sep 24, 2026 - CYCLE_1');
    expect(plan.draftsFolder).toBe('Email drafts');
    expect(plan.pdfsFolder).toBe('Route sheet PDFs');
    const drafts = plan.files.filter((f) => f.folder === 'drafts').map((f) => f.name);
    expect(drafts).toContain('CX101 - Abigail Damian Gresham.eml');
    expect(
      plan.files.some((f) => f.folder === 'root' && f.name === 'Distribution summary.html'),
    ).toBe(true);
    expect(
      plan.files.some((f) => f.folder === 'root' && f.name === 'Distribution summary.csv'),
    ).toBe(true);
    expect(plan.written).toBe(dist.counts.ready);
    expect(drafts.length).toBe(plan.written);
  });

  it('Service: pads are saved with the run, trimmed, cleared with a blank, and put on the email and summary', async () => {
    // Only the summary halves are pure: the pad for 09:50 AM is cleared, the one for 09:55 AM stays.
    const dist = distribute({
      sheets: SHEETS,
      routes: ROUTES,
      associates: ASSOCIATES,
      wavePads: { '09:55 AM': 'B12' },
    });
    const plan = await planExportAll('XXX1 · Thu, Sep 24, 2026 · CYCLE_1', dist, () => ({
      pdf: null,
      eml: '',
    }));
    const file = (name: string) => asText(plan.files.find((f) => f.name === name)!.content);
    const csv = file('Distribution summary.csv');
    expect(csv).toMatch(/^"Route","Staging","Wave","Pad",/);
    expect(csv).toMatch(/"CX102","STG\.A2\.1","09:55 AM","B12"/);
    expect(csv).toMatch(/"CX101","STG\.A1\.1","09:50 AM",""/);
    const html = file('Distribution summary.html');
    expect(html).toMatch(/<th>Pad<\/th>/);
    expect(html).toContain('<td>B12</td>');
  });
});
