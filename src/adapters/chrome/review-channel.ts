import type { ReviewChangeBroadcaster, ReviewChangeSubscription } from '@app';
import { isReviewChangedMessage, REVIEW_MESSAGES } from './review-messages';
import { pushOverlaySyncToTabs } from './review-messaging';

/**
 * Chrome implementation of the review change channel used by the composition root: the side
 * panel subscribes to stored changes, while the service worker and the side panel broadcast.
 */
export class ChromeReviewChannel implements ReviewChangeBroadcaster, ReviewChangeSubscription {
  notifyPanelChanged(): void {
    void chrome.runtime.sendMessage({ type: REVIEW_MESSAGES.reviewChanged }).catch(() => undefined);
  }

  syncPageOverlay(pageUrl: string): void {
    pushOverlaySyncToTabs(pageUrl);
  }

  subscribe(listener: () => void): () => void {
    const handler = (message: unknown): void => {
      if (isReviewChangedMessage(message)) {
        listener();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }
}
