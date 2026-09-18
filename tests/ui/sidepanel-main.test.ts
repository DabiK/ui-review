// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppContainer } from '@app';
import type { SessionSummary } from '@core';

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

  const clearedSessions: string[] = [];
  const syncedPages: string[] = [];
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
      comments: [],
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
    notifyPanelChanged: () => undefined,
    syncPageOverlay: (pageUrl) => {
      syncedPages.push(pageUrl);
    },
    subscribeToReviewChanges: () => () => undefined,
  };

  return { container, clearedSessions, syncedPages };
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

describe('side panel session lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('unmounts the page overlay of an active session after a confirmed clear', async () => {
    document.body.innerHTML = '<div id="app"></div>';

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
});
