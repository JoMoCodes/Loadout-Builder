// The one settings file: the page's settings and the main-only part live side by side, and
// neither ever overwrites the other.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { readMainOnly, SettingsFile, type SettingsFileIo } from './settingsFile';

function memoryIo(start: unknown): SettingsFileIo & { saved: unknown } {
  const io = {
    saved: start,
    read: () => io.saved,
    write: (_file: string, value: unknown) => {
      io.saved = JSON.parse(JSON.stringify(value));
      return true;
    },
  };
  return io;
}

const ABS = process.platform === 'win32' ? 'C:\\Exports\\Scorecards' : '/exports/scorecards';

describe('the settings file', () => {
  it('gives the page only its own settings, and keeps the main-only part aside', () => {
    const io = memoryIo({
      theme: 'light',
      demoMode: true,
      performanceFolders: { scorecards: ABS },
      emailPasswordSealed: 'c2VhbGVk',
    });
    const file = new SettingsFile('settings.json', io);
    const settings = file.load();
    expect(settings.theme).toBe('light');
    expect(settings.demoMode).toBe(false);
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    expect(file.getMainOnly()).toEqual({
      performanceFolders: { scorecards: ABS },
      emailPasswordSealed: 'c2VhbGVk',
      performanceFlags: { reportsMade: false, reportsEmailed: false },
    });
  });

  it('saving the settings keeps the main-only part, and the other way round', () => {
    const io = memoryIo({ performanceFolders: { pod: ABS } });
    const file = new SettingsFile('settings.json', io);
    const settings = file.load();
    file.save({ ...settings, fontScale: 1.2, demoMode: true });
    expect(io.saved).toMatchObject({
      fontScale: 1.2,
      demoMode: false,
      performanceFolders: { pod: ABS },
    });
    file.updateMainOnly((kept) => ({ ...kept, emailPasswordSealed: 'YWJj' }));
    expect(io.saved).toMatchObject({
      fontScale: 1.2,
      emailPasswordSealed: 'YWJj',
      performanceFolders: { pod: ABS },
    });
  });

  it('drops anything odd in the main-only part', () => {
    expect(
      readMainOnly({
        performanceFolders: { scorecards: 'relative/folder', photos: ABS, cdf: 7 },
        emailPasswordSealed: 'not base64!',
        performanceFlags: { reportsMade: 'yes' },
      }),
    ).toEqual({
      performanceFolders: {},
      emailPasswordSealed: null,
      performanceFlags: { reportsMade: false, reportsEmailed: false },
    });
    expect(readMainOnly(null).performanceFolders).toEqual({});
  });
});
