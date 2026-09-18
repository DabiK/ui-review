// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { loadOverlayState, setReviewPaused, startReviewSession, stopReviewSession } from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { StaticActivePageAdapter } from '@adapters/runtime/static-active-page';
import { FixedClockAdapter } from '@adapters/runtime/fixed-clock';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';

it('releases page clicks while paused and restores annotation on resume', async () => {
  const pageUrl = window.location.href;
  const deps = {
    sessions: new InMemoryReviewSessionRepository(),
    pages: new StaticActivePageAdapter({ url: pageUrl, title: 'Test page' }),
    clock: new FixedClockAdapter('2026-09-18T10:00:00.000Z'),
    ids: new SequentialIdGeneratorAdapter('navigation'),
  };
  const started = await startReviewSession(deps);
  if (!started.ok) throw new Error('Expected an eligible test page');
  const listeners: ((message: unknown) => void)[] = [];
  vi.stubGlobal('chrome', { runtime: {
    sendMessage: async () => loadOverlayState(deps, { pageUrl }),
    onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener), removeListener: vi.fn() },
  } });
  const sync = () => listeners.forEach((listener) => listener({ type: 'ui-review:overlay-sync', pageUrl }));
  const target = document.createElement('button');
  target.textContent = 'Navigate';
  document.body.append(target);
  const click = () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    await import('../../src/content/index');
    await vi.waitFor(() => expect(document.getElementById('ui-review-overlay-host')).not.toBeNull());
    expect(click()).toBe(true);
    await setReviewPaused(deps, { sessionId: started.session.id, paused: true });
    sync();
    await vi.waitFor(() => expect(document.getElementById('ui-review-overlay-host')).toBeNull());
    expect(click()).toBe(false);
    await setReviewPaused(deps, { sessionId: started.session.id, paused: false });
    sync();
    await vi.waitFor(() => expect(document.getElementById('ui-review-overlay-host')).not.toBeNull());
    expect(click()).toBe(true);
  } finally {
    await stopReviewSession(deps, { sessionId: started.session.id });
    sync();
    await vi.waitFor(() => expect(document.getElementById('ui-review-overlay-host')).toBeNull());
    target.remove();
    vi.unstubAllGlobals();
  }
});
