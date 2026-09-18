import { describe, expect, it } from 'vitest';
import {
  clearReviewSession,
  renameReviewSession,
  startReviewSession,
  stopReviewSession,
} from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';

const STARTED_AT = '2026-09-18T10:00:00.000Z';
const PAGE = { url: 'https://example.com/pricing', title: 'Pricing' };

function createHarness(page: { url: string; title: string } | null = PAGE) {
  const sessions = new InMemoryReviewSessionRepository();
  const pages = new StaticActivePageAdapter(page);
  const clock = new FixedClockAdapter(STARTED_AT);
  const ids = new SequentialIdGeneratorAdapter('session');

  return { sessions, pages, clock, ids };
}

describe('startReviewSession', () => {
  it('creates, names and persists an active session for the current page', async () => {
    const harness = createHarness();

    const result = await startReviewSession(harness);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected the review to start');
    }
    expect(result.session).toEqual({
      id: 'session-1',
      name: 'example.com — 18 Sep 2026, 10:00',
      status: 'active',
      pageUrl: PAGE.url,
      hostname: 'example.com',
      startedAt: STARTED_AT,
      stoppedAt: null,
      comments: [],
    });
    expect(await harness.sessions.list()).toEqual([result.session]);
  });

  it('starts nothing without an active page', async () => {
    const harness = createHarness(null);

    const result = await startReviewSession(harness);

    expect(result).toEqual({ ok: false, reason: 'no-active-page' });
    expect(await harness.sessions.list()).toEqual([]);
  });

  it('starts nothing on a page that cannot be inspected', async () => {
    const harness = createHarness({ url: 'chrome://extensions', title: 'Extensions' });

    const result = await startReviewSession(harness);

    expect(result).toEqual({
      ok: false,
      reason: 'ineligible-page',
      pageUrl: 'chrome://extensions',
    });
    expect(await harness.sessions.list()).toEqual([]);
  });

  it('refuses a second active session for the same page', async () => {
    const harness = createHarness();
    const first = await startReviewSession(harness);

    const second = await startReviewSession(harness);

    expect(second.ok).toBe(false);
    if (second.ok) {
      throw new Error('expected the second start to be refused');
    }
    expect(second.reason).toBe('session-already-active');
    expect(await harness.sessions.list()).toHaveLength(1);
    expect(first.ok).toBe(true);
  });

  it('allows a new session once the previous one is stopped', async () => {
    const harness = createHarness();
    const first = await startReviewSession(harness);
    if (!first.ok) {
      throw new Error('expected the review to start');
    }
    harness.clock.set('2026-09-18T10:30:00.000Z');
    await stopReviewSession(harness, { sessionId: first.session.id });

    const second = await startReviewSession(harness);

    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error('expected a new review to start');
    }
    expect(second.session.id).toBe('session-2');
    expect(second.session.status).toBe('active');
    expect(await harness.sessions.list()).toHaveLength(2);
  });
});

describe('stopReviewSession', () => {
  it('persists the stopped state and timestamp', async () => {
    const harness = createHarness();
    const started = await startReviewSession(harness);
    if (!started.ok) {
      throw new Error('expected the review to start');
    }
    harness.clock.set('2026-09-18T10:30:00.000Z');

    const result = await stopReviewSession(harness, { sessionId: started.session.id });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected the review to stop');
    }
    expect(result.session.status).toBe('stopped');
    expect(result.session.stoppedAt).toBe('2026-09-18T10:30:00.000Z');
    expect(await harness.sessions.findById(started.session.id)).toEqual(result.session);
  });

  it('reports an unknown session without writing anything', async () => {
    const harness = createHarness();

    const result = await stopReviewSession(harness, { sessionId: 'missing' });

    expect(result).toEqual({ ok: false, reason: 'session-not-found', sessionId: 'missing' });
    expect(await harness.sessions.list()).toEqual([]);
  });

  it('refuses to stop an already stopped session', async () => {
    const harness = createHarness();
    const started = await startReviewSession(harness);
    if (!started.ok) {
      throw new Error('expected the review to start');
    }
    harness.clock.set('2026-09-18T10:30:00.000Z');
    await stopReviewSession(harness, { sessionId: started.session.id });

    const again = await stopReviewSession(harness, { sessionId: started.session.id });

    expect(again.ok).toBe(false);
    if (again.ok) {
      throw new Error('expected the second stop to be refused');
    }
    expect(again.reason).toBe('session-already-stopped');
  });
});

describe('renameReviewSession', () => {
  it('trims the new name and persists it', async () => {
    const harness = createHarness();
    const started = await startReviewSession(harness);
    if (!started.ok) {
      throw new Error('expected the review to start');
    }

    const result = await renameReviewSession(harness, {
      sessionId: started.session.id,
      name: '  Pricing page review  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected the rename to succeed');
    }
    expect(result.session.name).toBe('Pricing page review');
    expect((await harness.sessions.findById(started.session.id))?.name).toBe('Pricing page review');
  });

  it('refuses a blank name and leaves the stored session untouched', async () => {
    const harness = createHarness();
    const started = await startReviewSession(harness);
    if (!started.ok) {
      throw new Error('expected the review to start');
    }

    const result = await renameReviewSession(harness, {
      sessionId: started.session.id,
      name: '   ',
    });

    expect(result).toEqual({ ok: false, reason: 'invalid-name' });
    expect((await harness.sessions.findById(started.session.id))?.name).toBe(started.session.name);
  });

  it('reports an unknown session', async () => {
    const harness = createHarness();

    const result = await renameReviewSession(harness, { sessionId: 'missing', name: 'New name' });

    expect(result).toEqual({ ok: false, reason: 'session-not-found', sessionId: 'missing' });
  });
});

describe('clearReviewSession', () => {
  it('deletes only the requested session and its records', async () => {
    const harness = createHarness();
    const first = await startReviewSession(harness);
    if (!first.ok) {
      throw new Error('expected the review to start');
    }
    harness.pages.setPage({ url: 'https://other.example.com/', title: 'Other' });
    const second = await startReviewSession(harness);
    if (!second.ok) {
      throw new Error('expected the other review to start');
    }
    expect(await harness.sessions.list()).toHaveLength(2);

    const result = await clearReviewSession(harness, { sessionId: first.session.id });

    expect(result).toEqual({ ok: true, sessionId: first.session.id });
    expect(await harness.sessions.findById(first.session.id)).toBeNull();
    expect(await harness.sessions.findById(second.session.id)).toEqual(second.session);
  });

  it('reports an unknown session without deleting anything', async () => {
    const harness = createHarness();

    const result = await clearReviewSession(harness, { sessionId: 'missing' });

    expect(result).toEqual({ ok: false, reason: 'session-not-found', sessionId: 'missing' });
  });
});
