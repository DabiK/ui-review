import type { OverlayState } from '@core';
import {
  listenForOverlaySyncPush,
  requestCommentCreate,
  requestOverlayState,
  requestStopSession,
} from '@adapters/chrome/review-messaging';
import {
  mountReviewOverlay,
  type OverlayDraft,
  type OverlaySaveResult,
  type ReviewOverlayHandle,
} from './overlay';

/**
 * Driving adapter for the inspected page. It only runs meaningful code after the service
 * worker confirms an explicitly active session for this URL: no listener or overlay exists
 * while review mode is off.
 */

let overlay: ReviewOverlayHandle | null = null;
let sessionId: string | null = null;
let syncing = false;

function currentPageUrl(): string {
  return window.location.href;
}

function ensureOverlay(): ReviewOverlayHandle {
  if (overlay === null) {
    overlay = mountReviewOverlay({
      onCreateComment: saveComment,
      onStopReview: stopReview,
    });
  }
  return overlay;
}

async function saveComment(draft: OverlayDraft): Promise<OverlaySaveResult> {
  if (sessionId === null) {
    return {
      ok: false,
      message: 'This review is no longer running. Refresh the page and start a new review.',
    };
  }

  try {
    const result = await requestCommentCreate({
      sessionId,
      pageUrl: currentPageUrl(),
      text: draft.text,
      category: draft.category,
      priority: draft.priority,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      anchor: draft.anchor,
    });
    if (!result.ok) {
      return result;
    }
    await sync();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'The note could not be saved. Refresh the page and try again.',
    };
  }
}

function stopReview(): void {
  const hadSession = sessionId !== null;
  overlay?.unmount();
  overlay = null;
  sessionId = null;

  if (hadSession) {
    void requestStopSession(currentPageUrl()).catch(() => undefined);
  }
}

function applyState(state: OverlayState): void {
  if (!state.active || state.sessionId === null) {
    overlay?.unmount();
    overlay = null;
    sessionId = null;
    return;
  }

  sessionId = state.sessionId;
  ensureOverlay().setPins(
    state.comments.flatMap((comment) =>
      comment.anchor === null
        ? []
        : [{ id: comment.id, index: comment.index, fingerprint: comment.anchor.fingerprint }],
    ),
  );
}

async function sync(): Promise<void> {
  if (syncing) {
    return;
  }
  syncing = true;
  try {
    applyState(await requestOverlayState(currentPageUrl()));
  } catch {
    // The extension context can be invalidated while the page stays open.
  } finally {
    syncing = false;
  }
}

listenForOverlaySyncPush(() => {
  void sync();
});

void sync();
