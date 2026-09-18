// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContainer } from '@app';
import type { CommentSummary, SessionSummary } from '@core';

const harness = vi.hoisted(() => {
  const session: SessionSummary = {
    id: 'session-1',
    name: 'app.example.com — 18 Sep 2026, 10:00',
    status: 'active',
    pageUrl: 'https://app.example.com/#/route',
    hostname: 'app.example.com',
    startedAt: '2026-09-18T10:00:00.000Z',
    stoppedAt: null,
    commentCount: 2,
  };

  const comment: CommentSummary = {
    id: 'comment-1',
    text: 'The save action is not aligned with the title.',
    category: 'UI',
    priority: 'important',
    createdAt: '2026-09-18T10:05:00.000Z',
    updatedAt: '2026-09-18T10:05:00.000Z',
    anchorLabel: 'Save',
    attachments: [
      {
        id: 'attachment-crop',
        kind: 'element-crop',
        mimeType: 'image/png',
        width: 100,
        height: 32,
        byteLength: 512,
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      },
    ],
    visualEvidence: {
      confidence: 'inferred',
      viewport: 'failed',
      elementCrop: 'captured',
      reason: 'The visible page could not be captured.',
    },
  };

  const clearedSessions: string[] = [];
  const syncedPages: string[] = [];
  const deletedAttachments: {
    sessionId: string;
    commentId: string;
    attachmentId: string;
  }[] = [];
  let cleared = false;

  const container: AppContainer = {
    loadReviewPanel: async () => ({
      extensionName: 'UI Review',
      extensionVersion: '0.1.0',
      runtimeLabel: 'Chrome MV3 side panel',
      storage: {
        kind: 'indexeddb',
        persistent: true,
        label: 'IndexedDB (this browser profile)',
      },
      activePage: { url: session.pageUrl, title: 'App', hostname: session.hostname, eligible: true },
      currentSession: cleared ? null : session,
      selectedSession: cleared ? null : session,
      comments: cleared ? [] : [comment],
      sessions: cleared ? [] : [session],
    }),
    startReviewSession: async () => ({ ok: false, reason: 'no-active-page' }),
    stopReviewSession: async () => ({
      ok: false,
      reason: 'session-not-found',
      sessionId: 'session-1',
    }),
    renameReviewSession: async () => ({
      ok: false,
      reason: 'session-not-found',
      sessionId: 'session-1',
    }),
    clearReviewSession: async (sessionId) => {
      clearedSessions.push(sessionId);
      cleared = true;
      return { ok: true, sessionId };
    },
    loadOverlayState: async () => ({ active: false, sessionId: null, comments: [] }),
    addReviewComment: async () => ({
      ok: false,
      reason: 'session-not-found',
      sessionId: 'session-1',
    }),
    captureCommentEvidence: async () => ({
      ok: false,
      reason: 'comment-not-found',
      commentId: 'comment-1',
    }),
    updateReviewComment: async () => ({
      ok: false,
      reason: 'session-not-found',
      sessionId: 'session-1',
    }),
    deleteReviewComment: async () => ({
      ok: false,
      reason: 'session-not-found',
      sessionId: 'session-1',
    }),
    deleteReviewCommentAttachment: async (input) => {
      deletedAttachments.push(input);
      return {
        ok: false,
        reason: 'attachment-not-found',
        attachmentId: input.attachmentId,
      };
    },
    checkLocalBridge: async () => ({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The bridge is not part of this UI test.',
      code: null,
    }),
    storeSessionArtifact: async () => ({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The bridge is not part of this UI test.',
      code: null,
    }),
    readSessionArtifact: async () => ({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The bridge is not part of this UI test.',
      code: null,
    }),
    notifyPanelChanged: () => undefined,
    syncPageOverlay: (pageUrl) => {
      syncedPages.push(pageUrl);
    },
    subscribeToReviewChanges: () => () => undefined,
  };

  return { container, comment, clearedSessions, syncedPages, deletedAttachments, reset: () => {
    cleared = false;
    clearedSessions.length = 0;
    syncedPages.length = 0;
    deletedAttachments.length = 0;
  } };
});

vi.mock('@app', () => ({ createAppContainer: () => harness.container }));

function findButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`button "${label}" not found`);
  }
  return button;
}

describe('side panel review actions', () => {
  beforeEach(() => {
    vi.resetModules();
    harness.reset();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('unmounts the page overlay of an active session after a confirmed clear', async () => {
    await import('../../src/sidepanel/main');
    await vi.waitFor(() => {
      expect(document.querySelector('#session-name-input')).not.toBeNull();
    });

    findButton('Clear session').click();
    findButton('Delete session permanently').click();

    await vi.waitFor(() => {
      expect(harness.clearedSessions).toEqual(['session-1']);
      expect(harness.syncedPages).toEqual(['https://app.example.com/#/route']);
    });
  });

  it('deletes one screenshot attachment through the panel confirmation', async () => {
    await import('../../src/sidepanel/main');
    await vi.waitFor(() => {
      expect(document.querySelector('.figure')).not.toBeNull();
    });

    expect(document.body.textContent).toContain('Fig. 2 · Element crop');
    expect(document.body.textContent).toContain(
      'Viewport screenshot unavailable — The visible page could not be captured.',
    );

    findButton('Remove element crop').click();
    findButton('Delete screenshot permanently').click();

    await vi.waitFor(() => {
      expect(harness.deletedAttachments).toEqual([
        { sessionId: 'session-1', commentId: 'comment-1', attachmentId: 'attachment-crop' },
      ]);
    });
  });
});
