// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bootstrap of the page overlay: the content script must stay completely inert until the
 * service worker confirms an explicitly active session for the page.
 */

function installChromeFake(state: unknown): { readonly sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(async () => state);
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };
  return { sendMessage };
}

function overlayHost(): HTMLElement | null {
  return document.getElementById('ui-review-overlay-host');
}

beforeEach(() => {
  vi.resetModules();
  document.body.replaceChildren();
  document.getElementById('ui-review-overlay-host')?.remove();
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('content script bootstrap', () => {
  it('mounts the overlay when the service worker reports an active session', async () => {
    installChromeFake({ active: true, sessionId: 'session-1', comments: [] });

    await import('../../src/content/index');

    await vi.waitFor(() => {
      expect(overlayHost()).not.toBeNull();
    });
  });

  it('injects nothing when no session is active', async () => {
    installChromeFake({ active: false, sessionId: null, comments: [] });

    await import('../../src/content/index');
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(overlayHost()).toBeNull();
  });

  it('ignores a malformed state response instead of injecting an overlay', async () => {
    installChromeFake({ active: 'yes' });

    await import('../../src/content/index');
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(overlayHost()).toBeNull();
  });
});
