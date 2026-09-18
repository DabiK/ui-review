import { describe, expect, it, vi } from 'vitest';
import {
  createReviewComment,
  createReviewSession,
  type AddReviewCommentResult,
  type OverlayState,
  type StopReviewSessionResult,
} from '@core';
import {
  handleReviewRequest,
  type ReviewMessageContainer,
} from '../../src/adapters/chrome/review-message-router';
import {
  REVIEW_MESSAGES,
  type CommentCreateRequest,
  type OverlaySyncRequest,
  type StopSessionRequest,
} from '../../src/adapters/chrome/review-messages';

const PAGE_URL = 'https://example.com/pricing';
const EMPTY_OVERLAY: OverlayState = { active: false, sessionId: null, comments: [] };

const createdComment = createReviewComment({
  id: 'comment-1',
  sessionId: 'session-1',
  text: 'Misaligned action.',
  pageUrl: PAGE_URL,
  viewport: { width: 1440, height: 900 },
  createdAt: '2026-09-18T10:05:00.000Z',
});

const stoppedSession = createReviewSession({
  id: 'session-1',
  name: 'example.com — 18 Sep 2026',
  pageUrl: PAGE_URL,
  startedAt: '2026-09-18T10:00:00.000Z',
});

function makeContainer(overrides: Partial<ReviewMessageContainer> = {}): ReviewMessageContainer {
  return {
    loadOverlayState: vi.fn(async (): Promise<OverlayState> => EMPTY_OVERLAY),
    addReviewComment: vi.fn(
      async (): Promise<AddReviewCommentResult> => ({ ok: true, comment: createdComment }),
    ),
    stopReviewSession: vi.fn(
      async (): Promise<StopReviewSessionResult> => ({ ok: true, session: stoppedSession }),
    ),
    syncPageOverlay: vi.fn(),
    notifyPanelChanged: vi.fn(),
    ...overrides,
  };
}

function overlaySync(pageUrl = PAGE_URL): OverlaySyncRequest {
  return { type: REVIEW_MESSAGES.overlaySync, pageUrl };
}

function commentCreate(overrides: Partial<CommentCreateRequest> = {}): CommentCreateRequest {
  return {
    type: REVIEW_MESSAGES.commentCreate,
    sessionId: 'session-1',
    pageUrl: PAGE_URL,
    text: 'Misaligned action.',
    category: 'UI',
    priority: 'important',
    viewport: { width: 1440, height: 900 },
    anchor: {
      fingerprint: 'main > button',
      ancestry: ['main'],
      text: 'Save',
      role: 'button',
      accessibleName: null,
      attributes: {},
      boundingBox: { x: 10, y: 20, width: 100, height: 32 },
      viewport: { width: 1440, height: 900 },
      computedStyles: {},
    },
    ...overrides,
  };
}

describe('handleReviewRequest', () => {
  it('answers an overlay sync with the state of the sender page', async () => {
    const loadOverlayState = vi.fn(
      async (): Promise<OverlayState> => ({
        active: true,
        sessionId: 'session-1',
        comments: [],
      }),
    );
    const container = makeContainer({ loadOverlayState });

    const response = await handleReviewRequest(container, overlaySync(), PAGE_URL);

    expect(loadOverlayState).toHaveBeenCalledWith(PAGE_URL);
    expect(response).toEqual({ active: true, sessionId: 'session-1', comments: [] });
  });

  it('prefers the sender URL over the payload for an overlay sync', async () => {
    const loadOverlayState = vi.fn(async (): Promise<OverlayState> => EMPTY_OVERLAY);
    const container = makeContainer({ loadOverlayState });

    await handleReviewRequest(container, overlaySync('https://example.com/other'), PAGE_URL);

    expect(loadOverlayState).toHaveBeenCalledWith(PAGE_URL);
  });

  it('creates a comment, then syncs the overlay and the panel', async () => {
    const addReviewComment = vi.fn(
      async (): Promise<AddReviewCommentResult> => ({ ok: true, comment: createdComment }),
    );
    const syncPageOverlay = vi.fn();
    const notifyPanelChanged = vi.fn();
    const container = makeContainer({ addReviewComment, syncPageOverlay, notifyPanelChanged });

    const response = await handleReviewRequest(container, commentCreate(), PAGE_URL);

    expect(addReviewComment).toHaveBeenCalledWith({
      sessionId: 'session-1',
      text: 'Misaligned action.',
      category: 'UI',
      priority: 'important',
      pageUrl: PAGE_URL,
      viewport: { width: 1440, height: 900 },
      anchor: commentCreate().anchor,
    });
    expect(syncPageOverlay).toHaveBeenCalledWith(PAGE_URL);
    expect(notifyPanelChanged).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ ok: true, commentId: 'comment-1' });
  });

  it('rejects a comment coming from another page without writing', async () => {
    const addReviewComment = vi.fn(
      async (): Promise<AddReviewCommentResult> => ({ ok: true, comment: createdComment }),
    );
    const container = makeContainer({ addReviewComment });

    const response = await handleReviewRequest(
      container,
      commentCreate(),
      'https://other.example.com/',
    );

    expect(addReviewComment).not.toHaveBeenCalled();
    expect(response).toEqual({
      ok: false,
      message: 'This note does not match the page it was written on.',
    });
  });

  it('reports an explicit message when the review is no longer active', async () => {
    const syncPageOverlay = vi.fn();
    const notifyPanelChanged = vi.fn();
    const container = makeContainer({
      addReviewComment: vi.fn(
        async (): Promise<AddReviewCommentResult> => ({
          ok: false,
          reason: 'session-not-active',
          sessionId: 'session-1',
        }),
      ),
      syncPageOverlay,
      notifyPanelChanged,
    });

    const response = await handleReviewRequest(container, commentCreate(), PAGE_URL);

    expect(response).toEqual({
      ok: false,
      message: 'This review is no longer running. Refresh the page and start a new review.',
    });
    expect(syncPageOverlay).not.toHaveBeenCalled();
    expect(notifyPanelChanged).not.toHaveBeenCalled();
  });

  it('stops the active session of the page and refreshes both sides', async () => {
    const stopReviewSession = vi.fn(
      async (): Promise<StopReviewSessionResult> => ({ ok: true, session: stoppedSession }),
    );
    const syncPageOverlay = vi.fn();
    const notifyPanelChanged = vi.fn();
    const container = makeContainer({
      loadOverlayState: vi.fn(
        async (): Promise<OverlayState> => ({
          active: true,
          sessionId: 'session-1',
          comments: [],
        }),
      ),
      stopReviewSession,
      syncPageOverlay,
      notifyPanelChanged,
    });

    const request: StopSessionRequest = { type: REVIEW_MESSAGES.stopSession, pageUrl: PAGE_URL };
    const response = await handleReviewRequest(container, request, PAGE_URL);

    expect(stopReviewSession).toHaveBeenCalledWith('session-1');
    expect(syncPageOverlay).toHaveBeenCalledWith(PAGE_URL);
    expect(notifyPanelChanged).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ ok: true });
  });

  it('does nothing when no session is active for the stop request', async () => {
    const stopReviewSession = vi.fn();
    const container = makeContainer({ stopReviewSession });
    const request: StopSessionRequest = { type: REVIEW_MESSAGES.stopSession, pageUrl: PAGE_URL };

    const response = await handleReviewRequest(container, request, PAGE_URL);

    expect(stopReviewSession).not.toHaveBeenCalled();
    expect(response).toEqual({ ok: true });
  });
});
