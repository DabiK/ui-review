// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ActivePageSummary, ReviewPanelState, SessionSummary } from '@core';
import {
  renderReviewPanel,
  renderReviewPanelError,
} from '../../src/sidepanel/review-panel-view';

const eligiblePage: ActivePageSummary = {
  url: 'https://example.com/pricing',
  title: 'Pricing',
  hostname: 'example.com',
  eligible: true,
};

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1',
    name: 'example.com — 18 Sep 2026, 10:00',
    status: 'active',
    pageUrl: 'https://example.com/pricing',
    hostname: 'example.com',
    startedAt: '2026-09-18T10:00:00.000Z',
    stoppedAt: null,
    commentCount: 0,
    ...overrides,
  };
}

function makePanel(overrides: Partial<ReviewPanelState> = {}): ReviewPanelState {
  return {
    extensionName: 'UI Review',
    extensionVersion: '0.1.0',
    runtimeLabel: 'Chrome MV3 side panel',
    storage: {
      kind: 'indexeddb',
      persistent: true,
      label: 'IndexedDB (this browser profile)',
    },
    activePage: eligiblePage,
    currentSession: null,
    sessions: [],
    ...overrides,
  };
}

function findButton(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`button "${label}" not found`);
  }
  return button;
}

describe('renderReviewPanel', () => {
  it('renders the empty state with an explicit start action', () => {
    const root = document.createElement('div');
    const onStartReview = vi.fn();

    renderReviewPanel(root, makePanel(), { onStartReview });

    expect(root.querySelector('h1')?.textContent).toBe('UI Review');
    expect(root.textContent).toContain('v0.1.0');
    expect(root.textContent).toContain('No sessions stored yet.');
    expect(root.textContent).toContain('No session selected.');

    const start = findButton(root, 'Start review');
    expect(start.disabled).toBe(false);
    start.click();
    expect(onStartReview).toHaveBeenCalledTimes(1);
  });

  it('renders the active state with stop, rename and clear controls', () => {
    const root = document.createElement('div');
    const onStopReview = vi.fn();
    const session = makeSession();

    renderReviewPanel(root, makePanel({ currentSession: session, sessions: [session] }), {
      onStopReview,
    });

    expect(root.textContent).toContain('Review in progress');
    const stop = findButton(root, 'Stop review');
    stop.click();
    expect(onStopReview).toHaveBeenCalledWith('session-1');

    const input = root.querySelector<HTMLInputElement>('#session-name-input');
    expect(input?.value).toBe('example.com — 18 Sep 2026, 10:00');
    expect(root.querySelector('label')?.htmlFor).toBe('session-name-input');
    expect(findButton(root, 'Clear session')).toBeDefined();
  });

  it('renders the stopped state and allows starting a new review', () => {
    const root = document.createElement('div');
    const stopped = makeSession({ status: 'stopped', stoppedAt: '2026-09-18T10:30:00.000Z' });

    renderReviewPanel(root, makePanel({ currentSession: stopped, sessions: [stopped] }));

    expect(root.textContent).toContain('Review stopped');
    expect(findButton(root, 'Start review')).toBeDefined();
  });

  it('disables start on a page that cannot be reviewed', () => {
    const root = document.createElement('div');

    renderReviewPanel(
      root,
      makePanel({
        activePage: { url: 'chrome://extensions', title: 'Extensions', hostname: '', eligible: false },
      }),
    );

    expect(root.textContent).toContain('only http(s) pages are supported');
    expect(findButton(root, 'Start review').disabled).toBe(true);
  });

  it('explains when no active page is available', () => {
    const root = document.createElement('div');

    renderReviewPanel(root, makePanel({ activePage: null }));

    expect(root.textContent).toContain('No active browser tab found.');
    expect(
      [...root.querySelectorAll('button')].some((button) => button.textContent === 'Start review'),
    ).toBe(false);
  });

  it('renames the selected session through the labelled form', () => {
    const root = document.createElement('div');
    const onRenameSession = vi.fn();
    const session = makeSession();

    renderReviewPanel(root, makePanel({ currentSession: session, sessions: [session] }), {
      onRenameSession,
    });

    const input = root.querySelector<HTMLInputElement>('#session-name-input');
    if (input === null) {
      throw new Error('session name input not found');
    }
    input.value = '  Pricing page review  ';
    root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onRenameSession).toHaveBeenCalledWith('session-1', 'Pricing page review');
  });

  it('refuses to submit a blank session name', () => {
    const root = document.createElement('div');
    const onRenameSession = vi.fn();
    const session = makeSession();

    renderReviewPanel(root, makePanel({ currentSession: session, sessions: [session] }), {
      onRenameSession,
    });

    const input = root.querySelector<HTMLInputElement>('#session-name-input');
    if (input === null) {
      throw new Error('session name input not found');
    }
    input.value = '   ';
    root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onRenameSession).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(root.textContent).toContain('Session name must not be blank.');
  });

  it('requires confirmation before clearing a session', () => {
    const root = document.createElement('div');
    const onRequestClearSession = vi.fn();
    const onConfirmClearSession = vi.fn();
    const onCancelClearSession = vi.fn();
    const session = makeSession({ commentCount: 2 });

    renderReviewPanel(root, makePanel({ currentSession: session, sessions: [session] }), {
      onRequestClearSession,
      onConfirmClearSession,
      onCancelClearSession,
    });

    findButton(root, 'Clear session').click();

    expect(onRequestClearSession).toHaveBeenCalledWith('session-1');
    expect(onConfirmClearSession).not.toHaveBeenCalled();
    expect(onCancelClearSession).not.toHaveBeenCalled();

    renderReviewPanel(root, makePanel({ currentSession: session, sessions: [session] }), {
      pendingClearSessionId: session.id,
      onRequestClearSession,
      onConfirmClearSession,
      onCancelClearSession,
    });

    expect(root.textContent).toContain('Delete “example.com — 18 Sep 2026, 10:00” and its 2 notes?');
    const autofocus = root.querySelector<HTMLElement>('[data-autofocus]');
    expect(autofocus).toBe(findButton(root, 'Delete session permanently'));

    findButton(root, 'Keep session').click();
    expect(onCancelClearSession).toHaveBeenCalledTimes(1);

    findButton(root, 'Delete session permanently').click();
    expect(onConfirmClearSession).toHaveBeenCalledWith('session-1');
  });

  it('lists stored sessions with a selectable current row', () => {
    const root = document.createElement('div');
    const onSelectSession = vi.fn();
    const first = makeSession({ id: 'session-1', name: 'First review' });
    const second = makeSession({ id: 'session-2', name: 'Second review', status: 'stopped' });

    renderReviewPanel(root, makePanel({ sessions: [first, second] }), {
      selectedSessionId: 'session-2',
      onSelectSession,
    });

    const rows = [...root.querySelectorAll('.session-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('First review');
    expect(rows[1]?.getAttribute('aria-current')).toBe('true');

    (rows[0] as HTMLButtonElement).click();
    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('surfaces an explicit notice instead of failing silently', () => {
    const root = document.createElement('div');

    renderReviewPanel(root, makePanel(), { notice: 'That session no longer exists.' });

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('That session no longer exists.');
  });

  it('replaces previous content instead of stacking it', () => {
    const root = document.createElement('div');

    renderReviewPanel(root, makePanel());
    renderReviewPanel(root, makePanel());

    expect(root.querySelectorAll('.panel')).toHaveLength(1);
  });

  it('renders an explicit alert when the session state is unavailable', () => {
    const root = document.createElement('div');

    renderReviewPanelError(root, 'IndexedDB blocked by policy');

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('IndexedDB blocked by policy');
  });
});
