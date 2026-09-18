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

/**
 * Base document URL (`origin + pathname + search`). Match patterns used by
 * `chrome.tabs.query({ url })` never match a fragment, and a review session can be scoped to
 * a hash route, so tabs are matched on this base instead of on the raw URL.
 */
function documentBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** Asks every open tab showing `pageUrl` to re-sync its overlay. Missing tabs are ignored. */
export function pushOverlaySyncToTabs(pageUrl: string): void {
  const targetBase = documentBaseUrl(pageUrl);
  if (targetBase === null) {
    return;
  }

  void chrome.tabs
    .query({})
    .then((tabs) =>
      Promise.all(
        tabs
          .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => {
            if (tab.id === undefined || tab.url === undefined) {
              return false;
            }
            return documentBaseUrl(tab.url) === targetBase;
          })
          .map(async (tab) => {
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

/** Who sent a request: the page URL and tab when it came from a content script. */
export interface ReviewRequestSender {
  readonly url: string | null;
  readonly tabId: number | null;
}

export type ReviewRequestHandler = (
  request: ReviewRequest,
  sender: ReviewRequestSender,
) => Promise<unknown>;

/** Registers the service-worker side of the transport, answering only known requests. */
export function listenForReviewRequests(handler: ReviewRequestHandler): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isReviewRequest(message)) {
      return undefined;
    }
    const requestSender: ReviewRequestSender = {
      url: sender.tab?.url ?? null,
      tabId: sender.tab?.id ?? null,
    };
    void handler(message, requestSender).then(sendResponse, () => {
      sendResponse(null);
    });
    return true;
  });
}
