import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushOverlaySyncToTabs } from '../../src/adapters/chrome/review-messaging';
import { REVIEW_MESSAGES } from '../../src/adapters/chrome/review-messages';

const HASH_PAGE_URL = 'https://app.example.com/#/route';

interface TabStub {
  readonly id?: number;
  readonly url?: string;
}

function stubTabs(tabs: readonly TabStub[]) {
  const query = vi.fn().mockResolvedValue(tabs);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { tabs: { query, sendMessage } });
  return { query, sendMessage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pushOverlaySyncToTabs', () => {
  it('reaches the tab of a page whose URL contains a hash route', async () => {
    const { sendMessage } = stubTabs([{ id: 7, url: HASH_PAGE_URL }]);

    pushOverlaySyncToTabs(HASH_PAGE_URL);

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(7, {
      type: REVIEW_MESSAGES.overlaySync,
      pageUrl: HASH_PAGE_URL,
    });
  });

  it('reaches every tab of the same document, whatever the hash route', async () => {
    const { sendMessage } = stubTabs([
      { id: 1, url: 'https://app.example.com/#/settings' },
      { id: 2, url: HASH_PAGE_URL },
    ]);

    pushOverlaySyncToTabs(HASH_PAGE_URL);

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2]);
  });

  it('ignores tabs on another document, even with the same fragment', async () => {
    const { sendMessage } = stubTabs([
      { id: 1, url: 'https://other.example.com/#/route' },
      { id: 2, url: 'https://app.example.com/other#/route' },
      { id: 3, url: 'https://app.example.com/?q=1#/route' },
      { id: 4, url: HASH_PAGE_URL },
    ]);

    pushOverlaySyncToTabs(HASH_PAGE_URL);

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(4, expect.anything());
  });

  it('ignores tabs without an id or url and survives rejected sends', async () => {
    const query = vi.fn().mockResolvedValue([{ url: HASH_PAGE_URL }, { id: 2 }, { id: 3, url: HASH_PAGE_URL }]);
    const sendMessage = vi.fn().mockRejectedValue(new Error('no receiving end'));
    vi.stubGlobal('chrome', { tabs: { query, sendMessage } });

    expect(() => pushOverlaySyncToTabs(HASH_PAGE_URL)).not.toThrow();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(3, expect.anything());
  });

  it('does nothing for an unparsable page URL', async () => {
    const { query, sendMessage } = stubTabs([{ id: 1, url: HASH_PAGE_URL }]);

    pushOverlaySyncToTabs('not a url');

    await Promise.resolve();
    expect(query).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
