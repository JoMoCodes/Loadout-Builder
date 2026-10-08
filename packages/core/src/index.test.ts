import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as importers from './importers';

describe('core', () => {
  it('is wired up and can be imported', () => {
    expect(main.CORE_NAME).toBe('@loadout/core');
  });

  it('keeps the file readers out of the main entry, so a browser window can load it', () => {
    expect(main).not.toHaveProperty('importLoadoutSheet');
    expect(main).toHaveProperty('RELEASE_NOTES');
  });

  it('offers the file readers from their own entry', () => {
    expect(importers.importLoadoutSheet).toBeTypeOf('function');
    expect(importers.importAssociateData).toBeTypeOf('function');
  });
});
