import { describe, expect, it } from 'vitest';
import {
  addReviewComment,
  createReviewSession,
  deleteReviewComment,
  updateReviewComment,
  type ReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';

const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };

function makeSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    ...createReviewSession({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026, 10:00',
      pageUrl: PAGE_URL,
      startedAt: '2026-09-18T10:00:00.000Z',
    }),
    ...overrides,
  };
}

function anchor() {
  return {
    fingerprint: 'main > button',
    ancestry: ['main'],
    text: 'Save',
    role: 'button',
    accessibleName: null,
    attributes: {},
    boundingBox: { x: 10, y: 20, width: 100, height: 32 },
    viewport: VIEWPORT,
    computedStyles: {},
  };
}

function deps(
  repository: InMemoryReviewSessionRepository,
  ids: SequentialIdGeneratorAdapter = new SequentialIdGeneratorAdapter('comment'),
) {
  return {
    sessions: repository,
    clock: new FixedClockAdapter('2026-09-18T10:05:00.000Z'),
    ids,
  };
}

describe('addReviewComment', () => {
  it('adds a comment with defaults and a DOM anchor linked by id', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());

    const result = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: '  The primary action is not aligned.  ',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
      anchor: anchor(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.comment).toMatchObject({
      id: 'comment-1',
      sessionId: 'session-1',
      text: '  The primary action is not aligned.  ',
      category: 'UI',
      priority: 'important',
      pageUrl: PAGE_URL,
      createdAt: '2026-09-18T10:05:00.000Z',
      updatedAt: '2026-09-18T10:05:00.000Z',
    });

    const evidence = result.comment.evidence[0];
    expect(evidence).toMatchObject({
      commentId: 'comment-1',
      confidence: 'confirmed',
      capturedAt: '2026-09-18T10:05:00.000Z',
    });
    expect(evidence?.payload).toMatchObject({ type: 'dom', fingerprint: 'main > button' });

    const stored = await repository.findById('session-1');
    expect(stored?.comments).toHaveLength(1);
    expect(stored?.comments[0]?.id).toBe('comment-1');
  });

  it('accepts explicit category and priority', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());

    const result = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: 'Low contrast.',
      category: 'Accessibility',
      priority: 'critical',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });

    expect(result.ok && result.comment.category).toBe('Accessibility');
    expect(result.ok && result.comment.priority).toBe('critical');
    expect(result.ok && result.comment.evidence).toEqual([]);
  });

  it('refuses blank text without touching the session', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());

    const result = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: '   ',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-comment', field: 'text' });
    expect((await repository.findById('session-1'))?.comments).toEqual([]);
  });

  it('refuses an invalid anchor instead of storing misleading evidence', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());

    const result = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: 'Anchored to nothing.',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
      anchor: { ...anchor(), fingerprint: '  ' },
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-comment', field: 'fingerprint' });
    expect((await repository.findById('session-1'))?.comments).toEqual([]);
  });

  it('refuses an unknown, stopped or foreign session', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());
    await repository.save(
      makeSession({
        id: 'session-stopped',
        status: 'stopped',
        stoppedAt: '2026-09-18T10:30:00.000Z',
      }),
    );

    const unknown = await addReviewComment(deps(repository), {
      sessionId: 'missing',
      text: 'Note',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    expect(unknown).toMatchObject({ ok: false, reason: 'session-not-found' });

    const stopped = await addReviewComment(deps(repository), {
      sessionId: 'session-stopped',
      text: 'Note',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    expect(stopped).toMatchObject({ ok: false, reason: 'session-not-active' });

    const foreign = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: 'Note',
      pageUrl: 'https://other.example.com/',
      viewport: VIEWPORT,
    });
    expect(foreign).toMatchObject({ ok: false, reason: 'page-mismatch' });
  });
});

describe('updateReviewComment', () => {
  it('edits text, category and priority and refreshes updatedAt', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());
    const added = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: 'First wording.',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    if (!added.ok) {
      throw new Error('comment setup failed');
    }

    const clock = new FixedClockAdapter('2026-09-18T10:15:00.000Z');
    const result = await updateReviewComment({ sessions: repository, clock }, {
      sessionId: 'session-1',
      commentId: added.comment.id,
      text: '  Second wording.  ',
      category: 'UX',
      priority: 'minor',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.comment).toMatchObject({
      id: added.comment.id,
      text: '  Second wording.  ',
      category: 'UX',
      priority: 'minor',
      createdAt: '2026-09-18T10:05:00.000Z',
      updatedAt: '2026-09-18T10:15:00.000Z',
    });
  });

  it('refuses blank text and unknown ids', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());
    const clock = new FixedClockAdapter('2026-09-18T10:15:00.000Z');
    const added = await addReviewComment(deps(repository), {
      sessionId: 'session-1',
      text: 'Real note.',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    if (!added.ok) {
      throw new Error('comment setup failed');
    }

    const blank = await updateReviewComment({ sessions: repository, clock }, {
      sessionId: 'session-1',
      commentId: added.comment.id,
      text: '   ',
      category: 'UI',
      priority: 'important',
    });
    expect(blank).toMatchObject({ ok: false, reason: 'invalid-comment', field: 'text' });

    const missingComment = await updateReviewComment({ sessions: repository, clock }, {
      sessionId: 'session-1',
      commentId: 'missing',
      text: 'Text',
      category: 'UI',
      priority: 'important',
    });
    expect(missingComment).toMatchObject({ ok: false, reason: 'comment-not-found' });

    const missingSession = await updateReviewComment({ sessions: repository, clock }, {
      sessionId: 'missing',
      commentId: 'comment-1',
      text: 'Text',
      category: 'UI',
      priority: 'important',
    });
    expect(missingSession).toMatchObject({ ok: false, reason: 'session-not-found' });
  });
});

describe('deleteReviewComment', () => {
  it('removes exactly one comment and keeps the others', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());
    const ids = new SequentialIdGeneratorAdapter('comment');
    const first = await addReviewComment(deps(repository, ids), {
      sessionId: 'session-1',
      text: 'First.',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    const second = await addReviewComment(deps(repository, ids), {
      sessionId: 'session-1',
      text: 'Second.',
      pageUrl: PAGE_URL,
      viewport: VIEWPORT,
    });
    if (!first.ok || !second.ok) {
      throw new Error('comment setup failed');
    }

    const result = await deleteReviewComment({ sessions: repository }, {
      sessionId: 'session-1',
      commentId: first.comment.id,
    });

    expect(result).toEqual({ ok: true, commentId: first.comment.id });
    const stored = await repository.findById('session-1');
    expect(stored?.comments.map((comment) => comment.id)).toEqual([second.comment.id]);
  });

  it('reports unknown sessions and comments', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession());

    const missingSession = await deleteReviewComment({ sessions: repository }, {
      sessionId: 'missing',
      commentId: 'comment-1',
    });
    expect(missingSession).toMatchObject({ ok: false, reason: 'session-not-found' });

    const missingComment = await deleteReviewComment({ sessions: repository }, {
      sessionId: 'session-1',
      commentId: 'comment-1',
    });
    expect(missingComment).toMatchObject({ ok: false, reason: 'comment-not-found' });
  });
});
