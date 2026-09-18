// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ActivePageSummary, CommentSummary, ReviewPanelState, SessionSummary } from '@core';
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

function makeComment(overrides: Partial<CommentSummary> = {}): CommentSummary {
  return {
    id: 'comment-1',
    text: 'The primary action is not aligned with the title.',
    category: 'UI',
    priority: 'important',
    createdAt: '2026-09-18T10:05:00.000Z',
    updatedAt: '2026-09-18T10:05:00.000Z',
    anchorLabel: 'Save',
    attachments: [],
    visualEvidence: null,
    ...overrides,
  };
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeAttachments(): CommentSummary['attachments'] {
  return [
    {
      id: 'attachment-viewport',
      kind: 'viewport-screenshot',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      byteLength: 4096,
      dataUrl: TINY_PNG,
    },
    {
      id: 'attachment-crop',
      kind: 'element-crop',
      mimeType: 'image/png',
      width: 100,
      height: 32,
      byteLength: 512,
      dataUrl: TINY_PNG,
    },
  ];
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
    selectedSession: null,
    comments: [],
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
    expect(root.textContent).toContain('Select a session to read its notes.');

    const start = findButton(root, 'Start review');
    expect(start.disabled).toBe(false);
    start.click();
    expect(onStartReview).toHaveBeenCalledTimes(1);
  });

  it('renders the active state with stop, rename and clear controls', () => {
    const root = document.createElement('div');
    const onStopReview = vi.fn();
    const session = makeSession();

    renderReviewPanel(
      root,
      makePanel({ currentSession: session, selectedSession: session, sessions: [session] }),
      { onStopReview },
    );

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

    renderReviewPanel(root, makePanel({ currentSession: stopped, selectedSession: stopped, sessions: [stopped] }));

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

  it('shows the effective selected session from the read model', () => {
    const root = document.createElement('div');
    const selected = makeSession({ id: 'session-2', name: 'Second review' });

    renderReviewPanel(root, makePanel({ selectedSession: selected, sessions: [selected] }));

    expect(root.querySelector<HTMLInputElement>('#session-name-input')?.value).toBe('Second review');
    expect([...root.querySelectorAll('.session-row')][0]?.getAttribute('aria-current')).toBe('true');
  });

  it('renames the selected session through the labelled form', () => {
    const root = document.createElement('div');
    const onRenameSession = vi.fn();
    const session = makeSession();

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session] }), {
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

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session] }), {
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

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session] }), {
      onRequestClearSession,
      onConfirmClearSession,
      onCancelClearSession,
    });

    findButton(root, 'Clear session').click();

    expect(onRequestClearSession).toHaveBeenCalledWith('session-1');
    expect(onConfirmClearSession).not.toHaveBeenCalled();
    expect(onCancelClearSession).not.toHaveBeenCalled();

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session] }), {
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

    renderReviewPanel(root, makePanel({ selectedSession: second, sessions: [first, second] }), {
      onSelectSession,
    });

    const rows = [...root.querySelectorAll('.session-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('First review');
    expect(rows[1]?.getAttribute('aria-current')).toBe('true');

    (rows[0] as HTMLButtonElement).click();
    expect(onSelectSession).toHaveBeenCalledWith('session-1');
  });

  it('renders the numbered notes of the selected session', () => {
    const root = document.createElement('div');
    const session = makeSession();
    const first = makeComment();
    const second = makeComment({
      id: 'comment-2',
      text: 'Contrast on the secondary button is too low.',
      category: 'Accessibility',
      priority: 'critical',
      anchorLabel: null,
    });

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session], comments: [first, second] }));

    expect(root.textContent).toContain('Notes (2)');
    const rows = [...root.querySelectorAll('.comment')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.comment__index')?.textContent).toBe('01');
    expect(rows[1]?.querySelector('.comment__index')?.textContent).toBe('02');
    expect(rows[0]?.querySelector('.comment__meta')?.textContent).toBe('UI · P2');
    expect(rows[1]?.querySelector('.comment__meta')?.textContent).toBe('Accessibility · P1');
    expect(rows[0]?.textContent).toContain('Pinned to Save');
    expect(rows[1]?.textContent).not.toContain('Pinned to');
  });

  it('edits a note through the inline form and reports the chosen values', () => {
    const root = document.createElement('div');
    const onSaveComment = vi.fn();
    const onCancelEditComment = vi.fn();
    const session = makeSession();
    const comment = makeComment();

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      { editingCommentId: comment.id, onSaveComment, onCancelEditComment },
    );

    const textarea = root.querySelector<HTMLTextAreaElement>('#comment-text-input');
    const category = root.querySelector<HTMLSelectElement>('#comment-category-select');
    const priority = root.querySelector<HTMLSelectElement>('#comment-priority-select');
    expect(textarea?.value).toBe(comment.text);
    expect(category?.value).toBe('UI');
    expect(priority?.value).toBe('important');

    if (textarea === null || category === null || priority === null) {
      throw new Error('comment form controls not found');
    }
    textarea.value = '  Tighten the spacing below the title.  ';
    category.value = 'UX';
    priority.value = 'minor';
    root.querySelector('.comment-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSaveComment).toHaveBeenCalledWith({
      commentId: 'comment-1',
      text: 'Tighten the spacing below the title.',
      category: 'UX',
      priority: 'minor',
    });

    findButton(root, 'Cancel').click();
    expect(onCancelEditComment).toHaveBeenCalledTimes(1);
  });

  it('refuses to save a note without text', () => {
    const root = document.createElement('div');
    const onSaveComment = vi.fn();
    const session = makeSession();
    const comment = makeComment();

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      { editingCommentId: comment.id, onSaveComment },
    );

    const textarea = root.querySelector<HTMLTextAreaElement>('#comment-text-input');
    if (textarea === null) {
      throw new Error('comment textarea not found');
    }
    textarea.value = '   ';
    root.querySelector('.comment-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onSaveComment).not.toHaveBeenCalled();
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(root.textContent).toContain('Write a note before saving.');
  });

  it('requires confirmation before deleting a note', () => {
    const root = document.createElement('div');
    const onRequestDeleteComment = vi.fn();
    const onConfirmDeleteComment = vi.fn();
    const onCancelDeleteComment = vi.fn();
    const session = makeSession();
    const comment = makeComment();

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      { onRequestDeleteComment, onConfirmDeleteComment, onCancelDeleteComment },
    );

    findButton(root, 'Delete note').click();
    expect(onRequestDeleteComment).toHaveBeenCalledWith('comment-1');

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      {
        pendingDeleteCommentId: comment.id,
        onRequestDeleteComment,
        onConfirmDeleteComment,
        onCancelDeleteComment,
      },
    );

    expect(root.querySelector('[data-autofocus]')).toBe(findButton(root, 'Delete note permanently'));
    findButton(root, 'Keep note').click();
    expect(onCancelDeleteComment).toHaveBeenCalledTimes(1);
    findButton(root, 'Delete note permanently').click();
    expect(onConfirmDeleteComment).toHaveBeenCalledWith('comment-1');
  });

  it('renders screenshot plates with captions and per-attachment removal', () => {
    const root = document.createElement('div');
    const onRequestDeleteAttachment = vi.fn();
    const session = makeSession();
    const comment = makeComment({ attachments: makeAttachments() });

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      { onRequestDeleteAttachment },
    );

    const figures = [...root.querySelectorAll('.figure')];
    expect(figures).toHaveLength(2);
    expect(figures[0]?.querySelector('.figure__caption')?.textContent).toBe('Fig. 1 · Viewport');
    expect(figures[1]?.querySelector('.figure__caption')?.textContent).toBe(
      'Fig. 2 · Element crop',
    );
    expect(figures[0]?.querySelector('img')?.getAttribute('src')).toBe(TINY_PNG);
    expect(figures[0]?.querySelector('img')?.getAttribute('alt')).toBe(
      'Viewport screenshot for note 01',
    );

    findButton(root, 'Remove viewport screenshot').click();
    expect(onRequestDeleteAttachment).toHaveBeenCalledWith('attachment-viewport');
  });

  it('requires confirmation before deleting a screenshot', () => {
    const root = document.createElement('div');
    const onConfirmDeleteAttachment = vi.fn();
    const onCancelDeleteAttachment = vi.fn();
    const session = makeSession();
    const comment = makeComment({ attachments: makeAttachments() });

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
      {
        pendingDeleteAttachmentId: 'attachment-crop',
        onConfirmDeleteAttachment,
        onCancelDeleteAttachment,
      },
    );

    expect(root.textContent).toContain(
      'Delete the element crop? This cannot be undone.',
    );
    expect(root.querySelector('[data-autofocus]')).toBe(
      findButton(root, 'Delete screenshot permanently'),
    );

    findButton(root, 'Keep screenshot').click();
    expect(onCancelDeleteAttachment).toHaveBeenCalledTimes(1);

    findButton(root, 'Delete screenshot permanently').click();
    expect(onConfirmDeleteAttachment).toHaveBeenCalledWith('comment-1', 'attachment-crop');
  });

  it('surfaces screenshot capture failures explicitly', () => {
    const root = document.createElement('div');
    const session = makeSession();
    const partial = makeComment({
      visualEvidence: {
        confidence: 'inferred',
        viewport: 'captured',
        elementCrop: 'failed',
        reason: 'The pinned element is outside the visible area.',
      },
    });

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [partial] }),
    );

    expect(root.textContent).toContain(
      'Element crop unavailable — The pinned element is outside the visible area.',
    );

    const failed = makeComment({
      visualEvidence: {
        confidence: 'unavailable',
        viewport: 'failed',
        elementCrop: 'failed',
        reason: 'The visible page could not be captured.',
      },
    });
    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session], comments: [failed] }));

    expect(root.textContent).toContain(
      'Screenshots unavailable — The visible page could not be captured.',
    );
  });

  it('shows no capture status when both screenshots were captured', () => {
    const root = document.createElement('div');
    const session = makeSession();
    const comment = makeComment({
      attachments: makeAttachments(),
      visualEvidence: {
        confidence: 'confirmed',
        viewport: 'captured',
        elementCrop: 'captured',
        reason: null,
      },
    });

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session], comments: [comment] }),
    );

    expect(root.querySelector('.comment__capture-status')).toBeNull();
  });

  it('surfaces an explicit notice instead of failing silently', () => {
    const root = document.createElement('div');

    renderReviewPanel(root, makePanel(), { notice: 'That session no longer exists.' });

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('That session no longer exists.');
  });

  it('offers the agent handoff once the session has notes and explains the temporary folder', () => {
    const root = document.createElement('div');
    const onExportHandoff = vi.fn();
    const session = makeSession({ commentCount: 1 });

    renderReviewPanel(
      root,
      makePanel({ selectedSession: session, sessions: [session] }),
      { onExportHandoff },
    );

    const copy = findButton(root, 'Copy agent brief');
    expect(copy.disabled).toBe(false);
    expect(root.textContent).toContain('temporary per-session folder');
    expect(root.textContent).toContain('review.json');

    copy.click();
    expect(onExportHandoff).toHaveBeenCalledWith('session-1');
  });

  it('disables the agent handoff while the session has no notes to hand off', () => {
    const root = document.createElement('div');
    const session = makeSession({ commentCount: 0 });

    renderReviewPanel(root, makePanel({ selectedSession: session, sessions: [session] }), {
      onExportHandoff: vi.fn(),
    });

    expect(findButton(root, 'Copy agent brief').disabled).toBe(true);
    expect(root.textContent).toContain('Add at least one note before copying an agent brief.');
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
