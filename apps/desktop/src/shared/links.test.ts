import { describe, expect, it } from 'vitest';
import { DISCUSSIONS_URL, RELEASES_URL, isAllowedLink } from './links';

describe('links the app may open', () => {
  it('opens the help forum and the release pages', () => {
    expect(isAllowedLink(DISCUSSIONS_URL)).toBe(true);
    expect(isAllowedLink('https://github.com/JoMoCodes/Loadout-Builder/discussions')).toBe(true);
    expect(isAllowedLink(RELEASES_URL)).toBe(true);
    expect(isAllowedLink('https://github.com/JoMoCodes/Loadout-Builder/releases/latest')).toBe(
      true,
    );
    expect(isAllowedLink('https://github.com/JoMoCodes/Loadout-Builder/releases/tag/v2.0.0')).toBe(
      true,
    );
    expect(
      isAllowedLink('https://github.com/JoMoCodes/Loadout-Builder/releases/tag/v2.1.0-beta.1'),
    ).toBe(true);
  });

  it('refuses every other link', () => {
    for (const link of [
      'https://github.com/JoMoCodes/Loadout-Builder',
      'https://github.com/JoMoCodes/Loadout-Builder/discussions/new',
      'https://github.com/JoMoCodes/Loadout-Builder/issues',
      'https://github.com/JoMoCodes/Other/releases/latest',
      'http://github.com/JoMoCodes/Loadout-Builder/discussions',
      'https://github.com.example.com/JoMoCodes/Loadout-Builder/discussions',
      'https://github.com/JoMoCodes/Loadout-Builder/releases/latest?x=1',
      'https://github.com/JoMoCodes/Loadout-Builder/releases/latest#x',
      'https://github.com/JoMoCodes/Loadout-Builder/releases/tag/v2.0.0/../../../evil',
      'https://github.com/JoMoCodes/Loadout-Builder/releases/download/v2.0.0/setup.exe',
      'file:///C:/Windows/system32/calc.exe',
      'javascript:alert(1)',
      '',
    ]) {
      expect(isAllowedLink(link), link).toBe(false);
    }
    expect(isAllowedLink(null)).toBe(false);
    expect(isAllowedLink(42)).toBe(false);
    expect(isAllowedLink(`${DISCUSSIONS_URL}${'x'.repeat(300)}`)).toBe(false);
  });
});
