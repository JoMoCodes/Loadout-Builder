// Made-up data for the Route Data, Vehicle Data and Associates page tests, and a few helpers to
// open a page on the stand-in bridge and change the data the way the app does (change it, then
// say so). Every name, ID and VIN comes from packages/fixtures/manifest.json.

import type { Page } from '@playwright/test';
import { installFakeBridge, onCall, type FakeBridgeOptions } from './fakeBridge';

export const CARMEN = { name: 'Carmen Abernathy', id: 'A047LNAN5VQIQR' };
export const BARRETT = { name: 'Barrett Ainsworth', id: 'A083QLD1CI9YSZ' };
export const COLTON = { name: 'Colton Alderman', id: 'A08Z3QTIYAI58G' };
export const ZANE = { name: 'Zane Applewhite', id: 'A0DZDWECHDJ5TO' };
export const VIN_A = '1F61D2KP0L0W91839';
export const VIN_B = '1F66B2RY9L0Y83576';
export const VIN_C = '1F69F2MV9L0F55866';

type Json = Record<string, unknown>;

export function associate(who: { name: string; id: string }, values: Json = {}): Json {
  return {
    associate: {
      name: who.name,
      transporterId: who.id,
      position: 'Delivery Associate',
      qualifications: ['EDV'],
      idExpiration: null,
      personalPhone: '',
      workPhone: '',
      email: '',
      status: 'ACTIVE',
      tenure: null,
      ...((values.associate as Json | undefined) ?? {}),
    },
    vanBadges: 'EDV',
    lmrApproved: false,
    idState: 'ok',
    daysUntilIdExpiry: null,
    onRoster: false,
    ...Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'associate')),
  };
}

export function van(vin: string, name: string, values: Json = {}): Json {
  const { vehicle, ...rest } = values;
  return {
    vehicle: {
      vin,
      name,
      serviceType: 'Electric Vehicle',
      serviceTier: '',
      make: 'Make',
      model: 'Model',
      subModel: '',
      plate: '',
      year: '2024',
      ownership: 'LEASED',
      typeLabel: '',
      operational: true,
      status: 'OPERATIONAL',
      statusNote: '',
      registrationExpiry: null,
      ownershipEnd: null,
      station: '',
      ...((vehicle as Json | undefined) ?? {}),
    },
    operational: true,
    overridden: false,
    priority: '',
    affinity: {},
    rental: false,
    inUse: false,
    available: true,
    ...rest,
  };
}

export function entry(values: Json = {}): Json {
  return {
    transporterId: '',
    driverName: '',
    routeCode: '',
    dispatchTime: '',
    serviceType: '',
    routeDuration: '',
    vin: '',
    detail: '',
    sharedDrivers: '',
    sharedIds: '',
    pad: '',
    ...values,
  };
}

/** A route export. `pads` is a list of [dispatch time, PAD] pairs (turned into a Map in the page). */
export function routeSet(
  kind: 'routes' | 'itineraries' | 'schedule',
  rows: Json[],
  extra: Json = {},
): Json {
  return {
    kind,
    label: { routes: 'Routes', itineraries: 'Itineraries', schedule: 'Weekly Schedule' }[kind],
    rows,
    pads: [],
    day: rows.length > 0 ? '2026-09-11' : null,
    sourceFile: rows.length > 0 ? `C:\\Downloads\\${kind}-export.xlsx` : '',
    importedAt: null,
    sourceTotal: null,
    ...extra,
  };
}

export function emptyRouteSets(): Json[] {
  return [routeSet('routes', []), routeSet('itineraries', []), routeSet('schedule', [])];
}

export interface OpenOptions {
  snapshot?: FakeBridgeOptions['snapshot'];
}

/**
 * Opens a page on the stand-in bridge. Adds `window.__change(patch)` to the page: it changes the
 * snapshot, counts a revision and announces `state:changed`, like a command in the app.
 */
export async function openPage(page: Page, pageId: string, options: OpenOptions = {}) {
  await installFakeBridge(page, {
    settings: { demoMode: false },
    snapshot: { routeSets: emptyRouteSets() as never, ...options.snapshot },
  });
  await page.addInitScript(() => {
    const w = window as unknown as {
      __fake: { snapshot: Record<string, unknown>; emit: (n: string, p: unknown) => void };
      __change: (patch: Record<string, unknown>) => void;
    };
    // Maps do not travel through the test's messages, so route sets carry their PADs as pairs.
    const fixPads = () => {
      const sets = (w.__fake.snapshot.routeSets ?? []) as Array<{ pads: unknown }>;
      for (const set of sets) {
        if (!(set.pads instanceof Map)) set.pads = new Map(set.pads as Array<[string, number]>);
      }
    };
    fixPads();
    w.__change = (patch) => {
      Object.assign(w.__fake.snapshot, patch);
      fixPads();
      const next = (w.__fake.snapshot.revision as number) + 1;
      w.__fake.snapshot.revision = next;
      setTimeout(() => w.__fake.emit('state:changed', { revision: next }), 0);
    };
  });
  await page.addInitScript((id) => window.localStorage.setItem('loadout.page', id), pageId);
  await page.goto('/');
  await page.locator(`[data-page="${pageId}"]`).waitFor();
}

/** Makes a command change the snapshot (as the app would) and answer with `value`. */
export async function commandChanges(
  page: Page,
  name: string,
  patch: Json | null,
  value: unknown = null,
) {
  await onCall(
    page,
    name,
    `() => {
      ${patch ? `window.__change(${JSON.stringify(patch)});` : ''}
      return { ok: true, value: ${JSON.stringify(value)} };
    }`,
  );
}

/** Makes a command answer in plain words, as the app does when it refuses. */
export async function commandRefuses(page: Page, name: string, message: string) {
  await onCall(
    page,
    name,
    `() => ({ ok: false, reason: 'refused', message: ${JSON.stringify(message)} })`,
  );
}

/** Makes the file window "choose" this file. `null` is closing the window. */
export async function choosesFile(page: Page, path: string | null) {
  await onCall(
    page,
    'files:pick',
    `() => ({ ok: true, value: { path: ${JSON.stringify(path)} } })`,
  );
}
