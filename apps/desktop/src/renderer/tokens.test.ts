// Every theme's text can be read: WCAG AA (4.5:1) for text in all three themes, AAA (7:1) for
// body text in high contrast, and 3:1 for focus rings and input borders.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readThemes } from './lib/contrast';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const themes = readThemes(css);

const BACKGROUNDS = ['bg', 'surface', 'surface-raised', 'row-stripe', 'row-hover', 'row-selected'];
const TEXTS = ['text', 'text-muted', 'text-faint'];
const TONES = ['ok', 'warn', 'bad', 'info', 'neutral'];

function pairs(): Array<[string, string, number]> {
  const out: Array<[string, string, number]> = [];
  for (const text of TEXTS) for (const bg of BACKGROUNDS) out.push([text, bg, 4.5]);
  // A chip's words on its own tint, and a tone used as text on a plain or selected row.
  for (const tone of TONES) {
    out.push([tone, `${tone}-soft`, 4.5]);
    for (const bg of ['surface', 'row-stripe', 'row-selected']) out.push([tone, bg, 4.5]);
  }
  out.push(['accent-text', 'accent', 4.5]);
  out.push(['accent', 'surface', 4.5]);
  out.push(['text', 'accent-soft', 4.5]);
  out.push(['focus', 'surface', 3]);
  out.push(['focus', 'row-selected', 3]);
  out.push(['border-strong', 'surface', 3]);
  return out;
}

describe('theme tokens', () => {
  it('has the three themes the shell can pick', () => {
    expect(Object.keys(themes).sort()).toEqual(['dark', 'high-contrast', 'light']);
  });

  for (const [theme, tokens] of Object.entries(themes)) {
    it(`${theme}: text and chips meet WCAG AA`, () => {
      const failures: string[] = [];
      for (const [fg, bg, needed] of pairs()) {
        const a = tokens[fg];
        const b = tokens[bg];
        expect(a, `${theme} is missing --${fg}`).toBeTruthy();
        expect(b, `${theme} is missing --${bg}`).toBeTruthy();
        const ratio = contrastRatio(a as string, b as string);
        if (ratio < needed) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} (needs ${needed})`);
      }
      expect(failures).toEqual([]);
    });
  }

  it('high contrast: body text meets AAA (7:1)', () => {
    const tokens = themes['high-contrast'] as Record<string, string>;
    const failures: string[] = [];
    for (const fg of ['text', 'text-muted', ...TONES]) {
      for (const bg of ['bg', 'surface', 'surface-raised', 'row-selected']) {
        const ratio = contrastRatio(tokens[fg] as string, tokens[bg] as string);
        if (ratio < 7) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('works out contrast the WCAG way', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
