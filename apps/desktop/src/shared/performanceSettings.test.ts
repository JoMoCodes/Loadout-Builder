import { describe, expect, it } from 'vitest';
import { DEFAULT_PERFORMANCE, fillTemplate, mergePerformance } from './performanceSettings';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';

describe('weekly performance choices', () => {
  it('start from the old app’s defaults', () => {
    expect(DEFAULT_PERFORMANCE.complianceWindowDays).toBe(30);
    expect(DEFAULT_PERFORMANCE.topN).toBe(5);
    expect(DEFAULT_PERFORMANCE.atRiskDecliningWeeks).toBe(3);
    expect(DEFAULT_PERFORMANCE.recurringCategoryWeeks).toBe(3);
    expect(DEFAULT_PERFORMANCE.email.smtpHost).toBe('smtp.gmail.com');
    expect(DEFAULT_PERFORMANCE.email.smtpPort).toBe(587);
  });

  it('keep only valid fields, one at a time', () => {
    const next = mergePerformance(DEFAULT_PERFORMANCE, {
      topN: 8,
      complianceWindowDays: 'lots',
      atRiskDecliningWeeks: 1,
      colours: { goldBackground: '#abcdef', bronzeBackground: 'red' },
      email: { smtpPort: 465, fromName: 'Dispatch' },
      weekRange: { from: '2026-W31', to: 'next week' },
      filters: ['status:ACTIVE', 'tier:Bronze'],
      selected: ['A02V4L9HIELIDL', '../etc'],
    });
    expect(next.topN).toBe(8);
    expect(next.complianceWindowDays).toBe(30);
    expect(next.atRiskDecliningWeeks).toBe(3);
    expect(next.colours.goldBackground).toBe('#ABCDEF');
    expect(next.colours.bronzeBackground).toBe('#AA4918');
    expect(next.email.smtpPort).toBe(465);
    expect(next.email.fromName).toBe('Dispatch');
    expect(next.email.smtpHost).toBe('smtp.gmail.com');
    expect(next.weekRange).toEqual({ from: '2026-W31', to: null });
    expect(next.filters).toEqual(['status:ACTIVE', 'tier:Bronze']);
    expect(next.selected).toEqual([]);
  });

  it('never let a page set where files are or the email password', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, {
      performance: { folders: { scorecards: 'C:\\anywhere' }, emailPassword: 'x' },
    });
    expect(next.performance).toEqual(DEFAULT_PERFORMANCE);
    expect(JSON.stringify(next)).not.toContain('anywhere');
  });

  it('fill in an older settings file that has no performance part', () => {
    const old = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>;
    delete old.performance;
    const next = mergeSettings(old as typeof DEFAULT_SETTINGS, { theme: 'light' });
    expect(next.performance).toEqual(DEFAULT_PERFORMANCE);
  });

  it('fill the email placeholders', () => {
    expect(
      fillTemplate('Hi {name}, {from} to {to}', { name: 'Archer Gresham', from: 'W31', to: 'W40' }),
    ).toBe('Hi Archer Gresham, W31 to W40');
  });
});
