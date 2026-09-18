import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadReviewPanel, startReviewSession, stopReviewSession } from '@core';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { StaticRuntimeInfoAdapter } from '@adapters/runtime/static-runtime-info';

const PAGE = { url: 'https://example.com/pricing', title: 'Pricing' };
const STARTED_AT = '2026-09-18T10:00:00.000Z';

const runtimeInfo = new StaticRuntimeInfoAdapter({
  extensionName: 'UI Review',
  extensionVersion: '0.1.0',
  runtimeLabel: 'Chrome MV3 side panel',
});

/**
 * Verification for acceptance criterion "closing/reopening the side panel or reloading the
 * page preserves the active session": every step uses fresh adapter instances, so nothing
 * can be kept in memory between the writes and the reload.
 */
describe('session persistence across reloads', () => {
  it('restores an active session and its name from IndexedDB', async () => {
    const databaseName = 'ui-review-resume-active';
    const started = await startReviewSession({
      sessions: new IndexedDbReviewSessionRepository({ databaseName }),
      pages: new StaticActivePageAdapter(PAGE),
      clock: new FixedClockAdapter(STARTED_AT),
      ids: new SequentialIdGeneratorAdapter('session'),
    });
    expect(started.ok).toBe(true);

    const panel = await loadReviewPanel({
      sessions: new IndexedDbReviewSessionRepository({ databaseName }),
      pages: new StaticActivePageAdapter(PAGE),
      runtimeInfo,
    });

    expect(panel.currentSession).toMatchObject({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026, 10:00',
      status: 'active',
      stoppedAt: null,
    });
    expect(panel.storage).toEqual({
      kind: 'indexeddb',
      persistent: true,
      label: 'IndexedDB (this browser profile)',
    });
  });

  it('restores a stopped session with its final state', async () => {
    const databaseName = 'ui-review-resume-stopped';
    const sessionRepository = new IndexedDbReviewSessionRepository({ databaseName });
    const clock = new FixedClockAdapter(STARTED_AT);
    const startDeps = {
      sessions: sessionRepository,
      pages: new StaticActivePageAdapter(PAGE),
      clock,
      ids: new SequentialIdGeneratorAdapter('session'),
    };

    const started = await startReviewSession(startDeps);
    if (!started.ok) {
      throw new Error('expected the review to start');
    }
    clock.set('2026-09-18T10:30:00.000Z');
    const stopped = await stopReviewSession(startDeps, { sessionId: started.session.id });
    expect(stopped.ok).toBe(true);

    const panel = await loadReviewPanel({
      sessions: new IndexedDbReviewSessionRepository({ databaseName }),
      pages: new StaticActivePageAdapter(PAGE),
      runtimeInfo,
    });

    expect(panel.currentSession).toMatchObject({
      id: 'session-1',
      status: 'stopped',
      stoppedAt: '2026-09-18T10:30:00.000Z',
      name: 'example.com — 18 Sep 2026, 10:00',
    });
  });
});
