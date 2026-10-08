// "Ask a question" and the release pages open in the computer's browser through one channel,
// which only lets the app's own help pages through.

import { describe, expect, it, vi } from 'vitest';
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
