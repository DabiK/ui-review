import { describe, expect, it } from 'vitest';
import {
  addReviewComment,
  captureCommentEvidence,
  createReviewSession,
  loadOverlayState,
  loadReviewPanel,
  stopReviewSession,
  type AddReviewCommentInput,
  type CaptureCommentEvidenceInput,
  type CaptureCommentEvidenceResult,
  type OverlayState,
  type SessionId,
  type StopReviewSessionResult,
} from '@core';
import { InMemoryReviewChangeBus } from '@adapters/runtime/in-memory-review-change-bus';
import {
  FakeScreenshotCaptureAdapter,
  TINY_PNG_BYTE_LENGTH,
  TINY_PNG_DATA_URL,
  createTinyCapturedImage,
} from '@adapters/runtime/fake-screenshot-capture';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { StaticRuntimeInfoAdapter } from '@adapters/runtime/static-runtime-info';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import {
  handleReviewRequest,
  type ReviewMessageContainer,
} from '../../src/adapters/chrome/review-message-router';
import {
  REVIEW_MESSAGES,
  type CommentCreateRequest,
} from '../../src/adapters/chrome/review-messages';
import type { ReviewRequestSender } from '../../src/adapters/chrome/review-messaging';

const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };
const SENDER: ReviewRequestSender = { url: PAGE_URL, tabId: 7 };

function makeContainer(
  repository: InMemoryReviewSessionRepository,
  clock: FixedClockAdapter,
  ids: SequentialIdGeneratorAdapter,
  bus: InMemoryReviewChangeBus,
  screenshots: FakeScreenshotCaptureAdapter,
): ReviewMessageContainer {
  return {
    loadOverlayState: (pageUrl: string): Promise<OverlayState> =>
      loadOverlayState({ sessions: repository }, { pageUrl }),
    addReviewComment: (input: AddReviewCommentInput) =>
      addReviewComment({ sessions: repository, clock, ids }, input),
    captureCommentEvidence: (input: CaptureCommentEvidenceInput): Promise<CaptureCommentEvidenceResult> =>
      captureCommentEvidence({ sessions: repository, screenshots, clock, ids }, input),
    stopReviewSession: (sessionId: SessionId): Promise<StopReviewSessionResult> =>
      stopReviewSession({ sessions: repository, clock }, { sessionId }),
    syncPageOverlay: (pageUrl: string) => {
      bus.syncPageOverlay(pageUrl);
    },
    notifyPanelChanged: () => {
      bus.notifyPanelChanged();
    },
  };
}

function commentCreateRequest(): CommentCreateRequest {
  return {
    type: REVIEW_MESSAGES.commentCreate,
    sessionId: 'session-1',
    pageUrl: PAGE_URL,
    text: 'The primary action is not aligned with the title.',
    category: 'UI',
    priority: 'important',
    viewport: VIEWPORT,
    anchor: {
      fingerprint: 'main > button',
      ancestry: ['main'],
      text: 'Save',
      role: 'button',
      accessibleName: null,
      attributes: {},
      boundingBox: { x: 10, y: 20, width: 100, height: 32 },
      viewport: VIEWPORT,
      computedStyles: {},
    },
  };
}

describe('overlay comment round-trip', () => {
  it('persists a comment with its screenshots and exposes both after a reload', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const clock = new FixedClockAdapter('2026-09-18T10:05:00.000Z');
    const ids = new SequentialIdGeneratorAdapter('comment');
    const bus = new InMemoryReviewChangeBus();
    const screenshots = new FakeScreenshotCaptureAdapter({
      outcome: {
        viewport: createTinyCapturedImage({ width: 1440, height: 900 }),
        elementCrop: createTinyCapturedImage({ width: 100, height: 32 }),
        failureReason: null,
      },
    });
    await repository.save(
      createReviewSession({
        id: 'session-1',
        name: 'example.com — 18 Sep 2026, 10:00',
        pageUrl: PAGE_URL,
        startedAt: '2026-09-18T10:00:00.000Z',
      }),
    );

    const response = await handleReviewRequest(
      makeContainer(repository, clock, ids, bus, screenshots),
      commentCreateRequest(),
      SENDER,
    );

    expect(response).toEqual({ ok: true, commentId: 'comment-1' });
    expect(bus.panelNotifications).toBe(1);
    expect(bus.syncedPages).toEqual([PAGE_URL]);

    // A reload creates fresh adapters: both views must rebuild from the stored aggregate.
    const reloadedPanel = await loadReviewPanel(
      {
        sessions: repository,
        pages: new StaticActivePageAdapter({ url: PAGE_URL, title: 'Pricing' }),
        runtimeInfo: new StaticRuntimeInfoAdapter({
          extensionName: 'UI Review',
          extensionVersion: '0.1.0',
          runtimeLabel: 'Chrome MV3 side panel',
        }),
      },
      { selectedSessionId: 'session-1' },
    );
    expect(reloadedPanel.comments).toEqual([
      {
        id: 'comment-1',
        text: 'The primary action is not aligned with the title.',
        category: 'UI',
        priority: 'important',
        createdAt: '2026-09-18T10:05:00.000Z',
        updatedAt: '2026-09-18T10:05:00.000Z',
        anchorLabel: 'Save',
        attachments: [
          {
            id: 'comment-3',
            kind: 'viewport-screenshot',
            mimeType: 'image/png',
            width: 1440,
            height: 900,
            byteLength: TINY_PNG_BYTE_LENGTH,
            dataUrl: TINY_PNG_DATA_URL,
          },
          {
            id: 'comment-4',
            kind: 'element-crop',
            mimeType: 'image/png',
            width: 100,
            height: 32,
            byteLength: TINY_PNG_BYTE_LENGTH,
            dataUrl: TINY_PNG_DATA_URL,
          },
        ],
        visualEvidence: {
          confidence: 'confirmed',
          viewport: 'captured',
          elementCrop: 'captured',
          reason: null,
        },
      },
    ]);

    const reloadedOverlay = await loadOverlayState(
      { sessions: repository },
      { pageUrl: PAGE_URL },
    );
    expect(reloadedOverlay.active).toBe(true);
    expect(reloadedOverlay.comments[0]).toMatchObject({
      id: 'comment-1',
      index: 1,
      anchor: { fingerprint: 'main > button', text: 'Save' },
    });
  });
});
