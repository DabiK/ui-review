// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAnchor } from '../../src/content/dom-anchor';
import { mountReviewOverlay } from '../../src/content/overlay';
import type {
  OverlaySaveResult,
  ReviewOverlayHandle,
  ReviewOverlayOptions,
} from '../../src/content/overlay';

const mounted: ReviewOverlayHandle[] = [];

function requireElement<T extends Element>(element: T | null, label: string): T {
  if (element === null) {
    throw new Error(`overlay element "${label}" not found`);
  }
  return element;
}

function mockRect(
  element: Element,
  box: { x: number; y: number; width: number; height: number },
): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
    toJSON: () => ({}),
  } as DOMRect);
}

function mountOverlay(result: OverlaySaveResult = { ok: true }) {
  const onCreateComment = vi
    .fn<ReviewOverlayOptions['onCreateComment']>()
    .mockResolvedValue(result);
  const onStopReview = vi.fn<() => void>();
  const overlay = mountReviewOverlay({ onCreateComment, onStopReview });
  mounted.push(overlay);

  const root = overlay.host.shadowRoot;
  if (root === null) {
    throw new Error('overlay shadow root missing');
  }

  return { overlay, root, onCreateComment, onStopReview };
}

function clickPageElement(element: Element): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const overlay of mounted.splice(0)) {
    overlay.unmount();
  }
  document.body.innerHTML = '';
});

describe('mountReviewOverlay', () => {
  it('mounts an isolated host with an accessible review badge', () => {
    const { overlay, root } = mountOverlay();

    expect(overlay.host.id).toBe('ui-review-overlay-host');
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.pointerEvents).toBe('none');
    expect(overlay.host.style.zIndex).toBe('2147483647');
    expect(document.getElementById('ui-review-overlay-host')).toBe(overlay.host);

    const exit = requireElement(
      root.querySelector<HTMLButtonElement>('[data-ui-review="exit"]'),
      'exit button',
    );
    expect(exit.textContent).toBe('Exit review mode');
    expect(root.textContent).toContain('Review mode');
    expect(root.textContent).toContain('Shift+Escape to stop');
  });

  it('stops the review when the badge button is clicked', () => {
    const { root, onStopReview } = mountOverlay();

    requireElement(root.querySelector<HTMLButtonElement>('[data-ui-review="exit"]'), 'exit').click();

    expect(onStopReview).toHaveBeenCalledTimes(1);
  });

  it('highlights the hovered page element and hides off the page chrome', () => {
    const { root } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);
    mockRect(button, { x: 10, y: 20, width: 100, height: 40 });

    const highlight = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="highlight"]'),
      'highlight',
    );
    expect(highlight.hidden).toBe(true);

    button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));

    expect(highlight.hidden).toBe(false);
    expect(highlight.style.left).toBe('10px');
    expect(highlight.style.top).toBe('20px');
    expect(highlight.style.width).toBe('100px');
    expect(highlight.style.height).toBe('40px');

    document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
    expect(highlight.hidden).toBe(true);
  });

  it('opens the composer on click and refuses to save blank text', () => {
    const { root, onCreateComment } = mountOverlay();
    const button = document.createElement('button');
    button.textContent = 'Book a demo';
    document.body.appendChild(button);

    const event = clickPageElement(button);

    expect(event.defaultPrevented).toBe(true);

    const composer = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="composer"]'),
      'composer',
    );
    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    const selects = root.querySelectorAll('select');
    const save = requireElement(
      root.querySelector<HTMLButtonElement>('[data-ui-review="save"]'),
      'save button',
    );

    expect(composer.hidden).toBe(false);
    expect(textarea.getAttribute('aria-label')).toBe('Review note');
    expect(selects).toHaveLength(2);
    expect(save.textContent).toBe('Save note');

    save.click();

    expect(onCreateComment).not.toHaveBeenCalled();
    const error = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="error"]'),
      'error message',
    );
    expect(error.hidden).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
  });

  it('saves a trimmed note with default category and priority, then closes', async () => {
    const { root, onCreateComment } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);
    clickPageElement(button);

    const composer = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="composer"]'),
      'composer',
    );
    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    textarea.value = '  Fix the contrast  ';
    requireElement(root.querySelector<HTMLButtonElement>('[data-ui-review="save"]'), 'save').click();

    await vi.waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledTimes(1);
    });

    const firstCall = onCreateComment.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error('onCreateComment was not called');
    }
    const draft = firstCall[0];

    expect(draft.text).toBe('Fix the contrast');
    expect(draft.category).toBe('UI');
    expect(draft.priority).toBe('important');
    expect(resolveAnchor(draft.anchor.fingerprint)).toBe(button);
    await vi.waitFor(() => {
      expect(composer.hidden).toBe(true);
    });
    expect(textarea.value).toBe('');
  });

  it('hides the overlay chrome while the screenshot capture runs', async () => {
    const { overlay, root, onCreateComment } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);
    clickPageElement(button);

    let resolveSave: (result: OverlaySaveResult) => void = () => undefined;
    onCreateComment.mockImplementation(
      () =>
        new Promise<OverlaySaveResult>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    textarea.value = 'Keep the page clean';
    requireElement(root.querySelector<HTMLButtonElement>('[data-ui-review="save"]'), 'save').click();

    await vi.waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(overlay.host.style.visibility).toBe('hidden');
    });

    resolveSave({ ok: true });

    await vi.waitFor(() => {
      expect(overlay.host.style.visibility).toBe('');
    });
  });

  it('submits with Ctrl+Enter', async () => {
    const { root, onCreateComment } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);
    clickPageElement(button);

    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    textarea.value = 'Keyboard first';
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the composer open and shows the error when saving fails', async () => {
    const { root, onCreateComment } = mountOverlay({
      ok: false,
      message: 'Storage unavailable.',
    });
    const button = document.createElement('button');
    document.body.appendChild(button);
    clickPageElement(button);

    const composer = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="composer"]'),
      'composer',
    );
    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    const save = requireElement(
      root.querySelector<HTMLButtonElement>('[data-ui-review="save"]'),
      'save',
    );
    textarea.value = 'Keep me';
    save.click();

    await vi.waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledTimes(1);
    });

    const error = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="error"]'),
      'error message',
    );
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Storage unavailable.');
    expect(composer.hidden).toBe(false);
    expect(textarea.value).toBe('Keep me');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('Save note');
  });

  it('closes with Escape and stops the review with Shift+Escape', () => {
    const { root, onStopReview } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);
    clickPageElement(button);

    const composer = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="composer"]'),
      'composer',
    );

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(composer.hidden).toBe(true);
    expect(onStopReview).not.toHaveBeenCalled();

    const idleEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(idleEscape);
    expect(idleEscape.defaultPrevented).toBe(false);
    expect(onStopReview).not.toHaveBeenCalled();

    const stop = new KeyboardEvent('keydown', {
      key: 'Escape',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(stop);
    expect(onStopReview).toHaveBeenCalledTimes(1);
  });

  it('renders numbered pins for resolvable anchors and skips unknown ones', () => {
    const { overlay, root } = mountOverlay();
    const target = document.createElement('button');
    target.id = 'pinned-target';
    document.body.appendChild(target);
    mockRect(target, { x: 12, y: 24, width: 80, height: 30 });

    overlay.setPins([
      { id: 'comment-1', index: 1, fingerprint: '#pinned-target' },
      { id: 'comment-2', index: 2, fingerprint: '#missing-target' },
    ]);

    const pins = root.querySelectorAll<HTMLElement>('[data-ui-review="pin"]');
    expect(pins).toHaveLength(1);
    expect(pins[0]?.textContent).toBe('01');
    expect(pins[0]?.style.left).toBe('12px');
    expect(pins[0]?.style.top).toBe('24px');
    expect(pins[0]?.style.pointerEvents).toBe('');

    overlay.setPins([{ id: 'comment-3', index: 3, fingerprint: '#pinned-target' }]);

    const replaced = root.querySelectorAll<HTMLElement>('[data-ui-review="pin"]');
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.textContent).toBe('03');
  });

  it('annotates an element rendered after the overlay is mounted', async () => {
    const { root, onCreateComment } = mountOverlay();
    const container = document.createElement('div');
    document.body.appendChild(container);

    // Simulates a client-rendered page: the element appears after the overlay mounted.
    await Promise.resolve();
    const dynamicButton = document.createElement('button');
    dynamicButton.textContent = 'Client rendered';
    container.appendChild(dynamicButton);
    mockRect(dynamicButton, { x: 30, y: 40, width: 120, height: 36 });

    dynamicButton.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
    const highlight = requireElement(
      root.querySelector<HTMLElement>('[data-ui-review="highlight"]'),
      'highlight',
    );
    expect(highlight.hidden).toBe(false);
    expect(highlight.style.left).toBe('30px');

    clickPageElement(dynamicButton);
    const textarea = requireElement(root.querySelector('textarea'), 'textarea');
    textarea.value = 'Rendered late';
    requireElement(root.querySelector<HTMLButtonElement>('[data-ui-review="save"]'), 'save').click();

    await vi.waitFor(() => {
      expect(onCreateComment).toHaveBeenCalledTimes(1);
    });

    const firstCall = onCreateComment.mock.calls[0];
    if (firstCall === undefined) {
      throw new Error('onCreateComment was not called');
    }
    expect(resolveAnchor(firstCall[0].anchor.fingerprint)).toBe(dynamicButton);
  });

  it('removes the host, stops listening and supports a double unmount', () => {
    const { overlay, root, onCreateComment } = mountOverlay();
    const button = document.createElement('button');
    document.body.appendChild(button);

    overlay.unmount();

    expect(document.getElementById('ui-review-overlay-host')).toBeNull();
    expect(overlay.host.isConnected).toBe(false);
    expect(root.querySelector('[data-ui-review="composer"]')).not.toBeNull();
    expect(() => overlay.unmount()).not.toThrow();

    const event = clickPageElement(button);
    expect(event.defaultPrevented).toBe(false);
    expect(onCreateComment).not.toHaveBeenCalled();
  });
});
