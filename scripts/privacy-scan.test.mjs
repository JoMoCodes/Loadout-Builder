import { describe, expect, it } from 'vitest';
import { scanFile, scanText } from './privacy-scan.mjs';

// None of the values below are real. They are built from pieces so this file itself holds no
// ID-, VIN-, phone- or email-shaped text for the scan to trip over.
const fakeId = `A${'Q'.repeat(12)}${'7'}`; // a capital letter then 13 more capitals/digits
const fakeVin = `1HGCM82633A${'0'.repeat(6)}`.replace('0', '4'); // 17 characters, no I, O or Q
const fakePhone = ['6', '1', '2', '4', '5', '5', '0', '1', '4', '8'].join('');
const mail = (domain) => `someone${'@'}${domain}`;

const settings = (extra = {}) => ({
  privateWords: [],
  names: [],
  manifest: { ids: new Set(), vins: new Set(), found: true },
  notes: [],
  ...extra,
});

const kinds = (text, s = settings()) => scanText(text, s).map((f) => f.kind);

describe('privacy scan', () => {
  it('lets ordinary text through', () => {
    expect(kinds('Hello. Version 2.0.0 shipped on 2026-10-08, with 12 drivers.')).toEqual([]);
  });

  it('catches an email address, but not a made-up one at example.com', () => {
    expect(kinds(`write to ${mail('gmail.com')}`)).toEqual(['an email address']);
    expect(kinds(`write to ${mail('example.com')}`)).toEqual([]);
  });

  it('catches a phone number, but not the fictional 555-01xx range', () => {
    expect(kinds(`call ${fakePhone}`)).toEqual(['a phone number']);
    expect(kinds(`call +1${fakePhone}`)).toEqual(['a phone number']);
    expect(kinds('call 2065550123')).toEqual([]);
    expect(kinds('call +12065550123')).toEqual([]);
  });

  it('ignores ten-digit numbers that are not phone numbers', () => {
    expect(kinds('const digits = "0123456789"; const max = 4294967295;')).toEqual([]);
    expect(kinds('Tenured_Workforce_DA_1756800000.csv')).toEqual([]);
  });

  it('catches the station code and DSP name from the private list, in any case', () => {
    const s = settings({ privateWords: ['ZZZ9', 'Example Hauling Co'] });
    expect(kinds('Routes_zzz9_2026-09-25', s)).toEqual(['the station code or DSP name']);
    expect(kinds('from example   hauling co today', s)).toEqual(['the station code or DSP name']);
    expect(kinds('ZZZ99 is a different word', s)).toEqual([]);
  });

  it('catches a name from the private list, written either way round', () => {
    const s = settings({ names: ['Pat Example'] });
    expect(kinds('Driver: Pat Example', s)).toEqual(['a real driver name']);
    expect(kinds('Driver: pat,example', s)).toEqual(['a real driver name']);
    expect(kinds('Driver: Pat Sample', s)).toEqual([]);
  });

  it('catches ID-shaped and VIN-shaped text unless the manifest lists it', () => {
    expect(kinds(`id ${fakeId}`)).toEqual([
      'something shaped like a Transporter ID that is not in the fixtures manifest',
    ]);
    expect(kinds(`vin ${fakeVin}`)).toEqual([
      'something shaped like a VIN that is not in the fixtures manifest',
    ]);
    const listed = settings({
      manifest: { ids: new Set([fakeId]), vins: new Set([fakeVin]), found: true },
    });
    expect(kinds(`id ${fakeId} vin ${fakeVin}`, listed)).toEqual([]);
  });

  it('does not report the value it found', () => {
    const [finding] = scanText(`id ${fakeId}`, settings());
    expect(JSON.stringify(finding)).not.toContain(fakeId);
    expect(finding.line).toBe(1);
  });

  it('checks the file name for the station code', () => {
    const s = settings({ privateWords: ['ZZZ9'] });
    const { findings } = scanFile('packages/fixtures/Routes_ZZZ9_2026.xlsx', Buffer.alloc(0), s);
    expect(findings.map((f) => f.where)).toContain('in the file name');
  });

  it('skips email and ID checks inside the npm lock file', () => {
    const { findings } = scanFile(
      'package-lock.json',
      Buffer.from(`contact ${mail('gmail.com')} ${fakeId}`),
      settings(),
    );
    expect(findings).toEqual([]);
  });
});
