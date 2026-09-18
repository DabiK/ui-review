import { describe, expect, it } from 'vitest';
import {
  captureCommentEvidence,
  createReviewComment,
  createReviewSession,
  deleteReviewCommentAttachment,
  type ReviewComment,
  type ReviewSession,
  type ScreenshotCaptureOutcome,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import {
  FakeScreenshotCaptureAdapter,
  createTinyCapturedImage,
} from '@adapters/runtime/fake-screenshot-capture';
import { FakeComponentContextAdapter } from '@adapters/runtime/fake-component-context';

const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };
const CAPTURE = {
  tabId: 7,
  frameId: 0,
  fingerprint: 'main > button',
  rect: { x: 10, y: 20, width: 100, height: 32 },
  viewport: VIEWPORT,
};

function makeComment(): ReviewComment {
  return createReviewComment({
    id: 'comment-1',
    sessionId: 'session-1',
    text: 'The primary action is not aligned with the title.',
    pageUrl: PAGE_URL,
    viewport: VIEWPORT,
    createdAt: '2026-09-18T10:05:00.000Z',
  });
}

async function setupRepository(): Promise<InMemoryReviewSessionRepository> {
  const repository = new InMemoryReviewSessionRepository();
  const session: ReviewSession = {
    ...createReviewSession({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026, 10:00',
      pageUrl: PAGE_URL,
      startedAt: '2026-09-18T10:00:00.000Z',
    }),
    comments: [makeComment()],
  };
  await repository.save(session);
  return repository;
}

function successOutcome(): ScreenshotCaptureOutcome {
  return {
    viewport: createTinyCapturedImage({ width: 1440, height: 900, byteLength: 4096 }),
    elementCrop: createTinyCapturedImage({ width: 100, height: 32, byteLength: 512 }),
    failureReason: null,
  };
}

function deps(
  repository: InMemoryReviewSessionRepository,
  screenshots: FakeScreenshotCaptureAdapter,
  components: FakeComponentContextAdapter = new FakeComponentContextAdapter(),
) {
  return {
    sessions: repository,
    screenshots,
    components,
    clock: new FixedClockAdapter('2026-09-18T10:06:00.000Z'),
    ids: new SequentialIdGeneratorAdapter('evidence'),
  };
}

describe('captureCommentEvidence', () => {
  it('links both screenshots and a confirmed visual evidence to the comment id', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });

    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.comment.attachments.map((attachment) => attachment.kind)).toEqual([
      'viewport-screenshot',
      'element-crop',
    ]);
    for (const attachment of result.comment.attachments) {
      expect(attachment.commentId).toBe('comment-1');
      expect(attachment.storage.type).toBe('inline-data-url');
      expect(attachment.mimeType).toBe('image/png');
    }
    expect(result.comment.attachments[0]).toMatchObject({ width: 1440, height: 900 });
    expect(result.comment.attachments[1]).toMatchObject({ width: 100, height: 32 });

    expect(result.comment.evidence).toHaveLength(2);
    expect(result.comment.evidence[0]).toMatchObject({
      commentId: 'comment-1',
      confidence: 'confirmed',
      capturedAt: '2026-09-18T10:06:00.000Z',
      payload: { type: 'visual', viewport: 'captured', elementCrop: 'captured', reason: null },
    });
    expect(result.comment.evidence[1]).toMatchObject({
      commentId: 'comment-1',
      confidence: 'unavailable',
      payload: { type: 'framework', framework: 'unknown', componentName: null },
    });

    const stored = await repository.findById('session-1');
    expect(stored?.comments[0]?.attachments).toHaveLength(2);
  });

  it('links the framework observation returned by the inspection port', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });
    const components = new FakeComponentContextAdapter({
      observation: {
        framework: 'react',
        componentName: 'PricingCard',
        componentChain: ['PricingPage', 'PricingCard'],
        confidence: 'confirmed',
      },
    });

    const result = await captureCommentEvidence(deps(repository, screenshots, components), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    if (!result.ok) {
      throw new Error('capture failed');
    }

    expect(components.requests).toEqual([
      { tabId: 7, frameId: 0, fingerprint: 'main > button' },
    ]);
    expect(result.comment.evidence[1]).toMatchObject({
      commentId: 'comment-1',
      confidence: 'confirmed',
      payload: {
        type: 'framework',
        framework: 'react',
        componentName: 'PricingCard',
        componentChain: ['PricingPage', 'PricingCard'],
      },
    });
  });

  it('keeps a production-like framework observation explicitly inferred', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });
    const components = new FakeComponentContextAdapter({
      observation: {
        framework: 'react',
        componentName: 'Yt',
        componentChain: ['t', 'Yt'],
        confidence: 'inferred',
      },
    });

    const result = await captureCommentEvidence(deps(repository, screenshots, components), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    if (!result.ok) {
      throw new Error('capture failed');
    }
    expect(result.comment.evidence[1]).toMatchObject({
      confidence: 'inferred',
      payload: { type: 'framework', componentName: 'Yt' },
    });
  });

  it('degrades a broken inspection port into explicit unavailable evidence', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });
    const components = new FakeComponentContextAdapter();
    components.detect = async () => {
      throw new Error('inspection adapter crash');
    };

    const result = await captureCommentEvidence(deps(repository, screenshots, components), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.comment.evidence[1]).toMatchObject({
      confidence: 'unavailable',
      payload: { type: 'framework', framework: 'unknown', componentName: null },
    });
  });

  it('replaces a malformed observation with an explicit unavailable one', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });
    const components = new FakeComponentContextAdapter();
    components.detect = async () => ({ framework: 'angular' }) as never;

    const result = await captureCommentEvidence(deps(repository, screenshots, components), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.comment.evidence[1]).toMatchObject({
      confidence: 'unavailable',
      payload: { type: 'framework', framework: 'unknown', componentName: null },
    });
  });

  it('records a partial capture as inferred with an explicit reason', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({
      outcome: {
        viewport: createTinyCapturedImage({ width: 1440, height: 900 }),
        elementCrop: null,
        failureReason: 'The pinned element is outside the visible area.',
      },
    });

    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    if (!result.ok) {
      throw new Error('capture failed');
    }

    expect(result.comment.attachments.map((attachment) => attachment.kind)).toEqual([
      'viewport-screenshot',
    ]);
    expect(result.comment.evidence[0]).toMatchObject({
      confidence: 'inferred',
      payload: {
        type: 'visual',
        viewport: 'captured',
        elementCrop: 'failed',
        reason: 'The pinned element is outside the visible area.',
      },
    });
  });

  it('keeps the comment usable and explicit when no screenshot could be captured', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({
      outcome: { viewport: null, elementCrop: null, failureReason: 'Capture was denied.' },
    });

    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    if (!result.ok) {
      throw new Error('capture failed');
    }

    expect(result.comment.attachments).toEqual([]);
    expect(result.comment.text).not.toBe('');
    expect(result.comment.evidence[0]).toMatchObject({
      confidence: 'unavailable',
      payload: {
        type: 'visual',
        viewport: 'failed',
        elementCrop: 'failed',
        reason: 'Capture was denied.',
      },
    });
  });

  it('records an explicit failure when the transport had no tab context', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });

    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: null,
    });

    if (!result.ok) {
      throw new Error('capture failed');
    }

    expect(result.comment.attachments).toEqual([]);
    const payload = result.comment.evidence[0]?.payload;
    expect(payload).toMatchObject({ type: 'visual', viewport: 'failed', elementCrop: 'failed' });
    if (payload?.type !== 'visual') {
      throw new Error('expected visual evidence');
    }
    expect(payload.reason).toContain('browser tab');
    expect(result.comment.evidence[1]).toMatchObject({
      confidence: 'unavailable',
      payload: { type: 'framework', framework: 'unknown' },
    });
  });

  it('degrades a broken capture adapter into explicit failed evidence', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter();
    screenshots.capture = async () => {
      throw new Error('unexpected adapter crash');
    };

    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.comment.evidence[0]).toMatchObject({
      confidence: 'unavailable',
      payload: { type: 'visual', reason: 'The screenshot could not be captured.' },
    });
  });

  it('reports unknown sessions and comments instead of writing', async () => {
    const repository = await setupRepository();
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });

    const unknownSession = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'missing',
      commentId: 'comment-1',
      capture: CAPTURE,
    });
    expect(unknownSession).toMatchObject({ ok: false, reason: 'session-not-found' });

    const unknownComment = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'missing',
      capture: CAPTURE,
    });
    expect(unknownComment).toMatchObject({ ok: false, reason: 'comment-not-found' });
  });
});

describe('deleteReviewCommentAttachment', () => {
  async function captureBoth(
    repository: InMemoryReviewSessionRepository,
  ): Promise<readonly string[]> {
    const screenshots = new FakeScreenshotCaptureAdapter({ outcome: successOutcome() });
    const result = await captureCommentEvidence(deps(repository, screenshots), {
      sessionId: 'session-1',
      commentId: 'comment-1',
      capture: CAPTURE,
    });
    if (!result.ok) {
      throw new Error('capture setup failed');
    }
    return result.comment.attachments.map((attachment) => attachment.id);
  }

  it('removes either screenshot independently and keeps the other', async () => {
    const repository = await setupRepository();
    const [viewportId, cropId] = await captureBoth(repository);
    if (viewportId === undefined || cropId === undefined) {
      throw new Error('attachments missing');
    }

    const removed = await deleteReviewCommentAttachment(
      { sessions: repository },
      { sessionId: 'session-1', commentId: 'comment-1', attachmentId: viewportId },
    );

    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      return;
    }
    expect(removed.comment.attachments.map((attachment) => attachment.id)).toEqual([cropId]);
    expect(removed.comment.evidence).toHaveLength(2);

    const stored = await repository.findById('session-1');
    expect(stored?.comments[0]?.attachments.map((attachment) => attachment.id)).toEqual([cropId]);
  });

  it('reports unknown sessions, comments and attachments', async () => {
    const repository = await setupRepository();
    const [viewportId] = await captureBoth(repository);

    const unknownSession = await deleteReviewCommentAttachment(
      { sessions: repository },
      { sessionId: 'missing', commentId: 'comment-1', attachmentId: viewportId ?? 'a' },
    );
    expect(unknownSession).toMatchObject({ ok: false, reason: 'session-not-found' });

    const unknownComment = await deleteReviewCommentAttachment(
      { sessions: repository },
      { sessionId: 'session-1', commentId: 'missing', attachmentId: viewportId ?? 'a' },
    );
    expect(unknownComment).toMatchObject({ ok: false, reason: 'comment-not-found' });

    const unknownAttachment = await deleteReviewCommentAttachment(
      { sessions: repository },
      { sessionId: 'session-1', commentId: 'comment-1', attachmentId: 'missing' },
    );
    expect(unknownAttachment).toMatchObject({ ok: false, reason: 'attachment-not-found' });
  });
});
