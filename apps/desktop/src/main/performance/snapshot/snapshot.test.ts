// The Weekly Snapshot pages drawn from the made-up fixture files, the email around the pictures
// and the photo reader. Names and IDs are the made-up people from packages/fixtures/manifest.json.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildSnapshotModel,
  DEFAULT_CUT_OFFS,
  tierForScore,
  type PerfData,
} from '@loadout/performance';
import { loadFixtureData } from '../../../../../../packages/performance/src/analysis/fixtureData';
import { DEFAULT_REPORT_COLOURS } from '../../../shared/performanceSettings';
import { decode } from '../report/testkit';
import { inlineImages, snapshotEmailHtml, snapshotEmailText } from './email';
import { angleFor, binFor, GAUGE, gaugeCentre, layoutFleetDots } from './gauge';
import { buildSnapshotHtml, gaugeBlockSvg, SNAPSHOT_WIDTH, type SnapshotLook } from './html';
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
    expect(page).toContain('Fleet Avg 90.3');
    expect(page).toContain('You');
    const packages = model.fleetWeek.packages;
    expect(page).toContain(
      `Packages delivered in Week 40 You ${packages.mine!.toLocaleString('en-US')} vs Rank 1 ${packages.first!.toLocaleString('en-US')}`,
    );
    expect(page).toContain('Try this next');
    expect(page).toContain("Clear the 2 packages brought back and you're Platinum (+6.4 points).");
    expect(page).toContain('Safety × 5 (0 events) +58.0');
    expect(page).toContain('Delivery Completion (2) +4.1 of 10.5');
    expect(page).toContain('TOTAL 93.6 GOLD');
    expect(page).toContain('To Platinum 1.4');
    expect(page).toContain('Want the full breakdown?');
    expect(page).toContain(`Transporter ID ${ARCHER}`);
    // The tier names run along the band and the cut-offs from the thresholds file sit inside it.
    expect(page).toMatch(/BRONZE SILVER GOLD PLATINUM/);
    expect(page).toMatch(/ 78 88 95 /);
  });

  it('page 2 says the weeks, the seven-week rank and average, what to improve, and the grid', () => {
    const model = buildSnapshotModel(data, DESMOND, '2026-W31', '2026-W40')!;
    const html = buildSnapshotHtml(model, PLAIN, [2]);
    const page = text(html);
    expect(page).toContain('7 WEEK SCORECARD 34 - 40');
    expect(page).toContain('#53 of 67');
    expect(page).toContain('by 7-week average score');
    expect(page).toMatch(/Total packages delivered over 7 weeks You [\d,]+ vs Rank 1 [\d,]+/);
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
    // The medal starts under the band (126 px, less the body's own 14 px padding).
    expect(html).toContain('<div class="center" style="margin-top:112px"><div class="medal"');
    const plain = buildSnapshotHtml(sampleSnapshotModel(), PLAIN, [1]);
    expect(plain).not.toContain('class="ph-band"');
    expect(plain).toContain('<div class="center"><div class="medal"');
  });

  it('colours the ribbon, the medal, the score and the pill in the tier of that page', () => {
    const model = sampleSnapshotModel(); // a Gold week, a Gold seven-week average
    const page1 = buildSnapshotHtml(model, PLAIN, [1]);
    expect(page1).toContain('class="ribbon" style="font-size:27px;background:#f2bd1b"');
    expect(page1).toContain(
      '<div class="medal" style="border-color:#f2bd1b"><span style="color:#f2bd1b">#9</span><small>of 42</small>',
    );
    expect(page1).toContain('fill="#f2bd1b">91.3</text>'); // the shadow under the white score
    expect(page1).toContain('rx="9.5" fill="#f2bd1b"'); // the pill
    const page2 = buildSnapshotHtml(model, PLAIN, [2]);
    expect(page2).toContain('class="ribbon" style="font-size:22px;background:#f2bd1b"');
    expect(page2).toContain('<p class="small muted note">by 7-week average score</p>');
    // A Platinum week turns them all Platinum blue; no tier keeps the amber ribbon and a muted ring.
    const platinum = {
      ...model,
      latest: { ...model.latest, score: 97.2, tier: 'Platinum' as const },
    };
    const blue = buildSnapshotHtml(platinum, PLAIN, [1]);
    expect(blue).toContain('background:#38c6ea"');
    expect(blue).toContain('border-color:#38c6ea');
    const none = { ...model, latest: { ...model.latest, tier: null, rank: null } };
    const amber = buildSnapshotHtml(none, PLAIN, [1]);
    expect(amber).toContain('class="ribbon" style="font-size:27px;background:#ffb703"');
    expect(amber).toContain(
      '<div class="medal" style="border-color:#b7c7e3"><span style="font-size:26px">—</span><small>no rank</small>',
    );
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

  it('shows packages delivered against rank 1, or rank 2 for the driver who is rank 1', () => {
    const model = sampleSnapshotModel();
    const page1 = text(buildSnapshotHtml(model, PLAIN, [1]));
    expect(page1).toContain('Packages delivered in Week 41 You 1,042 vs Rank 1 1,180');
    expect(page1).toContain('Tie Breaks are decided based on Packages Delivered');
    const page2 = text(buildSnapshotHtml(model, PLAIN, [2]));
    expect(page2).toContain('Total packages delivered over 7 weeks You 7,128 vs Rank 1 7,842');
    expect(page2).toContain('Tie Breaks are decided based on Total Packages Delivered');
    // The driver's own count takes the tier colour.
    expect(buildSnapshotHtml(model, PLAIN, [1])).toContain(
      '<span class="n" style="color:#f2bd1b">1,042</span>',
    );
    const leader = {
      ...model,
      latest: { ...model.latest, rank: { rank: 1, total: 42 } },
      fleetWeek: {
        ...model.fleetWeek,
        meIndex: 0,
        packages: { mine: 1180, first: 1180, second: 1133 },
      },
    };
    expect(text(buildSnapshotHtml(leader, PLAIN, [1]))).toContain('You (#1) 1,180 vs Rank 2 1,133');
    const unknown = {
      ...model,
      fleetWeek: { ...model.fleetWeek, packages: { mine: null, first: null, second: null } },
    };
    expect(text(buildSnapshotHtml(unknown, PLAIN, [1]))).toContain('You — vs Rank 1 —');
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

describe('the gauge block', () => {
  const cutOffs = DEFAULT_CUT_OFFS;
  const top = { noteHeight: 0 };
  const centre = gaugeCentre(top);
  const distance = (dot: { x: number; y: number }) =>
    Math.hypot(dot.x - centre.x, dot.y - centre.y);
  const angleOf = (dot: { x: number; y: number }) => Math.atan2(dot.y - centre.y, dot.x - centre.x);
  const sameAngle = (a: number, b: number) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

  it('runs 75 to 100 over 270 degrees, lower left to lower right', () => {
    expect(angleFor(75)).toBeCloseTo((3 * Math.PI) / 4);
    expect(angleFor(87.5)).toBeCloseTo((3 * Math.PI) / 2); // straight up
    expect(angleFor(100)).toBeCloseTo((9 * Math.PI) / 4);
    expect(angleFor(60)).toBe(angleFor(75));
    expect(angleFor(101)).toBe(angleFor(100));
  });

  it('bins scores by whole point, 100 with the 99s and anything under 75 at the 75 end', () => {
    expect([100, 99.6, 99.1, 91.3, 91.0, 75.4, 74.9, 60].map(binFor)).toEqual([
      99, 99, 99, 91, 91, 75, 75, 75,
    ]);
    const strip = { scores: [100, 99.6, 99.1, 91.3, 74.9, 60], meIndex: null, average: null };
    const { dots, columns } = layoutFleetDots(strip, cutOffs, top);
    expect([...columns.keys()]).toEqual([99, 91, 75]);
    expect(columns.get(99)?.count).toBe(3);
    // Each column points at the middle of its own point on the band.
    for (const dot of dots) expect(sameAngle(angleOf(dot), angleFor(dot.bin + 0.5))).toBe(true);
  });

  it('stacks a column outward in rank order, the driver bigger at their own place', () => {
    const strip = { scores: [93.9, 93.5, 93.2, 93.0], meIndex: 2, average: null };
    const { dots, columns } = layoutFleetDots(strip, cutOffs, top);
    expect(dots.map((d) => d.index)).toEqual([0, 1, 2, 3]);
    expect(dots.map((d) => distance(d))).toEqual(
      [0, 1, 2, 3].map((k) => expect.closeTo(GAUGE.r0 + k * GAUGE.step, 6)),
    );
    expect(dots.map((d) => d.r)).toEqual([3, 3, 4.5, 3]);
    expect(dots.map((d) => d.me)).toEqual([false, false, true, false]);
    expect(columns.get(93)).toMatchObject({ count: 4, lanes: 1, step: GAUGE.step });
  });

  it('colours each dot by the tier its score lands in, using the cut-offs', () => {
    const strip = { scores: [96, 95, 94.9, 88, 87.9, 78, 77.9, 50], meIndex: null, average: null };
    expect(layoutFleetDots(strip, cutOffs, top).dots.map((d) => d.tier)).toEqual([
      'Platinum',
      'Platinum',
      'Gold',
      'Gold',
      'Silver',
      'Silver',
      'Bronze',
      'Bronze',
    ]);
    const custom = { platinum: 97, gold: 90, silver: 80, fromThresholds: true };
    expect(layoutFleetDots(strip, custom, top).dots.map((d) => d.tier)).toEqual([
      'Gold',
      'Gold',
      'Gold',
      'Silver',
      'Silver',
      'Bronze',
      'Bronze',
      'Bronze',
    ]);
    const svg = gaugeBlockSvg({
      score: 96,
      tier: 'Platinum',
      cutOffs,
      strip,
      page: 1,
      top,
      label: 'x',
    });
    for (const colour of ['#38c6ea', '#f2bd1b', '#93a4b8', '#c4551a']) {
      expect(svg).toContain(`r="3.0" fill="${colour}"`);
    }
  });

  it('keeps a long column on the card: tighter steps, then two lanes, then three', () => {
    const inside = (d: { x: number; y: number; r: number }) =>
      d.x - d.r >= 0 && d.x + d.r <= SNAPSHOT_WIDTH && d.y - d.r >= 0;
    const on100 = (n: number) => ({
      scores: Array<number>(n).fill(100),
      meIndex: 8,
      average: null,
    });
    // Thirteen on 100 and three 99s: one lane at the full step, the driver ninth out.
    const sixteen = {
      scores: [...Array<number>(13).fill(100), 99.8, 99.5, 99.2],
      meIndex: 8,
      average: null,
    };
    const one = layoutFleetDots(sixteen, cutOffs, top);
    expect(one.columns.get(99)).toMatchObject({ count: 16, lanes: 1, step: GAUGE.step });
    expect(distance(one.dots[8]!)).toBeCloseTo(GAUGE.r0 + 8 * GAUGE.step, 6);
    expect(one.dots.every(inside)).toBe(true);
    // Eighteen need a tighter step; thirty-eight fit in two lanes; eighty need three.
    const eighteen = layoutFleetDots(on100(18), cutOffs, top).columns.get(99)!;
    expect(eighteen.lanes).toBe(1);
    expect(eighteen.step).toBeGreaterThanOrEqual(GAUGE.stepMin);
    expect(eighteen.step).toBeLessThan(GAUGE.step);
    const two = layoutFleetDots(on100(38), cutOffs, top);
    expect(two.columns.get(99)?.lanes).toBe(2);
    expect(two.columns.get(99)?.step).toBeGreaterThanOrEqual(GAUGE.stepMin);
    expect(two.dots.every(inside)).toBe(true);
    // Lanes alternate, so rank order still runs outward: ranks 1 and 2 side by side nearest.
    expect(distance(two.dots[0]!)).toBeCloseTo(distance(two.dots[1]!), 6);
    expect(distance(two.dots[2]!)).toBeGreaterThan(distance(two.dots[0]!));
    const three = layoutFleetDots(on100(80), cutOffs, top);
    expect(three.columns.get(99)?.lanes).toBe(3);
    expect(three.dots.every(inside)).toBe(true);
    // The SVG is as tall as what it draws, so the picture never cuts a dot off.
    const svg = gaugeBlockSvg({
      score: 100,
      tier: 'Platinum',
      cutOffs,
      strip: on100(38),
      page: 1,
      top,
      label: 'x',
    });
    const height = Number(/viewBox="0 0 360 (\d+)"/.exec(svg)?.[1]);
    const lowest = Math.max(...two.dots.map((d) => d.y + d.r));
    expect(height).toBeGreaterThanOrEqual(lowest + 14);
  });

  it('never lets a dot or a label run out of the picture, whatever the fleet looks like', () => {
    // A simple seeded generator, so the fleets are the same every run.
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 60; round++) {
      const size = 20 + Math.floor(random() * 90);
      const tie = round % 3 === 0 ? Math.floor(random() * 30) : 0;
      const scores = [
        ...Array<number>(tie).fill(100),
        ...Array.from({ length: size }, () => Math.round((70 + random() * 30) * 10) / 10),
      ].sort((a, b) => b - a);
      const meIndex = Math.floor(random() * scores.length);
      const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const strip = { scores, meIndex, average, packages: { mine: 1, first: 1, second: 1 } };
      const score = scores[meIndex]!;
      for (const page of [1, 2] as const) {
        const svg = gaugeBlockSvg({
          score,
          tier: tierForScore(score, cutOffs),
          cutOffs,
          strip,
          page,
          top: { noteHeight: page === 1 ? 0 : 24 },
          label: 'x',
        });
        const height = Number(/viewBox="0 0 360 (\d+)"/.exec(svg)?.[1]);
        for (const m of svg.matchAll(
          /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="[^"]*"( opacity)?/g,
        )) {
          const [x, y, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
          // The faint glow behind the driver's dot may be cut by the card's side, nothing else may.
          if (!m[4]) {
            expect(x - r).toBeGreaterThanOrEqual(0);
            expect(x + r).toBeLessThanOrEqual(360);
          }
          expect(y - r).toBeGreaterThanOrEqual(0);
          expect(y + r).toBeLessThanOrEqual(height - 14);
        }
        for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"/g)) {
          expect(Number(m[1])).toBeGreaterThanOrEqual(0);
          expect(Number(m[1])).toBeLessThanOrEqual(360);
          expect(Number(m[2])).toBeGreaterThanOrEqual(0);
          expect(Number(m[2])).toBeLessThanOrEqual(height - 14);
        }
      }
    }
  });

  it('keeps a column straight up from running into the medal above', () => {
    const strip = { scores: Array<number>(12).fill(87.5), meIndex: null, average: null };
    const { dots, columns } = layoutFleetDots(strip, cutOffs, top);
    const medalBottom = GAUGE.medal.bottom;
    expect(columns.get(87)?.lanes).toBeGreaterThan(1);
    for (const dot of dots) expect(dot.y - dot.r).toBeGreaterThan(medalBottom);
    // Page 2's note under the medal pushes the whole ring down by the same amount.
    const page2 = layoutFleetDots(strip, cutOffs, { noteHeight: 24 });
    expect(gaugeCentre({ noteHeight: 24 }).y).toBe(centre.y + 24);
    for (const dot of page2.dots) expect(dot.y - dot.r).toBeGreaterThan(medalBottom + 24);
  });

  it('draws the sample driver ninth overall and first in the 91 column, with the fleet average', () => {
    const model = sampleSnapshotModel();
    const { dots } = layoutFleetDots(model.fleetWeek, cutOffs, top);
    const me = dots.find((d) => d.me)!;
    expect(me.index).toBe(8);
    expect(me.bin).toBe(91);
    expect(distance(me)).toBeCloseTo(GAUGE.r0, 6);
    expect(dots.filter((d) => d.index < 8).every((d) => d.bin > 91)).toBe(true);
    const svg = gaugeBlockSvg({
      score: 91.3,
      tier: 'Gold',
      cutOffs,
      strip: model.fleetWeek,
      page: 1,
      top,
      label: 'x',
    });
    expect(svg).toContain('>Fleet Avg</text>');
    expect(svg).toContain('stroke-dasharray="3 3"');
    expect(svg).toContain('>You</text>');
    expect(svg).toContain('r="4.5" fill="#f2bd1b"');
    expect(svg).toContain('r="10.8" fill="#f2bd1b" opacity=".16"');
    expect(svg).toContain(
      '<textPath href="#g1-Gold" startOffset="50%" text-anchor="middle">GOLD</textPath>',
    );
    expect(svg).toContain('filter="url(#g1-glow)"');
    // Bronze is only three points wide, so its name shrinks to fit.
    expect(svg).toMatch(
      /font-size="[4-8]\.\d" font-weight="700" fill="#000" opacity=".75" letter-spacing="0.6"[^>]*><textPath href="#g1-Bronze"/,
    );
    expect(svg).toMatch(
      /font-size="9.5" font-weight="700" fill="#000" opacity=".75" letter-spacing="0.6"[^>]*><textPath href="#g1-Silver"/,
    );
  });

  it('draws the gauge alone when nobody is in the strip, and no "You" when the driver is not', () => {
    const base = { score: 91.3, tier: 'Gold' as const, cutOffs, page: 1 as const, top, label: 'x' };
    const empty = gaugeBlockSvg({ ...base, strip: { scores: [], meIndex: null, average: null } });
    expect(empty).not.toContain('<circle');
    expect(empty).not.toContain('You');
    expect(empty).not.toContain('Fleet Avg');
    expect(empty).toContain('>91.3</text>');
    const noMe = gaugeBlockSvg({
      ...base,
      strip: { scores: [95, 90, 85], meIndex: null, average: 90 },
    });
    expect(noMe.match(/<circle/g)).toHaveLength(3);
    expect(noMe).not.toContain('You');
    expect(noMe).toContain('>90.0</text>');
  });
});
