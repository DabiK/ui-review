import type {
  AddReviewCommentInput,
  AddReviewCommentResult,
  OverlayState,
  SessionId,
  StopReviewSessionResult,
} from '@core';
import { isReviewRequest, REVIEW_MESSAGES, type CommentCreateResponse, type ReviewRequest } from './review-messages';
import { listenForReviewRequests } from './review-messaging';

/**
 * Service-worker side of the review transport: translates validated transport requests into
 * core use cases. The routing logic is a pure function so it can be unit tested without a
 * live Chrome runtime.
 */

export interface ReviewMessageContainer {
  loadOverlayState(pageUrl: string): Promise<OverlayState>;
  addReviewComment(input: AddReviewCommentInput): Promise<AddReviewCommentResult>;
  stopReviewSession(sessionId: SessionId): Promise<StopReviewSessionResult>;
  syncPageOverlay(pageUrl: string): void;
  notifyPanelChanged(): void;
}

export type ReviewMessageResponse =
  | OverlayState
  | CommentCreateResponse
  | { readonly ok: true }
  | null;

export async function handleReviewRequest(
  container: ReviewMessageContainer,
  request: ReviewRequest,
  senderUrl: string | null,
): Promise<ReviewMessageResponse> {
  switch (request.type) {
    case REVIEW_MESSAGES.overlaySync:
      return container.loadOverlayState(senderUrl ?? request.pageUrl);

    case REVIEW_MESSAGES.commentCreate: {
      if (senderUrl !== null && senderUrl !== request.pageUrl) {
        return { ok: false, message: 'This note does not match the page it was written on.' };
      }

      const result = await container.addReviewComment({
        sessionId: request.sessionId,
        text: request.text,
        category: request.category,
        priority: request.priority,
        pageUrl: request.pageUrl,
        viewport: request.viewport,
        anchor: request.anchor,
      });

      if (!result.ok) {
        return { ok: false, message: describeAddFailure(result) };
      }

      container.syncPageOverlay(result.comment.pageUrl);
      container.notifyPanelChanged();
      return { ok: true, commentId: result.comment.id };
    }

    case REVIEW_MESSAGES.stopSession: {
      if (senderUrl !== null && senderUrl !== request.pageUrl) {
        return { ok: true };
      }

      const state = await container.loadOverlayState(request.pageUrl);
      if (state.sessionId !== null) {
        const result = await container.stopReviewSession(state.sessionId);
        if (result.ok) {
          container.syncPageOverlay(request.pageUrl);
          container.notifyPanelChanged();
        }
      }
      return { ok: true };
    }
  }
}

/** Wires the pure router to `chrome.runtime.onMessage` for the MV3 service worker. */
export function registerReviewMessageRouter(container: ReviewMessageContainer): void {
  listenForReviewRequests((message, senderUrl) => {
    if (!isReviewRequest(message)) {
      return Promise.resolve(null);
    }
    return handleReviewRequest(container, message, senderUrl);
  });
}

function describeAddFailure(
  failure: Exclude<AddReviewCommentResult, { ok: true }>,
): string {
  switch (failure.reason) {
    case 'session-not-found':
    case 'session-not-active':
      return 'This review is no longer running. Refresh the page and start a new review.';
    case 'page-mismatch':
      return 'This note belongs to a different page than the running review.';
    case 'invalid-comment':
      return failure.field === 'text'
        ? 'Write a note before saving.'
        : 'The note could not be saved because it is incomplete.';
  }
}
