import type { ActivePageInfo, ActivePagePort } from '@core';

/**
 * Production adapter: reads the active tab of the focused browser window through
 * `chrome.tabs`. The core and the UI never touch `chrome.*` directly.
 *
 * Requires the `tabs` permission to expose the tab URL and title.
 */
export class ChromeActivePageAdapter implements ActivePagePort {
  async read(): Promise<ActivePageInfo | null> {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (tab?.url === undefined || tab.url.length === 0) {
      return null;
    }

    return { url: tab.url, title: tab.title ?? '' };
  }
}
