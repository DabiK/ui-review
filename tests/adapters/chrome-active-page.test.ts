import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChromeActivePageAdapter } from '@adapters/chrome/active-page';
import { describeActivePagePortContract } from './active-page.contract';

function stubActiveTabs(tabs: readonly { url?: string; title?: string }[]): void {
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn().mockResolvedValue(tabs) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describeActivePagePortContract({
  createAdapter: (page) => {
    stubActiveTabs(page === null ? [] : [{ url: page.url, title: page.title }]);
    return new ChromeActivePageAdapter();
  },
});

describe('ChromeActivePageAdapter', () => {
  it('queries the active tab of the last focused window', async () => {
    const query = vi.fn().mockResolvedValue([{ url: 'https://example.com/', title: 'Example' }]);
    vi.stubGlobal('chrome', { tabs: { query } });

    await new ChromeActivePageAdapter().read();

    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
  });

  it('returns null for a tab without a url', async () => {
    stubActiveTabs([{ title: 'New tab' }]);

    expect(await new ChromeActivePageAdapter().read()).toBeNull();
  });
});
