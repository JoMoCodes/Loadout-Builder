// "Ask a question" and the release pages open in the computer's browser through one channel,
// which only lets the app's own help pages through. "Open in new window" and "show this page in
// the main window" each ask the main process, which owns the windows.

import { describe, expect, it, vi } from 'vitest';
import { CHANNELS } from '../../shared/channels';
import { DISCUSSIONS_URL } from '../../shared/links';
import { ChannelRefusal } from '../channels';
import { appHandlers } from './app';
import type { HandlerContext, Services } from './types';

function contextWith(openLink: (url: string) => Promise<boolean>): HandlerContext {
  return { services: { openLink } as unknown as Services } as unknown as HandlerContext;
}

describe('app:open-link', () => {
  it('opens the help forum in the browser', async () => {
    const openLink = vi.fn(async () => true);
    await expect(
      appHandlers['app:open-link'](DISCUSSIONS_URL, contextWith(openLink)),
    ).resolves.toBe(null);
    expect(openLink).toHaveBeenCalledWith(DISCUSSIONS_URL);
  });

  it('refuses any other link without opening anything', async () => {
    const openLink = vi.fn(async () => true);
    for (const link of ['https://example.com/', 'file:///C:/x.exe', `${DISCUSSIONS_URL}/new`]) {
      const refused = appHandlers['app:open-link'](link, contextWith(openLink));
      await expect(refused).rejects.toBeInstanceOf(ChannelRefusal);
      await expect(refused).rejects.toMatchObject({ reason: 'not-allowed' });
    }
    expect(openLink).not.toHaveBeenCalled();
  });

  it('says so in plain words when the browser does not open', async () => {
    const refused = appHandlers['app:open-link'](
      DISCUSSIONS_URL,
      contextWith(async () => false),
    );
    await expect(refused).rejects.toMatchObject({ reason: 'refused' });
    await expect(refused).rejects.toThrow(/could not be opened/);
  });
});

describe('app:open-window', () => {
  it('asks the main process for a window on that page and tab', () => {
    const openWindow = vi.fn();
    const ctx = { services: { openWindow } as unknown as Services } as unknown as HandlerContext;
    expect(appHandlers['app:open-window']({ page: 'load-out', tab: 'available-vans' }, ctx)).toBe(
      null,
    );
    expect(openWindow).toHaveBeenCalledWith({ page: 'load-out', tab: 'available-vans' });
  });

  it('only takes a page with one of its own tabs (the input check)', () => {
    const { input } = CHANNELS['app:open-window'];
    expect(input({ page: 'settings' })).toBe(true);
    expect(input({ page: 'load-out', tab: 'roster' })).toBe(true);
    expect(input({ page: 'load-out', tab: 'drivers' })).toBe(false);
    expect(input({ page: 'nowhere' })).toBe(false);
    expect(input('load-out')).toBe(false);
  });
});

describe('app:show-page', () => {
  it('asks the main window to show that page', () => {
    const showPage = vi.fn();
    const ctx = { services: { showPage } as unknown as Services } as unknown as HandlerContext;
    expect(appHandlers['app:show-page']({ page: 'performance' }, ctx)).toBe(null);
    expect(showPage).toHaveBeenCalledWith('performance');
  });

  it('only takes a page (the input check)', () => {
    const { input } = CHANNELS['app:show-page'];
    expect(input({ page: 'home' })).toBe(true);
    expect(input({ page: 'nowhere' })).toBe(false);
    expect(input({})).toBe(false);
  });
});
