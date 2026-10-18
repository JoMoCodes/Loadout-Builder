// The Weekly Snapshot pages drawn from the made-up fixture files, the email around the pictures
// and the photo reader. Names and IDs are the made-up people from packages/fixtures/manifest.json.

import { beforeAll, describe, expect, it } from 'vitest';
import { buildSnapshotModel, type PerfData } from '@loadout/performance';
import { loadFixtureData } from '../../../../../../packages/performance/src/analysis/fixtureData';
import { DEFAULT_REPORT_COLOURS } from '../../../shared/performanceSettings';
import { decode } from '../report/testkit';
import { inlineImages, snapshotEmailHtml, snapshotEmailText } from './email';
import { buildSnapshotHtml, SNAPSHOT_WIDTH, type SnapshotLook } from './html';
import { imageSize, photoFromBytes, readSnapshotPhoto } from './photo';
import { pickFormat } from './render';
import { sampleSnapshotModel } from './sample';

const ARCHER = 'A02V4L9HIELIDL';
const DESMOND = 'A05QUB9XOW4NT1';
const PLAIN: SnapshotLook = { colours: DEFAULT_REPORT_COLOURS, photo: null };

/** A 2 x 3 PNG (the smallest well-formed one), for the photo reader. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADGQ7uBAAAADklEQVR4nGP4z8DAwAAABQQCAHjSg5EAAAAASUVORK5CYII=',
  'base64',
);
/** The start of a JPEG whose first frame header says 720 x 1141. */
const JPEG_HEAD = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x75, 0x02, 0xd0, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
]);

let data: PerfData;
beforeAll(async () => {
  data = await loadFixtureData();
});

const text = (html: string) =>
  decode(html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(
    /\s+/g,
    ' ',
  );

describe('the snapshot pages', () => {
  it('are one standalone document, two pages, phone width, no scripts or outside files', () => {
    const model = buildSnapshotModel(data, ARCHER, '2026-W31', '2026-W40')!;
    const html = buildSnapshotHtml(model, PLAIN);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
    expect([...html.matchAll(/data-page="(\d)"/g)].map((m) => m[1])).toEqual(['1', '2']);
    expect(html).toContain(`width: ${SNAPSHOT_WIDTH}px`);
    // One page at a time, for the pictures.
    expect(
      [...buildSnapshotHtml(model, PLAIN, [2]).matchAll(/data-page="(\d)"/g)].map((m) => m[1]),
    ).toEqual(['2']);
  });

  it('page 1 says the week, the rank, the score and tier, the tip and the receipt', () => {
    const model = buildSnapshotModel(data, ARCHER, '2026-W31', '2026-W40')!;
    const page = text(buildSnapshotHtml(model, PLAIN, [1]));
    expect(page).toContain('SCORECARD WEEK 40');
    expect(page).toContain('#32 of 61');
    expect(page).toContain('93.6'); // inside the gauge
    expect(page).toContain('Gold');
    expect(page).toContain('Fleet Average 90.3');
    expect(page).toContain('Try this next');
    expect(page).toContain("Clear the 2 packages brought back and you're Platinum (+6.4 points).");
    expect(page).toContain('Safety × 5 (0 events) +58.0');
    expect(page).toContain('Delivery Completion (2) +4.1 of 10.5');
    expect(page).toContain('TOTAL 93.6 GOLD');
    expect(page).toContain('To Platinum 1.4');
    expect(page).toContain('Want the full breakdown?');
    expect(page).toContain(`Transporter ID ${ARCHER}`);
    // Tier markers on the arc come from the thresholds file.
    expect(page).toContain('Silver 78');
    expect(page).toContain('Platinum 95');
  });

  it('page 2 says the weeks, the seven-week rank and average, what to improve, and the grid', () => {
    const model = buildSnapshotModel(data, DESMOND, '2026-W31', '2026-W40')!;
    const html = buildSnapshotHtml(model, PLAIN, [2]);
    const page = text(html);
    expect(page).toContain('7 WEEK SCORECARD 34 - 40');
    expect(page).toContain('#53 of 67');
    expect(page).toContain('by 7-week average score');
    expect(page).toContain('89.3');
    expect(page).toContain('Needs Improvement');
    expect(page).toContain('Photos Average Bronze');
    expect(page).toContain('Do this: Take one step back');
    expect(page).toContain('Want all the numbers?');
    // The dot grid: a week number per column and a row per metric, lost rows on red.
    expect(page).toMatch(/Week 34 35 36 37 38 39 40/);
    for (const name of [
      'Speeding',
      'Seatbelt',
      'Feedback',
      'Escalations',
      'Delivery Completion',
      'Concessions',
      'Photos',
    ]) {
      expect(page).toContain(name);
    }
    expect(html).toMatch(
      /background:#d6342a;color:#fff;font-weight:700"><span class="small" style="flex:1">Photos</,
    );
    expect(html).not.toMatch(
      /background:#d6342a;color:#fff;font-weight:700"><span class="small" style="flex:1">Seatbelt</,
    );
    // The score chart labels the first, best and last weeks.
    expect(page).toContain('93.3');
    expect(page).toContain('96.8');
    expect(page).toContain('76.4');
  });

  it('shows the photo as a band under the title plus a stretched part, darkened', () => {
    const photo = { dataUrl: 'data:image/jpeg;base64,AAAA', width: 720, height: 1141 };
    const html = buildSnapshotHtml(sampleSnapshotModel(), { ...PLAIN, photo }, [1]);
    // 22% of 1141 is 251 rows; at 360 px wide that band is 126 px tall.
    expect(html).toContain(
      'class="ph-band" style="top:0;height:126px;background:linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(data:image/jpeg;base64,AAAA) center top / 100% auto no-repeat"',
    );
    expect(html).toContain('class="ph-rest" style="top:124px;bottom:0;');
    expect(html).toContain('center bottom / 100% 128.20% no-repeat');
    expect(html).toContain('class="body photo"');
    expect(buildSnapshotHtml(sampleSnapshotModel(), PLAIN, [1])).not.toContain('class="ph-band"');
  });

  it('uses the report colours for the tier dots and chips', () => {
    const colours = { ...DEFAULT_REPORT_COLOURS, goldBackground: '#123456' };
    const html = buildSnapshotHtml(sampleSnapshotModel(), { colours, photo: null }, [2]);
    expect(html).toContain('background:#123456');
    expect(html).not.toContain('#E9DE63');
  });

  it('draws the sample snapshot the design was built with', () => {
    const page = text(buildSnapshotHtml(sampleSnapshotModel(), PLAIN));
    expect(page).toContain('SCORECARD WEEK 41');
    expect(page).toContain('#9 of 42');
    expect(page).toContain('91.3');
    expect(page).toContain("Clear the 2 complaints and you're Platinum (+7.4 points).");
    expect(page).toContain('7 WEEK SCORECARD 35 - 41');
    expect(page).toContain('#7 of 42');
    expect(page).not.toContain('Sample Driver'); // the name never shows on the pages themselves
  });

  it('says so when a driver was not ranked over the seven weeks, or has empty weeks', () => {
    const model = buildSnapshotModel(data, ARCHER, '2026-W31', '2026-W40')!;
    const few = { ...model, average: { ...model.average, rank: null, weeksScored: 2 } };
    const page = text(buildSnapshotHtml(few, PLAIN, [2]));
    expect(page).toContain('not yet');
    expect(page).toContain('ranked after 4 scored weeks (you have 2)');
    const gaps = {
      ...model,
      weeks: model.weeks.map((w, i) =>
        i === 2 ? { ...w, score: null, tier: null, rank: null } : w,
      ),
      metrics: model.metrics.map((m) => ({
        ...m,
        tiers: m.tiers.map((t, i) => (i === 2 ? null : t)),
      })),
    };
    const html = buildSnapshotHtml(gaps, PLAIN, [2]);
    expect(text(html)).toContain('No scorecard that week');
    expect(html).toContain('stroke-dasharray="2 2"');
  });
});

describe('the email around the pictures', () => {
  const images = inlineImages(
    [
      { bytes: Buffer.from('one'), contentType: 'image/png', width: 360, height: 1000 },
      { bytes: Buffer.from('two'), contentType: 'image/jpeg', width: 360, height: 1500 },
    ],
    '7',
  );

  it('names each picture by page and refers to it by its Content-ID', () => {
    expect(images.map((one) => [one.cid, one.filename])).toEqual([
      ['snapshot-page-1-7@loadout-builder', 'snapshot-page-1.png'],
      ['snapshot-page-2-7@loadout-builder', 'snapshot-page-2.jpg'],
    ]);
    const html = snapshotEmailHtml('Hi Archer,\n\nAttached is your report.\n\nThanks', images);
    expect(html).toContain('<p style="margin:0 0 12px;');
    expect(html).toContain('Hi Archer,</p>');
    expect(html).toContain('src="cid:snapshot-page-1-7@loadout-builder" width="360"');
    expect(html).toContain('src="cid:snapshot-page-2-7@loadout-builder" width="360"');
    expect(html).toContain('max-width:360px');
    expect(html).toContain('PDF attached to this email');
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes the wording and keeps the plain text readable with or without pictures', () => {
    expect(snapshotEmailHtml('a <b> & c', [])).toContain('a &lt;b&gt; &amp; c');
    expect(snapshotEmailHtml('Hi', [])).not.toContain('cid:');
    expect(snapshotEmailText('Hi Archer,\n\nThanks\n', true)).toBe(
      'Hi Archer,\n\nThanks\n\nYour two-page weekly snapshot is in this email as two pictures. The full report, with every metric and every week, is the attached PDF.',
    );
    expect(snapshotEmailText('Hi Archer,', false)).toBe('Hi Archer,');
  });

  it('keeps a picture as PNG unless it is over 400 KB', () => {
    expect(pickFormat(100_000)).toBe('png');
    expect(pickFormat(400 * 1024)).toBe('png');
    expect(pickFormat(400 * 1024 + 1)).toBe('jpeg');
  });
});

describe('the header photo', () => {
  it('reads the size of a PNG and a JPEG from the file itself', () => {
    expect(imageSize(TINY_PNG)).toEqual({ width: 2, height: 3, type: 'png' });
    expect(imageSize(JPEG_HEAD)).toEqual({ width: 720, height: 1141, type: 'jpeg' });
    expect(imageSize(Buffer.from('GIF89a'))).toBeNull();
    expect(imageSize(Buffer.from('%PDF-1.4'))).toBeNull();
    expect(photoFromBytes(TINY_PNG)).toEqual({
      dataUrl: `data:image/png;base64,${TINY_PNG.toString('base64')}`,
      width: 2,
      height: 3,
    });
  });

  it('says why a file cannot be used', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const folder = mkdtempSync(path.join(tmpdir(), 'snapshot-photo-'));
    const png = path.join(folder, 'band.png');
    writeFileSync(png, TINY_PNG);
    writeFileSync(path.join(folder, 'notes.txt'), 'not a picture');
    expect(readSnapshotPhoto(png)).toEqual({ photo: photoFromBytes(TINY_PNG), problem: null });
    expect(readSnapshotPhoto(path.join(folder, 'notes.txt'))).toEqual({
      photo: null,
      problem: 'not-an-image',
    });
    expect(readSnapshotPhoto(path.join(folder, 'gone.jpg'))).toEqual({
      photo: null,
      problem: 'missing',
    });
  });
});
