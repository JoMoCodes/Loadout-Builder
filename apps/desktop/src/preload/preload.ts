import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { LoadoutApi } from '../shared/api';
import { CHANNELS } from '../shared/channels';

// This file is bundled into one file by the build, so it may import the app's own shared files
// (the sandboxed page cannot load other files at run time). It loads nothing but 'electron'
// from outside.
//
// The bridge is built from the channel registry: one function per declared channel, and nothing
// else. There is no function that takes a channel name from the page.

type Anything = (...args: never[]) => unknown;
const calls: Record<string, Anything> = {};
const signals: Record<string, Anything> = {};
const events: Record<string, Anything> = {};

async function send(name: string, input: unknown): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(name, input);
  } catch {
    // The main process answers every call itself; this only happens if it is shutting down.
    return { ok: false, reason: 'failed' };
  }
}

/**
 * A dropped file: the page hands over the file, and only here is it turned into its place on the
 * computer, which goes straight to the main process to be checked. The page never sees it. A
 * file with no place (one made up in the page) goes as an empty path, which the main process
 * refuses in plain words.
 */
export function droppedFileInput(input: unknown): { page: unknown; kind: unknown; path: string } {
  const given = (typeof input === 'object' && input !== null ? input : {}) as {
    page?: unknown;
    kind?: unknown;
    file?: unknown;
  };
  let path: string;
  try {
    path = given.file ? webUtils.getPathForFile(given.file as File) : '';
  } catch {
    path = '';
  }
  return { page: given.page, kind: given.kind, path };
}

for (const def of Object.values(CHANNELS)) {
  const { name } = def;
  switch (def.kind) {
    case 'query':
    case 'command':
      calls[name] = (
        name === 'files:dropped'
          ? (input?: unknown) => send(name, droppedFileInput(input))
          : (input?: unknown) => send(name, input)
      ) as Anything;
      break;
    case 'signal':
      signals[name] = ((input?: unknown) => ipcRenderer.send(name, input)) as Anything;
      break;
    case 'event':
      events[name] = ((listener: (payload: unknown) => void) => {
        const handler = (_event: unknown, payload: unknown) => listener(payload);
        ipcRenderer.on(name, handler);
        return () => {
          ipcRenderer.removeListener(name, handler);
        };
      }) as Anything;
      break;
  }
}

const api = { calls, signals, events } as unknown as LoadoutApi;

contextBridge.exposeInMainWorld('loadout', api);
