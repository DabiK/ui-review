/**
 * Chrome side-panel integration. This is the only place that knows how the panel is
 * attached to the toolbar action; the UI and the core stay unaware of `chrome.*`.
 */
export async function attachSidePanelToAction(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
