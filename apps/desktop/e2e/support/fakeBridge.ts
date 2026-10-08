// A stand-in for the app's bridge, so a page can be driven in a plain browser on the Vite dev
// server (no Electron). It has one function for every declared channel, answers with plain
// replies you can change, records every call, and can send `state:changed` like the real app.
//
//   await installFakeBridge(page, { settings: { demoMode: true } });
//   await page.goto('/');
//   await onCall(page, 'loadOut:clear-previous-roster', `() => { ...; return { ok: true, value: null }; }`);
//   await emit(page, 'state:changed', { revision: 2 });
//   expect(await callsTo(page, 'files:pick')).toEqual([{ kind: 'vehicles' }]);
//
// Nothing here talks to a database or a file. For the real thing, use the Electron smoke check.

import type { Page } from '@playwright/test';
import { CHANNELS } from '../../src/shared/channels';
import type { AppSettings } from '../../src/shared/settings';
import type { AppSnapshot } from '../../src/shared/snapshot';

export interface FakeBridgeOptions {
  settings?: Partial<AppSettings>;
  /** Changes to the empty snapshot: top-level fields are replaced, `counts` is merged. */
  snapshot?: Partial<Omit<AppSnapshot, 'counts'>> & { counts?: Partial<AppSnapshot['counts']> };
}

declare global {
  interface Window {
    __fake?: {
      settings: Record<string, unknown>;
      snapshot: Record<string, unknown>;
      calls: Array<{ name: string; input: unknown }>;
      hooks: Record<string, (input: unknown) => unknown>;
      emit: (name: string, payload: unknown) => void;
    };
  }
}

export async function installFakeBridge(page: Page, options: FakeBridgeOptions = {}) {
  const channels = Object.values(CHANNELS).map((def) => ({ name: def.name, kind: def.kind }));
  await page.addInitScript(
    ({ channels: declared, options: given }) => {
      const settings: Record<string, unknown> = {
        theme: 'dark',
        fontScale: 1,
        demoMode: false,
        // The same as the app's version, so "What's new" stays out of the way.
        lastSeenVersion: '2.0.0',
        oldDataAsked: false,
        checklistHidden: false,
        printedOnce: false,
        // Off here, so a page tour does not cover the page a test is clicking. The tour tests
        // turn it on.
        autoTours: false,
        toursSeen: [],
        ...given.settings,
      };
      const snapshot: Record<string, unknown> = {
        revision: 1,
        today: '2026-09-11',
        mode: settings.demoMode ? 'demo' : 'real',
        loadOutDate: null,
        roster: { sourceFile: '', importedAt: null, routeSource: '', rows: [] },
        associates: [],
        vehicles: [],
        sources: {
          associates: { sourceFile: '', importedAt: null },
          vehicles: { sourceFile: '', importedAt: null },
        },
        routeSets: [],
        dwp: {
          set: { rows: [], day: null, sourceFile: '', importedAt: null },
          matchedCount: 0,
          dayStatus: 'unknown',
        },
        previousRoster: {
          rows: [],
          loadOutDate: null,
          sourceFile: '',
          importedAt: null,
          routeSource: '',
        },
        lmrApproved: [],
        affinity: {},
        links: new Map(),
        tenure: {
          records: 0,
          sourceFile: '',
          importedAt: null,
          associatesWithCount: 0,
          weekLabel: '',
        },
        print: { spec: {}, presets: [] },
        matchSummary: new Map(),
        counts: {
          rosterRows: 0,
          matched: 0,
          needReview: 0,
          associates: 0,
          activeAssociates: 0,
          vehicles: 0,
          operationalVehicles: 0,
          availableVehicles: 0,
          overriddenVehicles: 0,
          rentalVehicles: 0,
          lmrApproved: 0,
          dwpRows: 0,
          dwpMatched: 0,
          previousRosterRows: 0,
          previousOnToday: 0,
          links: 0,
          affinitySlots: 0,
          routeRows: {},
        },
      };
      const { counts, ...rest } = given.snapshot ?? {};
      Object.assign(snapshot, rest);
      Object.assign(snapshot.counts as object, counts ?? {});

      const listeners: Record<string, Array<(payload: unknown) => void>> = {};
      const fake = {
        settings,
        snapshot,
        calls: [] as Array<{ name: string; input: unknown }>,
        hooks: {} as Record<string, (input: unknown) => unknown>,
        emit: (name: string, payload: unknown) => {
          for (const listener of listeners[name] ?? []) listener(payload);
        },
      };
      window.__fake = fake;

      const answer = (name: string, input: unknown): unknown => {
        // A dropped file is kept as its name: a file cannot be read back out of the page.
        const given = input as { file?: unknown } | undefined;
        const recorded =
          given && given.file instanceof File
            ? { ...given, file: (given.file as File).name }
            : input;
        fake.calls.push({ name, input: recorded });
        const hook = fake.hooks[name];
        if (hook) return hook(input);
        switch (name) {
          case 'app:get-version':
            return { ok: true, value: '2.0.0' };
          case 'settings:get':
            return { ok: true, value: { ...settings } };
          case 'settings:set':
            Object.assign(settings, input);
            snapshot.mode = settings.demoMode ? 'demo' : 'real';
            return { ok: true, value: { ...settings } };
          case 'data:get-source-info':
            return {
              ok: true,
              value: { mode: snapshot.mode, ok: true, reason: null, counts: {} },
            };
          case 'migration:find':
            return { ok: true, value: { found: false, empty: true, demo: !!settings.demoMode } };
          case 'state:snapshot':
            // A copy each time, as the real bridge hands over: a page that keeps the old object
            // would otherwise never notice the change.
            return { ok: true, value: structuredClone(snapshot) };
          case 'updates:get-status':
            return {
              ok: true,
              value: { state: 'idle', version: null, percent: null, message: null },
            };
          case 'layout:get':
            return { ok: true, value: { order: [], widths: {} } };
          default:
            return { ok: true, value: null };
        }
      };

      const calls: Record<string, unknown> = {};
      const signals: Record<string, unknown> = {};
      const events: Record<string, unknown> = {};
      for (const { name, kind } of declared) {
        if (kind === 'query' || kind === 'command') {
          calls[name] = async (input?: unknown) => answer(name, input);
        } else if (kind === 'signal') {
          signals[name] = (input?: unknown) => void answer(name, input);
        } else {
          events[name] = (listener: (payload: unknown) => void) => {
            (listeners[name] ??= []).push(listener);
            return () => {
              listeners[name] = (listeners[name] ?? []).filter((one) => one !== listener);
            };
          };
        }
      }
      (window as unknown as { loadout: unknown }).loadout = { calls, signals, events };
    },
    { channels, options },
  );
}

/** Makes the fake answer this channel with the result of `source`, a function written as text. */
export async function onCall(page: Page, name: string, source: string) {
  await page.evaluate(
    ([channel, code]) => {
      window.__fake!.hooks[channel!] = (0, eval)(code!) as (input: unknown) => unknown;
    },
    [name, source],
  );
}

/** Sends a note from the "main process" to the page, as the real app does. */
export async function emit(page: Page, name: string, payload: unknown) {
  await page.evaluate(([n, p]) => window.__fake!.emit(n as string, p), [name, payload] as const);
}

/** The inputs of every call made to this channel, oldest first. */
export async function callsTo(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate(
    (channel) =>
      window.__fake!.calls.filter((call) => call.name === channel).map((call) => call.input),
    name,
  );
}
