import { describe, expect, it } from 'vitest';
import {
  createDomEvidence,
  createReviewComment,
  createReviewSession,
  loadReviewPanel,
  type Evidence,
  type ReviewComment,
  type ReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { StaticRuntimeInfoAdapter } from '@adapters/runtime/static-runtime-info';

const runtimeInfo = new StaticRuntimeInfoAdapter({
  extensionName: 'UI Review',
  extensionVersion: '0.1.0',
  runtimeLabel: 'Chrome MV3 side panel',
});

const PAGE = { url: 'https://example.com/pricing', title: 'Pricing' };

function makeSession(id: string, options: { pageUrl?: string; startedAt?: string } = {}) {
  return createReviewSession({
    id,
    name: `${id} — 18 Sep 2026`,
    pageUrl: options.pageUrl ?? PAGE.url,
    startedAt: options.startedAt ?? '2026-09-18T10:00:00.000Z',
  });
}

function makeComment(session: ReviewSession): ReviewComment {
  return createReviewComment({
    id: 'comment-1',
    sessionId: session.id,
    text: 'The primary action is not aligned with the title.',
    pageUrl: session.pageUrl,
    viewport: { width: 1440, height: 900 },
    createdAt: '2026-09-18T10:05:00.000Z',
  });
}

function makeDomEvidence(): Evidence {
  return createDomEvidence({
    id: 'evidence-1',
    commentId: 'comment-1',
    capturedAt: '2026-09-18T10:05:00.000Z',
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
  });
}

function deps(repository: InMemoryReviewSessionRepository, page = PAGE) {
  return { sessions: repository, pages: new StaticActivePageAdapter(page), runtimeInfo };
}

describe('loadReviewPanel', () => {
  it('reports an empty workspace and an eligible current page', async () => {
    const repository = new InMemoryReviewSessionRepository();

    const panel = await loadReviewPanel(deps(repository));

    expect(panel).toEqual({
      extensionName: 'UI Review',
      extensionVersion: '0.1.0',
      runtimeLabel: 'Chrome MV3 side panel',
      storage: {
        kind: 'in-memory',
        persistent: false,
        label: 'In-memory (ephemeral)',
      },
      activePage: {
        url: PAGE.url,
        title: 'Pricing',
        hostname: 'example.com',
        eligible: true,
      },
      currentSession: null,
      selectedSession: null,
      comments: [],
      sessions: [],
    });
  });

  it('restores the active session of the current page', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = makeSession('session-1');
    await repository.save(session);

    const panel = await loadReviewPanel(deps(repository));

    expect(panel.currentSession).toEqual({
      id: 'session-1',
      name: 'session-1 — 18 Sep 2026',
      status: 'active',
      pageUrl: PAGE.url,
      hostname: 'example.com',
      startedAt: '2026-09-18T10:00:00.000Z',
      stoppedAt: null,
      commentCount: 0,
    });
    expect(panel.sessions).toEqual([panel.currentSession]);
  });

  it('prefers the active session over a newer stopped one for the current page', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const active = makeSession('session-active', { startedAt: '2026-09-18T09:00:00.000Z' });
    const stopped = {
      ...makeSession('session-stopped', { startedAt: '2026-09-18T11:00:00.000Z' }),
      status: 'stopped' as const,
      stoppedAt: '2026-09-18T11:30:00.000Z',
    };
    await repository.save(active);
    await repository.save(stopped);

    const panel = await loadReviewPanel(deps(repository));

    expect(panel.currentSession?.id).toBe('session-active');
    expect(panel.sessions.map((session) => session.id)).toEqual([
      'session-stopped',
      'session-active',
    ]);
  });

  it('counts the notes attached to each session', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = makeSession('session-1');
    await repository.save({ ...session, comments: [makeComment(session)] });

    const panel = await loadReviewPanel(deps(repository));

    expect(panel.currentSession?.commentCount).toBe(1);
  });

  it('keeps sessions from other pages in the stored list', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const current = makeSession('session-current');
    const elsewhere = makeSession('session-elsewhere', { pageUrl: 'https://other.example.com/' });
    await repository.save(current);
    await repository.save(elsewhere);

    const panel = await loadReviewPanel(deps(repository));

    expect(panel.currentSession?.id).toBe('session-current');
    expect(panel.sessions.map((session) => session.id).sort()).toEqual([
      'session-current',
      'session-elsewhere',
    ]);
  });

  it('marks non-http pages as ineligible', async () => {
    const repository = new InMemoryReviewSessionRepository();

    const panel = await loadReviewPanel(
      deps(repository, { url: 'chrome://extensions', title: 'Extensions' }),
    );

    expect(panel.activePage).toMatchObject({ eligible: false, url: 'chrome://extensions' });
    expect(panel.currentSession).toBeNull();
  });

  it('handles a host without an active page', async () => {
    const repository = new InMemoryReviewSessionRepository();

    const panel = await loadReviewPanel({ ...deps(repository), pages: new StaticActivePageAdapter(null) });

    expect(panel.activePage).toBeNull();
    expect(panel.currentSession).toBeNull();
  });

  it('returns the comments of the selected session with their anchor label', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = makeSession('session-1');
    const comment = { ...makeComment(session), evidence: [makeDomEvidence()] };
    await repository.save({ ...session, comments: [comment] });

    const panel = await loadReviewPanel(deps(repository), { selectedSessionId: 'session-1' });

    expect(panel.selectedSession?.id).toBe('session-1');
    expect(panel.comments).toEqual([
      {
        id: 'comment-1',
        text: 'The primary action is not aligned with the title.',
        category: 'UI',
        priority: 'important',
        createdAt: '2026-09-18T10:05:00.000Z',
        updatedAt: '2026-09-18T10:05:00.000Z',
        anchorLabel: 'Save',
        attachments: [],
        visualEvidence: null,
      },
    ]);
  });

  it('selects another stored session and exposes its own comments', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const first = makeSession('session-1');
    const second = makeSession('session-2', { startedAt: '2026-09-18T11:00:00.000Z' });
    await repository.save({ ...first, comments: [makeComment(first)] });
    await repository.save(second);

    const panel = await loadReviewPanel(deps(repository), { selectedSessionId: 'session-2' });

    expect(panel.selectedSession?.id).toBe('session-2');
    expect(panel.comments).toEqual([]);
  });

  it('falls back to the current session when the requested selection disappeared', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession('session-1'));

    const panel = await loadReviewPanel(deps(repository), { selectedSessionId: 'missing' });

    expect(panel.selectedSession?.id).toBe('session-1');
  });
});
