import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '../shared/channels';

const { exposed, invoke, send, on, removeListener, getPathForFile } = vi.hoisted(() => ({
  exposed: {} as Record<string, unknown>,
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  getPathForFile: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      exposed[name] = api;
    },
  },
  ipcRenderer: { invoke, send, on, removeListener },
  webUtils: { getPathForFile },
}));

type Bridge = {
  calls: Record<string, (input?: unknown) => Promise<unknown>>;
  signals: Record<string, (input?: unknown) => void>;
  events: Record<string, (listener: (payload: unknown) => void) => () => void>;
};

async function load(): Promise<Bridge> {
  vi.resetModules();
  await import('./preload');
  return exposed.loadout as Bridge;
}

const named = (kinds: string[]) =>
  Object.values(CHANNELS)
    .filter((def) => kinds.includes(def.kind))
    .map((def) => def.name)
    .sort();

describe('preload', () => {
  beforeEach(() => {
    invoke.mockReset();
    send.mockReset();
    on.mockReset();
    removeListener.mockReset();
  });

  it('exposes the bridge as window.loadout, and only that', async () => {
    await load();
    expect(Object.keys(exposed)).toEqual(['loadout']);
  });

  it('exposes exactly the declared channels, and nothing else', async () => {
    const bridge = await load();
    expect(Object.keys(bridge).sort()).toEqual(['calls', 'events', 'signals']);
    expect(Object.keys(bridge.calls).sort()).toEqual(named(['query', 'command']));
    expect(Object.keys(bridge.signals).sort()).toEqual(named(['signal']));
    expect(Object.keys(bridge.events).sort()).toEqual(named(['event']));
  });

  it('has no function that takes a channel name from the page', async () => {
    const bridge = await load();
    for (const group of [bridge, bridge.calls, bridge.signals, bridge.events]) {
      for (const key of ['invoke', 'send', 'on', 'call', 'emit']) {
        expect(Object.keys(group)).not.toContain(key);
      }
    }
  });

  it('a call sends its own channel name, and answers with what main answered', async () => {
    invoke.mockResolvedValue({ ok: true, value: '2.0.0' });
    const bridge = await load();
    expect(await bridge.calls['app:get-version']?.()).toEqual({ ok: true, value: '2.0.0' });
    expect(invoke).toHaveBeenCalledWith('app:get-version', undefined);
  });

  it('a call that cannot be delivered answers "failed" instead of throwing', async () => {
    invoke.mockRejectedValue(new Error('gone'));
    const bridge = await load();
    expect(await bridge.calls['state:snapshot']?.()).toEqual({ ok: false, reason: 'failed' });
  });

  it('a signal sends one-way, and an event can be listened to and stopped', async () => {
    const bridge = await load();
    bridge.signals['app:renderer-ready']?.('2.0.0');
    expect(send).toHaveBeenCalledWith('app:renderer-ready', '2.0.0');

    const listener = vi.fn();
    const stop = bridge.events['state:changed']?.(listener);
    expect(on).toHaveBeenCalledWith('state:changed', expect.any(Function));
    const handler = on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
    handler({}, { revision: 3 });
    expect(listener).toHaveBeenCalledWith({ revision: 3 });
    stop?.();
    expect(removeListener).toHaveBeenCalledWith('state:changed', handler);
  });

  it('a dropped file goes to main as its place on the computer, and the file stays here', async () => {
    getPathForFile.mockReset();
    getPathForFile.mockReturnValue('/somewhere/2026_09_11_loadout_sheet.xlsx');
    invoke.mockResolvedValue({
      ok: true,
      value: { token: 'dropped-1/2026_09_11_loadout_sheet.xlsx' },
    });
    const bridge = await load();
    const file = { name: '2026_09_11_loadout_sheet.xlsx' };
    const reply = await bridge.calls['files:dropped']?.({
      page: 'load-out',
      kind: 'loadout',
      file,
    });
    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(invoke).toHaveBeenCalledWith('files:dropped', {
      page: 'load-out',
      kind: 'loadout',
      path: '/somewhere/2026_09_11_loadout_sheet.xlsx',
    });
    // The page gets the token back, never the place.
    expect(reply).toEqual({
      ok: true,
      value: { token: 'dropped-1/2026_09_11_loadout_sheet.xlsx' },
    });
  });

  it('a dropped file with no place on the computer goes as an empty path', async () => {
    getPathForFile.mockReset();
    getPathForFile.mockImplementation(() => {
      throw new TypeError('not a file');
    });
    invoke.mockResolvedValue({ ok: false, reason: 'refused', message: 'words' });
    const bridge = await load();
    await bridge.calls['files:dropped']?.({ page: 'load-out', kind: 'loadout', file: {} });
    expect(invoke).toHaveBeenCalledWith('files:dropped', {
      page: 'load-out',
      kind: 'loadout',
      path: '',
    });
    await bridge.calls['files:dropped']?.(null);
    expect(invoke).toHaveBeenLastCalledWith('files:dropped', {
      page: undefined,
      kind: undefined,
      path: '',
    });
  });

  it('loads nothing but electron from outside the app’s own files', () => {
    const source = readFileSync(new URL('./preload.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import (?!type).*from '(.+)';$/gm)].map((m) => m[1]);
    expect(imports.filter((name) => !name?.startsWith('.'))).toEqual(['electron']);
  });
});
