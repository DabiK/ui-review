import { describe, expect, it } from 'vitest';
import {
  createDomEvidence,
  createReviewComment,
  createReviewSession,
  loadOverlayState,
  type ReviewComment,
  type ReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';

const PAGE_URL = 'https://example.com/pricing';
const VIEWPORT = { width: 1440, height: 900 };

function makeSession(): ReviewSession {
  return createReviewSession({
    id: 'session-1',
    name: 'example.com — 18 Sep 2026, 10:00',
    pageUrl: PAGE_URL,
    startedAt: '2026-09-18T10:00:00.000Z',
  });
}

function makeComment(session: ReviewSession, id: string, withAnchor: boolean): ReviewComment {
  return createReviewComment({
    id,
    sessionId: session.id,
    text: `Note ${id}`,
    pageUrl: PAGE_URL,
    viewport: VIEWPORT,
    createdAt: '2026-09-18T10:05:00.000Z',
    evidence: withAnchor
      ? [
          createDomEvidence({
            id: `${id}-evidence`,
            commentId: id,
            capturedAt: '2026-09-18T10:05:00.000Z',
            anchor: {
              fingerprint: `main > button:nth-of-type(${id})`,
              ancestry: ['main'],
              text: 'Save',
              role: 'button',
              accessibleName: null,
              attributes: {},
              boundingBox: { x: 10, y: 20, width: 100, height: 32 },
              viewport: VIEWPORT,
              computedStyles: {},
            },
          }),
        ]
      : [],
  });
}

describe('loadOverlayState', () => {
  it('reports no overlay when nothing is active for the page', async () => {
    const repository = new InMemoryReviewSessionRepository();

    const state = await loadOverlayState({ sessions: repository }, { pageUrl: PAGE_URL });

    expect(state).toEqual({ active: false, sessionId: null, comments: [] });
  });

  it('returns the active session comments with their 1-based index and anchor', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = makeSession();
    const anchored = makeComment(session, '1', true);
    const loose = makeComment(session, '2', false);
    await repository.save({ ...session, comments: [anchored, loose] });

    const state = await loadOverlayState({ sessions: repository }, { pageUrl: PAGE_URL });

    expect(state.active).toBe(true);
    expect(state.sessionId).toBe('session-1');
    expect(state.comments).toEqual([
      {
        id: '1',
        index: 1,
        text: 'Note 1',
        category: 'UI',
        priority: 'important',
        anchor: {
          fingerprint: 'main > button:nth-of-type(1)',
          ancestry: ['main'],
          text: 'Save',
          role: 'button',
          boundingBox: { x: 10, y: 20, width: 100, height: 32 },
          viewport: VIEWPORT,
        },
      },
      {
        id: '2',
        index: 2,
        text: 'Note 2',
        category: 'UI',
        priority: 'important',
        anchor: null,
      },
    ]);
  });

  it('ignores stopped sessions and sessions from another page', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const stopped = {
      ...makeSession(),
      status: 'stopped' as const,
      stoppedAt: '2026-09-18T10:30:00.000Z',
    };
    await repository.save(stopped);
    await repository.save(
      createReviewSession({
        id: 'session-other',
        name: 'other — 18 Sep 2026',
        pageUrl: 'https://other.example.com/',
        startedAt: '2026-09-18T09:00:00.000Z',
      }),
    );

    const state = await loadOverlayState({ sessions: repository }, { pageUrl: PAGE_URL });

    expect(state.active).toBe(false);
  });
});
