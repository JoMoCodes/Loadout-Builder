import { describe, expect, it } from 'vitest';
import { esc, formatN0, isPositiveCount, shortDate, shortWeek } from './format';

describe('report text formats', () => {
  it('escapes HTML', () => {
    expect(esc(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
  });

  it('writes whole numbers with thousands commas (N0)', () => {
    expect(formatN0(0)).toBe('0');
    expect(formatN0(1093)).toBe('1,093');
    expect(formatN0(1234567)).toBe('1,234,567');
    expect(formatN0(-1500)).toBe('-1,500');
  });

  it('decides red counts the way int.TryParse did', () => {
    expect(isPositiveCount('3')).toBe(true);
    expect(isPositiveCount('0')).toBe(false);
    expect(isPositiveCount('1,093')).toBe(false);
    expect(isPositiveCount('99.5%')).toBe(false);
    expect(isPositiveCount('—')).toBe(false);
  });

  it('shortens weeks and dates', () => {
    expect(shortWeek('2026-W14')).toBe('W14');
    expect(shortDate('2026-03-31')).toBe('Mar 31');
    expect(shortDate('2026-09-05')).toBe('Sep 5');
    expect(shortDate('9/8/2026')).toBe('Sep 8');
    expect(shortDate('soon')).toBe('soon');
  });
});
