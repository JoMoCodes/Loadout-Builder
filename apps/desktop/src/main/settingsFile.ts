// The app's one settings file (settings.json in the app's data folder). It holds the settings a
// page can see and change (AppSettings), and next to them a few things only the main process
// keeps: the folders each kind of weekly export is brought in from, the email app password
// (sealed by the computer), and whether reports were ever made or emailed. A page never
// receives these: `settings:get` answers AppSettings only, and saving AppSettings keeps them.

import { isAbsolute } from 'node:path';
import { PERF_KINDS, type PerfKind } from '../shared/performance';
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from '../shared/settings';
import { readJson, writeJson } from './jsonFile';

/** What only the main process keeps in the settings file. */
export interface MainOnlySettings {
  /**
   * The folder (or, for the thresholds, the file) each kind comes from. A folder kept for a kind
   * the app no longer brings in this way (the driver list, before it moved to Associates) is
   * not read: only the kinds in PERF_KINDS are kept.
   */
  performanceFolders: Partial<Record<PerfKind, string>>;
  /** The email app password, sealed by the computer's safe storage, as base64. */
  emailPasswordSealed: string | null;
  /** Reports have been made / emailed from the real data at least once (checklist steps). */
  performanceFlags: { reportsMade: boolean; reportsEmailed: boolean };
  /** The route sheet run open last (reopened when the app opens, if it is for today). */
  lastRunId?: string | null;
}

export const MAIN_ONLY_KEYS = [
  'performanceFolders',
  'emailPasswordSealed',
  'performanceFlags',
  'lastRunId',
] as const satisfies readonly (keyof MainOnlySettings)[];

export function emptyMainOnly(): MainOnlySettings {
  return {
    performanceFolders: {},
    emailPasswordSealed: null,
    performanceFlags: { reportsMade: false, reportsEmailed: false },
  };
}

const BASE64 = /^[A-Za-z0-9+/=]{1,20000}$/;
// The shape of a route sheet run id (the old app's rule for a run folder's name).
const RUN_ID = /^[A-Za-z0-9_.-]{1,80}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Keeps only the valid main-only fields of what was read from the file. */
export function readMainOnly(raw: unknown): MainOnlySettings {
  const out = emptyMainOnly();
  const input = record(raw);
  if (input === null) return out;
  const folders = record(input.performanceFolders);
  if (folders) {
    for (const kind of PERF_KINDS) {
      const value = folders[kind];
      if (typeof value === 'string' && value.length <= 1000 && isAbsolute(value)) {
        out.performanceFolders[kind] = value;
      }
    }
  }
  if (typeof input.emailPasswordSealed === 'string' && BASE64.test(input.emailPasswordSealed)) {
    out.emailPasswordSealed = input.emailPasswordSealed;
  }
  const flags = record(input.performanceFlags);
  if (flags) {
    out.performanceFlags.reportsMade = flags.reportsMade === true;
    out.performanceFlags.reportsEmailed = flags.reportsEmailed === true;
  }
  if (typeof input.lastRunId === 'string' && RUN_ID.test(input.lastRunId)) {
    out.lastRunId = input.lastRunId;
  }
  return out;
}

export interface SettingsFileIo {
  read(file: string): unknown;
  write(file: string, value: unknown): boolean;
}

const realIo: SettingsFileIo = { read: readJson, write: writeJson };

export class SettingsFile {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private mainOnly: MainOnlySettings = emptyMainOnly();

  constructor(
    private readonly file: string,
    private readonly io: SettingsFileIo = realIo,
  ) {}

  /** Reads the file. Demo mode is never remembered: the app always starts on the real data. */
  load(): AppSettings {
    const raw = this.io.read(this.file);
    this.settings = { ...mergeSettings(DEFAULT_SETTINGS, raw), demoMode: false };
    this.mainOnly = readMainOnly(raw);
    return this.settings;
  }

  /** Saves the page's settings, keeping the main-only part as it is. */
  save(settings: AppSettings): boolean {
    this.settings = settings;
    return this.write();
  }

  /** The main-only part (a copy). */
  getMainOnly(): MainOnlySettings {
    return structuredClone(this.mainOnly);
  }

  /** Changes the main-only part and saves, keeping the page's settings as they are. */
  updateMainOnly(change: (current: MainOnlySettings) => MainOnlySettings): boolean {
    this.mainOnly = readMainOnly(change(this.getMainOnly()));
    return this.write();
  }

  private write(): boolean {
    return this.io.write(this.file, { ...this.settings, demoMode: false, ...this.mainOnly });
  }
}
