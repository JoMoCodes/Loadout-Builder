// The few choices the app remembers between runs, and the rules for what is allowed.
// Used by both the main process (which saves them) and the screens (which show them).

import {
  DEFAULT_EMAIL,
  DEFAULT_PERFORMANCE,
  mergeEmail,
  mergePerformance,
} from './performanceSettings';
import type { EmailSettings, PerformanceSettings } from './performanceSettings';

export const THEMES = ['light', 'dark', 'high-contrast'] as const;
export type ThemeName = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeName, string> = {
  light: 'Light',
  dark: 'Dark',
  'high-contrast': 'High contrast',
};

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;
export const FONT_SCALE_STEP = 0.1;
export const FONT_SCALE_DEFAULT = 1;

export interface AppSettings {
  theme: ThemeName;
  /** 1 is normal size. The A- and A+ buttons move it by one step. */
  fontScale: number;
  /** When on, the app shows made-up data instead of the real saved data. */
  demoMode: boolean;
  /** The version whose "What's new" the person has already seen. Null on a first run. */
  lastSeenVersion: string | null;
  /** The person has been asked about bringing over the old app's data (or has done it). */
  oldDataAsked: boolean;
  /** The person has been asked about bringing over the old Weekly Performance App's data. */
  perfOldDataAsked: boolean;
  /** The first-day checklist on Home was finished (or put away). How to use can bring it back. */
  checklistHidden: boolean;
  /** The weekly checklist on Home was finished (or put away). The Help menu can bring it back. */
  weeklyChecklistHidden: boolean;
  /** The Dashboard has been opened at least once with the real data (a weekly checklist step). */
  dashboardSeenOnce: boolean;
  /** A roster has been printed or saved from the real data at least once (a checklist step). */
  printedOnce: boolean;
  /** Run a page's short tour by itself the first time the page opens. */
  autoTours: boolean;
  /** The tours that have already run (or were skipped), by name ("home", "load-out-print"). */
  toursSeen: string[];
  /** The Route Sheets page's note about the old Route Sheet Distributor was put away (Got it). */
  routeSheetsNoteSeen: boolean;
  /** The weekly performance choices (rule numbers, report colours, the page's view). */
  performance: PerformanceSettings;
  /**
   * The app's one email setup (Settings > Email), for the weekly reports and the route sheets.
   * The app password is not here: the main process keeps it sealed.
   */
  email: EmailSettings;
}

/** What a screen may ask to change. Anything left out stays as it was. */
export type SettingsPatch = Partial<Omit<AppSettings, 'performance' | 'email'>> & {
  /** Only the fields given change; the rest of the performance choices stay. */
  performance?: DeepPartial<PerformanceSettings>;
  /** Only the fields given change. (An older `performance.email` patch is read as this.) */
  email?: Partial<EmailSettings>;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontScale: FONT_SCALE_DEFAULT,
  demoMode: false,
  lastSeenVersion: null,
  oldDataAsked: false,
  perfOldDataAsked: false,
  checklistHidden: false,
  weeklyChecklistHidden: false,
  dashboardSeenOnce: false,
  printedOnce: false,
  autoTours: true,
  toursSeen: [],
  routeSheetsNoteSeen: false,
  performance: DEFAULT_PERFORMANCE,
  email: DEFAULT_EMAIL,
};

/** A tour's name: lower case words with dashes. */
const TOUR_NAME = /^[a-z]+(-[a-z]+)*$/;
const MAX_TOURS = 60;

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return FONT_SCALE_DEFAULT;
  const clamped = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
  // Steps of 0.05 keep the number tidy (no 1.0999999).
  return Math.round(clamped * 20) / 20;
}

/** The next size up (direction 1) or down (-1) from `current`. */
export function stepFontScale(current: number, direction: 1 | -1): number {
  return clampFontScale(current + direction * FONT_SCALE_STEP);
}

const VERSION_SHAPE = /^[0-9A-Za-z.+-]{1,40}$/;

function isTheme(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Keeps only the valid fields of anything (a saved file, a message from a screen). */
export function sanitizePatch(raw: unknown): SettingsPatch {
  const patch: SettingsPatch = {};
  if (typeof raw !== 'object' || raw === null) return patch;
  const input = raw as Record<string, unknown>;
  if (isTheme(input.theme)) patch.theme = input.theme;
  if (typeof input.fontScale === 'number') patch.fontScale = clampFontScale(input.fontScale);
  if (typeof input.demoMode === 'boolean') patch.demoMode = input.demoMode;
  if (typeof input.lastSeenVersion === 'string' && VERSION_SHAPE.test(input.lastSeenVersion)) {
    patch.lastSeenVersion = input.lastSeenVersion;
  }
  if (typeof input.oldDataAsked === 'boolean') patch.oldDataAsked = input.oldDataAsked;
  if (typeof input.perfOldDataAsked === 'boolean') {
    patch.perfOldDataAsked = input.perfOldDataAsked;
  }
  if (typeof input.checklistHidden === 'boolean') patch.checklistHidden = input.checklistHidden;
  if (typeof input.weeklyChecklistHidden === 'boolean') {
    patch.weeklyChecklistHidden = input.weeklyChecklistHidden;
  }
  if (typeof input.dashboardSeenOnce === 'boolean') {
    patch.dashboardSeenOnce = input.dashboardSeenOnce;
  }
  if (typeof input.printedOnce === 'boolean') patch.printedOnce = input.printedOnce;
  if (typeof input.autoTours === 'boolean') patch.autoTours = input.autoTours;
  if (typeof input.routeSheetsNoteSeen === 'boolean') {
    patch.routeSheetsNoteSeen = input.routeSheetsNoteSeen;
  }
  if (Array.isArray(input.toursSeen) && input.toursSeen.length <= MAX_TOURS) {
    const names = input.toursSeen.filter(
      (name): name is string =>
        typeof name === 'string' && name.length <= 40 && TOUR_NAME.test(name),
    );
    // A list with anything odd in it is refused whole, rather than half kept.
    if (names.length === input.toursSeen.length) patch.toursSeen = [...new Set(names)];
  }
  // Checked field by field when it is merged (mergePerformance); here it only has to be an object.
  if (typeof input.performance === 'object' && input.performance !== null) {
    patch.performance = input.performance as SettingsPatch['performance'];
  }
  // Checked field by field when it is merged (mergeEmail).
  if (typeof input.email === 'object' && input.email !== null && !Array.isArray(input.email)) {
    patch.email = input.email as SettingsPatch['email'];
  }
  return patch;
}

export function mergeSettings(current: AppSettings, raw: unknown): AppSettings {
  const { performance, email, ...rest } = sanitizePatch(raw);
  const base = { ...current, ...rest };
  // Older settings files have no performance part; it starts from the defaults.
  const perf = mergePerformance(current.performance ?? DEFAULT_PERFORMANCE, performance);
  // The email setup used to live under `performance`. A file (or a page) that still says it there
  // and not at the top has it lifted up, so nothing anyone typed is lost.
  const older = performance?.email;
  const now = mergeEmail(
    current.email ?? current.performance?.email ?? DEFAULT_EMAIL,
    email ?? older,
  );
  return { ...base, email: now, performance: { ...perf, email: { ...now } } };
}
