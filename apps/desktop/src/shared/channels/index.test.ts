import { describe, expect, it } from 'vitest';
import { nothing } from './check';
import { as, defineQuery, indexChannels } from './define';
import { CHANNELS } from './index';

describe('the channel registry', () => {
  const defs = Object.values(CHANNELS);

  it('has the shell channels, the state channels and the file channels', () => {
    const names = defs.map((def) => def.name);
    for (const name of [
      'app:get-version',
      'app:renderer-ready',
      'app:open-link',
      'settings:get',
      'settings:set',
      'data:open-folder',
      'data:get-source-info',
      'updates:get-status',
      'updates:check',
      'updates:install',
      'updates:status-changed',
      'state:snapshot',
      'state:changed',
      'files:pick',
      'files:import',
      'migration:find',
      'migration:pick',
      'migration:run',
      'layout:get',
      'layout:set',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('names every channel as area:what-it-does, once', () => {
    const names = defs.map((def) => def.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-zA-Z]+:[a-z]+(-[a-z]+)*$/);
  });

  it('gives every query, command and signal an input check', () => {
    for (const def of defs) {
      if (def.kind !== 'event') expect(typeof def.input).toBe('function');
    }
  });

  it('refuses a name declared twice', () => {
    const one = defineQuery('x:one', { input: nothing, result: as<number>() });
    expect(() => indexChannels([one, one] as const)).toThrow(/declared twice/);
  });

  it('only changes data through commands (queries are never run through the change path)', () => {
    expect(CHANNELS['state:snapshot'].kind).toBe('query');
    expect(CHANNELS['loadOut:clear-previous-roster'].kind).toBe('command');
    expect(CHANNELS['layout:set'].kind).toBe('command');
  });
});
