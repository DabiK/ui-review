import type { RuntimeInfo, RuntimeInfoPort } from '@core';

/** Production adapter: reads facts from the Chrome extension runtime. */
export class ChromeRuntimeInfoAdapter implements RuntimeInfoPort {
  async read(): Promise<RuntimeInfo> {
    const manifest = chrome.runtime.getManifest();

    return {
      extensionName: manifest.name,
      extensionVersion: manifest.version,
      runtimeLabel: 'Chrome MV3 side panel',
    };
  }
}
