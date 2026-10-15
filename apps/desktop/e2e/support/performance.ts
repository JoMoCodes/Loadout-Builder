// Made-up data and helpers for the Scorecards page tests (performance-*.spec.ts). Every name
// and ID comes from packages/fixtures/manifest.json (the made-up people in
// scripts/parity/wpa/expected/drivers.json); the email addresses are at example.com.
//
// The stand-in bridge answers every `performance:*` call from `window.__perf`, which a test can
// change. `settings:set` merges a `performance` patch field by field, as the app does.

import type { Page } from '@playwright/test';
import { DEFAULT_PERFORMANCE } from '../../src/shared/performanceSettings';
import { installFakeBridge } from './fakeBridge';
import { associate } from './pageData';

export const ARCHER = { name: 'Archer Gresham', id: 'A02V4L9HIELIDL' };
export const DESMOND = { name: 'Desmond Marisol Penrose', id: 'A05QUB9XOW4NT1' };
export const CARMEN = { name: 'Carmen Josie Rutherford', id: 'A0EPR3KZOJDR3R' };
export const TOBIAS = { name: 'Tobias Tristan Rainsford', id: 'A0IHV8Z401XHI9' };
export const FABIAN = { name: 'Fabian Delia Colbrook', id: 'A2868K9OBI67DE' };

export const WEEKS = [
  '2026-W31',
  '2026-W32',
  '2026-W33',
  '2026-W34',
  '2026-W35',
  '2026-W36',
  '2026-W37',
  '2026-W38',
  '2026-W39',
  '2026-W40',
];

type Json = Record<string, unknown>;

const NO_SAFETY = {
  total: 0,
  speeding: 0,
  signSignal: 0,
  distraction: 0,
  followingDistance: 0,
  seatbelt: 0,
};

/** One line of the Performance tab. */
export function driverRow(who: { name: string; id: string }, values: Json = {}): Json {
  const averages = {
    score: 90.12,
    rank: 20,
    packages: 800,
    cdf: 99,
    dsb: 0,
    dcr: 1200,
    pod: 99.5,
    psb: 0,
    ced: 0,
  };
  return {
    transporterId: who.id,
    name: who.name,
    status: 'ACTIVE',
    latestWeek: '2026-W40',
    latestTier: 'Gold',
    latestScore: 90.12,
    latestRankDisplay: '20 / 61',
    latestRank: 20,
    latestPackages: 800,
    averages,
    averagesDisplay: Object.fromEntries(Object.entries(averages).map(([k, v]) => [k, String(v)])),
    trend: { scoreDelta: 1.5, tierDelta: 0, slope: 0.2, trendDirection: 'Improving' },
    safety: NO_SAFETY,
    hasEmail: true,
    activeInRange: true,
    ...values,
  };
}

export const DRIVERS = (): Json[] => [
  driverRow(ARCHER, {
    latestScore: 93.58,
    latestRankDisplay: '32 / 61',
    safety: { ...NO_SAFETY, total: 2, speeding: 2 },
  }),
  driverRow(DESMOND, {
    latestTier: 'Bronze',
    latestScore: 76.36,
    trend: { scoreDelta: -4.2, tierDelta: -1, slope: -1, trendDirection: 'Declining' },
  }),
  driverRow(CARMEN, { status: 'INACTIVE', latestTier: 'Platinum', latestScore: 95.07 }),
  driverRow(TOBIAS, { latestTier: 'Platinum', latestScore: 97.72, activeInRange: false }),
  driverRow(FABIAN, { status: '', latestTier: 'Platinum', latestScore: 100, hasEmail: false }),
];

/** The same people on the Associates list (the snapshot), with how to reach them. */
export const ASSOCIATES = (): Json[] => [
  associate(ARCHER, {
    associate: { email: 'driver034@example.com', personalPhone: '4885550141' },
  }),
  associate(DESMOND, { associate: { email: 'driver035@example.com', workPhone: '+17535550146' } }),
  associate(CARMEN, { associate: { status: 'INACTIVE', email: 'driver076@example.com' } }),
  associate(FABIAN, { associate: { status: '' } }),
];

export function importCard(kind: string, values: Json = {}): Json {
  return {
    kind,
    folderName: null,
    folderMissing: false,
    lastImportAt: null,
    newestWeek: null,
    missingWeeks: [],
    ...values,
  };
}

export interface PerfData {
  drivers?: Json[];
  changes?: Json;
  thresholds?: Json[];
  cards?: Json[];
  safety?: Json[];
}

export interface OpenPerformance {
  tab?: 'performance' | 'reports' | 'imports';
  page?: string;
  /** Changes to the performance settings. */
  performance?: Json;
  /** Changes to the other settings (for example `perfOldDataAsked`). */
  settings?: Json;
  /** Changes to `snapshot.performance`. */
  brief?: Json;
  data?: PerfData;
  /** Channels answered with this value from the start (for example `performance:old-data-find`). */
  answers?: Record<string, unknown>;
}

/** Opens the app on the stand-in bridge with weekly performance data, on a page and tab. */
export async function openPerformance(page: Page, options: OpenPerformance = {}) {
  const brief = {
    hasData: true,
    weeks: WEEKS,
    drivers: 5,
    withEmail: 4,
    thresholds: true,
    foldersChosen: 0,
    lastSync: null,
    emailReady: true,
    reportsMade: false,
    reportsEmailed: false,
    ...options.brief,
  };
  await installFakeBridge(page, {
    settings: {
      demoMode: false,
      ...options.settings,
      performance: { ...DEFAULT_PERFORMANCE, ...options.performance },
    },
    snapshot: { performance: brief as never, associates: ASSOCIATES() as never },
  });
  const data: PerfData = {
    drivers: DRIVERS(),
    changes: {
      newestWeek: '2026-W40',
      previousWeek: '2026-W39',
      tierUp: 3,
      tierDown: 2,
      newSafetyEvents: 1,
    },
    thresholds: [],
    cards: [],
    safety: [],
    ...options.data,
  };
  await page.addInitScript(
    ({ given, answers }) => {
      const w = window as unknown as {
        __fake: {
          settings: Record<string, unknown>;
          snapshot: Record<string, unknown>;
          hooks: Record<string, (input: unknown) => unknown>;
          emit: (name: string, payload: unknown) => void;
        };
        __perf: Record<string, unknown>;
        __copied: string[];
        __bump: () => void;
      };
      w.__perf = given;
      w.__copied = [];
      // The page copies with the clipboard; the test reads what it copied.
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (text: string) => {
            w.__copied.push(text);
          },
        },
        configurable: true,
      });
      w.__bump = () => {
        const next = (w.__fake.snapshot.revision as number) + 1;
        w.__fake.snapshot.revision = next;
        setTimeout(() => w.__fake.emit('state:changed', { revision: next }), 0);
      };
      const ok = (value: unknown) => ({ ok: true, value });
      const hooks = w.__fake.hooks;
      hooks['settings:set'] = (input) => {
        const settings = w.__fake.settings;
        const { performance, ...rest } = (input ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(rest)) {
          const now = settings[key];
          // The email setup and the route sheet wording change field by field.
          settings[key] =
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            now &&
            typeof now === 'object'
              ? { ...(now as object), ...(value as object) }
              : value;
        }
        if (performance && typeof performance === 'object') {
          const now = settings.performance as Record<string, unknown>;
          const next: Record<string, unknown> = { ...now };
          for (const [key, value] of Object.entries(performance)) {
            next[key] =
              value && typeof value === 'object' && !Array.isArray(value)
                ? { ...(now[key] as object), ...value }
                : value;
          }
          settings.performance = next;
        }
        return ok(structuredClone(settings));
      };
      hooks['performance:drivers'] = (input) =>
        ok({
          range: (input as { range: unknown }).range,
          rows: w.__perf.drivers,
          changes: w.__perf.changes,
        });
      hooks['performance:thresholds'] = () => ok(w.__perf.thresholds);
      hooks['performance:import-cards'] = () => ok(w.__perf.cards);
      hooks['performance:safety-events'] = () => ok(w.__perf.safety);
      hooks['performance:email-status'] = () => ok({ passwordSaved: false, canSeal: true });
      for (const [name, value] of Object.entries(answers)) hooks[name] = () => ok(value);
      hooks['performance:report-html'] = (input) => {
        const ask = input as { transporterId: string | null };
        return ok({
          html: `<html><body><h1>${ask.transporterId ? `Report ${ask.transporterId}` : 'Sample report'}</h1></body></html>`,
        });
      };
    },
    { given: data as Json, answers: options.answers ?? {} },
  );
  await page.addInitScript(
    ([pageId, tab]) => {
      window.localStorage.setItem('loadout.page', pageId!);
      if (tab) window.localStorage.setItem('loadout.scorecards-tab', tab);
    },
    [options.page ?? 'scorecards', options.tab ?? ''],
  );
  await page.goto('/');
  await page.locator(`[data-page="${options.page ?? 'scorecards'}"]`).waitFor();
}

/** What the page copied, oldest first. */
export async function copied(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
}

/** Changes the made-up data the stand-in answers with. */
export async function setPerf(page: Page, patch: PerfData) {
  await page.evaluate((given) => {
    Object.assign((window as unknown as { __perf: object }).__perf, given);
  }, patch as Json);
}

/** A made-up "Explain this score" answer for one driver's newest week (2026-W40). */
export function explanation(who: { name: string; id: string }): Json {
  const item = (metric: string, tier: string, score: number | null, weight: number | null) => {
    const counted = score !== null && weight !== null && weight > 0;
    return {
      metric,
      metricDisplay: metric,
      value: null,
      tier,
      score,
      weight,
      counted,
      earned: counted ? (score * weight) / 100 : null,
      lost: counted ? ((100 - score) * weight) / 100 : null,
    };
  };
  return {
    transporterId: who.id,
    name: who.name,
    week: '2026-W40',
    overallScore: 76.36,
    overallTier: 'Bronze',
    items: [
      item('Speeding Event Rate', 'Bronze', 0, 11.6),
      item('DCR', 'Silver', 39.02, 10.5),
      item('POD', 'Platinum', 100, 3),
      item('FICO', 'Platinum', null, 11.6),
    ],
    totalWeight: 25.1,
    totalEarned: 7.1,
    totalLost: 18,
    topDrag: item('Speeding Event Rate', 'Bronze', 0, 11.6),
  };
}
