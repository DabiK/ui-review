import type { ReviewChangeBroadcaster, ReviewChangeSubscription } from '@app';

/**
 * In-memory double of the review change channel. It is a real implementation of both
 * gateway halves and lets unit tests observe panel notifications and overlay syncs without
 * a browser.
 */
export class InMemoryReviewChangeBus implements ReviewChangeBroadcaster, ReviewChangeSubscription {
  private readonly listeners = new Set<() => void>();
  private panelNotificationCount = 0;

  /** Pages the app asked to re-sync, in call order. */
  readonly syncedPages: string[] = [];

  get panelNotifications(): number {
    return this.panelNotificationCount;
  }

  notifyPanelChanged(): void {
    this.panelNotificationCount += 1;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  syncPageOverlay(pageUrl: string): void {
    this.syncedPages.push(pageUrl);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
