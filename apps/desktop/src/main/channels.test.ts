import { describe, expect, it, vi } from 'vitest';
import { filled, nothing, shape } from '../shared/channels/check';
import { as, defineCommand, defineQuery, defineSignal } from '../shared/channels/define';
import {
  ChannelRefusal,
  registerChannel,
  runCall,
  runSignal,
  type ChannelEnv,
  type ChannelEvent,
  type IpcLike,
} from './channels';

const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

function makeEnv() {
  const log: string[] = [];
  let changes = 0;
  const env: ChannelEnv<{ tag: string }> = {
    isOwnPage: (url) => url === OWN,
    context: () => ({ tag: 'ctx' }),
    log: (line) => log.push(line),
    afterCommand: () => {
      changes += 1;
    },
  };
  return { env, log, changes: () => changes };
}

const ask = defineQuery('test:ask', { input: shape({ view: filled(8) }), result: as<string>() });
const doIt = defineCommand('test:do-it', { input: nothing, result: as<number>() });
const quietly = defineCommand('test:quietly', { input: nothing, result: as<null>(), quiet: true });
const note = defineSignal('test:note', { input: filled(8) });

describe('registerChannel: who may ask', () => {
  it('runs the handler for a message from the app\u2019s own page', async () => {
    const { env } = makeEnv();
    const reply = await runCall(
      ask,
      ({ view }, ctx) => `${view}/${ctx.tag}`,
      good,
      { view: 'a' },
      env,
    );
    expect(reply).toEqual({ ok: true, value: 'a/ctx' });
  });

  it('refuses a message from another address, and never runs the handler', async () => {
    const { env, log, changes } = makeEnv();
    const handler = vi.fn(() => 1);
    for (const senderFrame of [
      { url: 'https://example.com/', parent: null },
      { url: 'file:///elsewhere/index.html', parent: null },
      { url: '', parent: null },
    ]) {
      const reply = await runCall(doIt, handler, { senderFrame }, undefined, env);
      expect(reply).toEqual({ ok: false, reason: 'bad-sender' });
    }
    expect(handler).not.toHaveBeenCalled();
    expect(changes()).toBe(0);
    expect(log.every((line) => line === 'test:do-it did not run: bad-sender')).toBe(true);
  });

  it('refuses a message with no frame, or from a frame inside the page', async () => {
    const { env } = makeEnv();
    const handler = vi.fn(() => 1);
    expect(await runCall(doIt, handler, { senderFrame: null }, undefined, env)).toEqual({
      ok: false,
      reason: 'bad-sender',
    });
    const inner: ChannelEvent = { senderFrame: { url: OWN, parent: {} } };
    expect(await runCall(doIt, handler, inner, undefined, env)).toEqual({
      ok: false,
      reason: 'bad-sender',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses a signal from another address too', () => {
    const { env, log } = makeEnv();
    const handler = vi.fn();
    runSignal(
      note,
      handler,
      { senderFrame: { url: 'https://example.com/', parent: null } },
      'hi',
      env,
    );
    expect(handler).not.toHaveBeenCalled();
    expect(log).toEqual(['test:note did not run: bad-sender']);
  });
});

describe('registerChannel: what they send', () => {
  it('refuses input of the wrong shape, and never runs the handler', async () => {
    const { env, changes } = makeEnv();
    const handler = vi.fn(() => 'x');
    for (const input of [
      undefined,
      null,
      'a',
      { view: '' },
      { view: 5 },
      { view: 'far too long' },
    ]) {
      expect(await runCall(ask, handler, good, input, env)).toEqual({
        ok: false,
        reason: 'bad-input',
      });
    }
    expect(handler).not.toHaveBeenCalled();
    expect(changes()).toBe(0);
  });

  it('refuses input where none is wanted', async () => {
    const { env } = makeEnv();
    expect(await runCall(doIt, () => 1, good, { sneaky: true }, env)).toEqual({
      ok: false,
      reason: 'bad-input',
    });
  });

  it('refuses a bad signal without running it', () => {
    const { env, log } = makeEnv();
    const handler = vi.fn();
    runSignal(note, handler, good, 42, env);
    expect(handler).not.toHaveBeenCalled();
    expect(log).toEqual(['test:note did not run: bad-input']);
  });
});

describe('registerChannel: when something goes wrong', () => {
  it('answers with a reason code only, and logs the kind of error but not its text', async () => {
    const { env, log } = makeEnv();
    const secret = 'Could not read C:\\Folder With A Name\\roster.xlsx';
    const reply = await runCall(
      doIt,
      () => {
        throw new TypeError(secret);
      },
      good,
      undefined,
      env,
    );
    expect(reply).toEqual({ ok: false, reason: 'failed' });
    expect(JSON.stringify(reply)).not.toContain('Folder');
    expect(log.join('\n')).toContain('test:do-it failed: TypeError');
    expect(log.join('\n')).not.toContain('Folder');
    expect(log.join('\n')).not.toContain('roster.xlsx');
  });

  it('passes on a refusal the app wrote in plain words', async () => {
    const { env, log } = makeEnv();
    const reply = await runCall(
      doIt,
      () => {
        throw new ChannelRefusal('refused', 'That file is not a vehicle list.');
      },
      good,
      undefined,
      env,
    );
    expect(reply).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That file is not a vehicle list.',
    });
    // The words are for the person; the log only gets the code.
    expect(log.join('\n')).toContain('test:do-it did not run: refused');
    expect(log.join('\n')).not.toContain('vehicle list');
  });

  it('answers a refusal without words with the code alone', async () => {
    const { env } = makeEnv();
    const reply = await runCall(
      ask,
      () => {
        throw new ChannelRefusal('no-data');
      },
      good,
      { view: 'a' },
      env,
    );
    expect(reply).toEqual({ ok: false, reason: 'no-data' });
  });

  it('survives a handler that returns a promise that fails', async () => {
    const { env } = makeEnv();
    const reply = await runCall(
      ask,
      async () => Promise.reject(new Error('x')),
      good,
      { view: 'a' },
      env,
    );
    expect(reply).toEqual({ ok: false, reason: 'failed' });
  });

  it('survives a signal handler that throws', () => {
    const { env, log } = makeEnv();
    runSignal(
      note,
      () => {
        throw new RangeError('private text');
      },
      good,
      'hi',
      env,
    );
    expect(log).toEqual(['test:note failed: RangeError']);
  });
});

describe('registerChannel: telling the page something changed', () => {
  it('runs the change notice after a command, whether or not it worked', async () => {
    const { env, changes } = makeEnv();
    await runCall(doIt, () => 1, good, undefined, env);
    expect(changes()).toBe(1);
    await runCall(
      doIt,
      () => {
        throw new Error('nope');
      },
      good,
      undefined,
      env,
    );
    expect(changes()).toBe(2);
  });

  it('does not run it after a query or a quiet command', async () => {
    const { env, changes } = makeEnv();
    await runCall(ask, () => 'x', good, { view: 'a' }, env);
    await runCall(quietly, () => null, good, undefined, env);
    expect(changes()).toBe(0);
  });
});

describe('registerChannel: wiring', () => {
  it('registers calls with handle and signals with on', async () => {
    const { env } = makeEnv();
    const handled = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
    const listened = new Map<string, (event: ChannelEvent, input: unknown) => void>();
    const ipc: IpcLike = {
      handle: (name, listener) => void handled.set(name, listener),
      on: (name, listener) => void listened.set(name, listener),
    };
    registerChannel(ipc, env, ask, ({ view }) => view);
    registerChannel(ipc, env, note, () => undefined);
    expect([...handled.keys()]).toEqual(['test:ask']);
    expect([...listened.keys()]).toEqual(['test:note']);
    expect(await handled.get('test:ask')?.(good, { view: 'z' })).toEqual({ ok: true, value: 'z' });
  });
});
