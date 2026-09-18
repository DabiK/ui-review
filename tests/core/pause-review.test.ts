import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addReviewComment, loadOverlayState, setReviewPaused, startReviewSession, stopReviewSession } from '@core';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';

for (const kind of ['memory', 'indexeddb'] as const) {
  describe(`pause/resume through ${kind}`, () => {
    it('keeps the same review, notes and URL across pause, navigation, reload and resume', async () => {
      const databaseName = `pause-${kind}`;
      const sessions = kind === 'memory' ? new InMemoryReviewSessionRepository() : new IndexedDbReviewSessionRepository({ databaseName });
      const pageUrl = 'https://example.com/pricing?plan=team#details';
      const pages = new StaticActivePageAdapter({ url: pageUrl, title: 'Pricing' });
      const deps = { sessions, pages, clock: new FixedClockAdapter('2026-09-18T10:00:00.000Z'), ids: new SequentialIdGeneratorAdapter('pause') };
      const started = await startReviewSession(deps);
      if (!started.ok) throw new Error('Start failed');
      const input = { sessionId: started.session.id, text: 'Clarify pricing', pageUrl, viewport: { width: 800, height: 600 } };
      expect((await addReviewComment(deps, input)).ok).toBe(true);
      expect((await setReviewPaused(deps, { sessionId: input.sessionId, paused: true })).ok).toBe(true);
      const reloaded = kind === 'memory' ? sessions : new IndexedDbReviewSessionRepository({ databaseName });
      expect(await loadOverlayState({ sessions: reloaded }, { pageUrl })).toEqual({ active: false, sessionId: null, comments: [] });
      expect(await reloaded.findById(input.sessionId)).toMatchObject({ annotationPaused: true, status: 'active', stoppedAt: null, pageUrl, comments: [{ text: input.text }] });
      expect((await addReviewComment(deps, input)).ok).toBe(false);
      expect(await startReviewSession(deps)).toMatchObject({ ok: false, reason: 'session-already-active' });
      pages.setPage({ url: 'https://example.com/contact', title: 'Contact' });
      expect(await setReviewPaused({ ...deps, sessions: reloaded }, { sessionId: input.sessionId, paused: false })).toMatchObject({ ok: false, reason: 'page-mismatch' });
      pages.setPage({ url: pageUrl, title: 'Pricing' });
      expect((await setReviewPaused({ ...deps, sessions: reloaded }, { sessionId: input.sessionId, paused: false })).ok).toBe(true);
      expect(await loadOverlayState({ sessions: reloaded }, { pageUrl })).toMatchObject({ active: true, sessionId: input.sessionId, comments: [{ text: input.text }] });
      expect(await reloaded.list()).toHaveLength(1);
      await stopReviewSession(deps, { sessionId: input.sessionId });
      expect(await setReviewPaused(deps, { sessionId: input.sessionId, paused: false })).toMatchObject({ ok: false, reason: 'session-stopped' });
      expect(await setReviewPaused(deps, { sessionId: 'missing', paused: true })).toMatchObject({ ok: false, reason: 'session-not-found' });
    });
  });
}
