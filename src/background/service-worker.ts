import { attachSidePanelToAction } from '@adapters/chrome/side-panel';

attachSidePanelToAction().catch((error: unknown) => {
  console.error('[ui-review] failed to attach the side panel to the toolbar action', error);
});
