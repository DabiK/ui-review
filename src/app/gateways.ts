/**
 * Application gateways: cross-context notifications that carry no domain decision, so they
 * are declared by the application layer rather than by the domain core. They are implemented
 * by Chrome adapters in production and by in-memory doubles in tests.
 */
export interface ReviewChangeBroadcaster {
  /** Tells the side panel that stored review state changed and should be reloaded. */
  notifyPanelChanged(): void;
  /** Asks the content script of one page to re-sync its overlay. */
  syncPageOverlay(pageUrl: string): void;
}

export interface ReviewChangeSubscription {
  /** Subscribes to stored review changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
