import type {
  CommentCategory,
  CommentPriority,
  DomAnchor,
  OverlayState,
  SessionId,
  Viewport,
} from '@core';

/**
 * Versioned transport contract between the extension contexts and the page overlay.
 * Every message carries a namespaced type; unknown payloads are rejected by the guards.
 */
export const REVIEW_MESSAGES = {
  overlaySync: 'ui-review:overlay-sync',
  commentCreate: 'ui-review:comment-create',
  stopSession: 'ui-review:stop-session',
  reviewChanged: 'ui-review:review-changed',
} as const;

export interface OverlaySyncRequest {
  readonly type: typeof REVIEW_MESSAGES.overlaySync;
  readonly pageUrl: string;
}

export interface CommentCreateRequest {
  readonly type: typeof REVIEW_MESSAGES.commentCreate;
  readonly sessionId: SessionId;
  readonly pageUrl: string;
  readonly text: string;
  readonly category: CommentCategory;
  readonly priority: CommentPriority;
  readonly viewport: Viewport;
  readonly anchor: DomAnchor;
}

export interface StopSessionRequest {
  readonly type: typeof REVIEW_MESSAGES.stopSession;
  readonly pageUrl: string;
}

export interface ReviewChangedMessage {
  readonly type: typeof REVIEW_MESSAGES.reviewChanged;
}

export type ReviewRequest = OverlaySyncRequest | CommentCreateRequest | StopSessionRequest;

export type CommentCreateResponse =
  | { readonly ok: true; readonly commentId: string }
  | { readonly ok: false; readonly message: string };

export type StopSessionResponse = { readonly ok: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isViewport(value: unknown): value is Viewport {
  return (
    isRecord(value) &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number'
  );
}

export function isOverlaySyncRequest(value: unknown): value is OverlaySyncRequest {
  return (
    isRecord(value) &&
    value['type'] === REVIEW_MESSAGES.overlaySync &&
    typeof value['pageUrl'] === 'string'
  );
}

export function isCommentCreateRequest(value: unknown): value is CommentCreateRequest {
  return (
    isRecord(value) &&
    value['type'] === REVIEW_MESSAGES.commentCreate &&
    typeof value['sessionId'] === 'string' &&
    typeof value['pageUrl'] === 'string' &&
    typeof value['text'] === 'string' &&
    typeof value['category'] === 'string' &&
    typeof value['priority'] === 'string' &&
    isViewport(value['viewport']) &&
    isRecord(value['anchor'])
  );
}

export function isStopSessionRequest(value: unknown): value is StopSessionRequest {
  return (
    isRecord(value) &&
    value['type'] === REVIEW_MESSAGES.stopSession &&
    typeof value['pageUrl'] === 'string'
  );
}

export function isReviewRequest(value: unknown): value is ReviewRequest {
  return (
    isOverlaySyncRequest(value) ||
    isCommentCreateRequest(value) ||
    isStopSessionRequest(value)
  );
}

export function isReviewChangedMessage(value: unknown): value is ReviewChangedMessage {
  return isRecord(value) && value['type'] === REVIEW_MESSAGES.reviewChanged;
}

export function isCommentCreateResponse(value: unknown): value is CommentCreateResponse {
  return isRecord(value) && typeof value['ok'] === 'boolean';
}

export function isOverlayStateResponse(value: unknown): value is OverlayState {
  return (
    isRecord(value) &&
    typeof value['active'] === 'boolean' &&
    (value['sessionId'] === null || typeof value['sessionId'] === 'string') &&
    Array.isArray(value['comments'])
  );
}
