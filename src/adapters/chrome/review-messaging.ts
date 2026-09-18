import type { OverlayState, SessionId, Viewport } from '@core';
import {
  isCommentCreateResponse,
  isOverlayStateResponse,
  isReviewRequest,
  REVIEW_MESSAGES,
  type CommentCreateRequest,
  type CommentCreateResponse,
  type OverlaySyncRequest,
  type ReviewRequest,
} from './review-messages';

/**
 * Chrome adapter for the review transport. The page overlay and the service worker use these
 * helpers; they never touch the domain directly.
 */

const EMPTY_OVERLAY_STATE: OverlayState = { active: false, sessionId: null, comments: [] };

export async function requestOverlayState(pageUrl: string): Promise<OverlayState> {
  const request: OverlaySyncRequest = { type: REVIEW_MESSAGES.overlaySync, pageUrl };
  const response: unknown = await chrome.runtime.sendMessage(request);
  return isOverlayStateResponse(response) ? response : EMPTY_OVERLAY_STATE;
}

export interface CommentCreatePayload {
  readonly sessionId: SessionId;
  readonly pageUrl: string;
  readonly text: string;
  readonly category: CommentCreateRequest['category'];
  readonly priority: CommentCreateRequest['priority'];
  readonly viewport: Viewport;
  readonly anchor: CommentCreateRequest['anchor'];
}

export async function requestCommentCreate(
  payload: CommentCreatePayload,
): Promise<CommentCreateResponse> {
  const request: CommentCreateRequest = { type: REVIEW_MESSAGES.commentCreate, ...payload };
  const response: unknown = await chrome.runtime.sendMessage(request);
  if (isCommentCreateResponse(response)) {
    return response;
  }
  return { ok: false, message: 'The note could not be saved.' };
}

export async function requestStopSession(pageUrl: string): Promise<void> {
  await chrome.runtime.sendMessage({ type: REVIEW_MESSAGES.stopSession, pageUrl });
}

export function listenForOverlaySyncPush(listener: () => void): () => void {
  const handler = (message: unknown): void => {
    if (isReviewRequest(message) && message.type === REVIEW_MESSAGES.overlaySync) {
      listener();
    }
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => {
    chrome.runtime.onMessage.removeListener(handler);
  };
}

/** Asks every open tab showing `pageUrl` to re-sync its overlay. Missing tabs are ignored. */
export function pushOverlaySyncToTabs(pageUrl: string): void {
  void chrome.tabs
    .query({ url: pageUrl })
    .then((tabs) =>
      Promise.all(
        tabs.map(async (tab) => {
          if (tab.id === undefined) {
            return;
          }
          try {
            const request: OverlaySyncRequest = {
              type: REVIEW_MESSAGES.overlaySync,
              pageUrl,
            };
            await chrome.tabs.sendMessage(tab.id, request);
          } catch {
            // The tab has no content script (restricted page or not yet injected).
          }
        }),
      ),
    )
    .catch(() => undefined);
}

export type ReviewRequestHandler = (
  request: ReviewRequest,
  senderUrl: string | null,
) => Promise<unknown>;

/** Registers the service-worker side of the transport, answering only known requests. */
export function listenForReviewRequests(handler: ReviewRequestHandler): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isReviewRequest(message)) {
      return undefined;
    }
    const senderUrl = sender.tab?.url ?? null;
    void handler(message, senderUrl).then(sendResponse, () => {
      sendResponse(null);
    });
    return true;
  });
}
