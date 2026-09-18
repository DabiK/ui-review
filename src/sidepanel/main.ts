import type {
  ClearReviewSessionResult,
  DeleteReviewCommentAttachmentResult,
  DeleteReviewCommentResult,
  ExportReviewHandoffFailure,
  ExportReviewHandoffResult,
  LoadReviewPanelInput,
  RenameReviewSessionResult,
  ReviewPanelState,
  StartReviewSessionResult,
  StopReviewSessionResult,
  UpdateReviewCommentResult,
} from '@core';
import { createAppContainer } from '@app';
import {
  renderReviewPanel,
  renderReviewPanelError,
  type ReviewPanelViewOptions,
  type SaveCommentInput,
} from './review-panel-view';
import './styles.css';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null) {
  throw new Error('Side panel root element #app is missing');
}
const root: HTMLElement = rootElement;

const container = createAppContainer();

let panel: ReviewPanelState | null = null;
let selectedSessionId: string | null = null;
let pendingClearSessionId: string | null = null;
let editingCommentId: string | null = null;
let pendingDeleteCommentId: string | null = null;
let pendingDeleteAttachmentId: string | null = null;
let notice: string | null = null;

type StartFailure = Extract<StartReviewSessionResult, { ok: false }>;
type StopFailure = Extract<StopReviewSessionResult, { ok: false }>;
type RenameFailure = Extract<RenameReviewSessionResult, { ok: false }>;
type ClearFailure = Extract<ClearReviewSessionResult, { ok: false }>;
type UpdateCommentFailure = Extract<UpdateReviewCommentResult, { ok: false }>;
type DeleteCommentFailure = Extract<DeleteReviewCommentResult, { ok: false }>;
type DeleteAttachmentFailure = Extract<DeleteReviewCommentAttachmentResult, { ok: false }>;

function describeStartFailure(failure: StartFailure): string {
  switch (failure.reason) {
    case 'no-active-page':
      return 'No active browser tab found. Focus a tab, then start the review again.';
    case 'ineligible-page':
      return 'This page cannot be reviewed: only http(s) pages are supported.';
    case 'session-already-active':
      return 'A review is already running for this page.';
  }
}

function describeStopFailure(failure: StopFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'session-already-stopped':
      return 'This session is already stopped.';
    case 'clock-before-start':
      return 'The system clock is inconsistent with this session; it was not stopped.';
  }
}

function describeRenameFailure(failure: RenameFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'invalid-name':
      return 'Session name must not be blank.';
  }
}

function describeClearFailure(failure: ClearFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
  }
}

function describeUpdateCommentFailure(failure: UpdateCommentFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'comment-not-found':
      return 'That note no longer exists.';
    case 'invalid-comment':
      return 'The note could not be saved: text must not be blank.';
  }
}

function describeDeleteCommentFailure(failure: DeleteCommentFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'comment-not-found':
      return 'That note no longer exists.';
  }
}

function describeDeleteAttachmentFailure(failure: DeleteAttachmentFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'comment-not-found':
      return 'That note no longer exists.';
    case 'attachment-not-found':
      return 'That screenshot no longer exists.';
  }
}

function describeExportFailure(failure: ExportReviewHandoffFailure): string {
  switch (failure.reason) {
    case 'session-not-found':
      return 'That session no longer exists.';
    case 'no-comments':
      return 'Add at least one note before copying an agent brief.';
    case 'clipboard-unavailable':
      return `${failure.message} The artifacts are still in the handoff folder.`;
    default:
      return `${failure.message} The review session is unchanged.`;
  }
}

function viewOptions(): ReviewPanelViewOptions {
  return {
    pendingClearSessionId,
    editingCommentId,
    pendingDeleteCommentId,
    pendingDeleteAttachmentId,
    notice,
    onRefresh: () => refreshPanel(),
    onStartReview: () => startReview(),
    onStopReview: (sessionId) => stopReview(sessionId),
    onRenameSession: (sessionId, name) => renameSession(sessionId, name),
    onSelectSession: (sessionId) => selectSession(sessionId),
    onRequestClearSession: (sessionId) => requestClearSession(sessionId),
    onConfirmClearSession: (sessionId) => clearSession(sessionId),
    onCancelClearSession: () => cancelClearSession(),
    onEditComment: (commentId) => editComment(commentId),
    onSaveComment: (input) => saveComment(input),
    onCancelEditComment: () => cancelEditComment(),
    onRequestDeleteComment: (commentId) => requestDeleteComment(commentId),
    onConfirmDeleteComment: (commentId) => confirmDeleteComment(commentId),
    onCancelDeleteComment: () => cancelDeleteComment(),
    onRequestDeleteAttachment: (attachmentId) => requestDeleteAttachment(attachmentId),
    onConfirmDeleteAttachment: (commentId, attachmentId) =>
      confirmDeleteAttachment(commentId, attachmentId),
    onCancelDeleteAttachment: () => cancelDeleteAttachment(),
    onExportHandoff: (sessionId) => exportHandoff(sessionId),
  };
}

function render(): void {
  if (panel === null) {
    return;
  }
  renderReviewPanel(root, panel, viewOptions());
}

function refreshPanel(): void {
  notice = null;
  pendingClearSessionId = null;
  pendingDeleteCommentId = null;
  pendingDeleteAttachmentId = null;
  editingCommentId = null;
  void load();
}

function selectSession(sessionId: string): void {
  selectedSessionId = sessionId;
  pendingClearSessionId = null;
  pendingDeleteCommentId = null;
  pendingDeleteAttachmentId = null;
  editingCommentId = null;
  void load();
}

function requestClearSession(sessionId: string): void {
  selectedSessionId = sessionId;
  pendingClearSessionId = sessionId;
  pendingDeleteCommentId = null;
  pendingDeleteAttachmentId = null;
  editingCommentId = null;
  render();
}

function cancelClearSession(): void {
  pendingClearSessionId = null;
  render();
}

function editComment(commentId: string): void {
  editingCommentId = commentId;
  pendingDeleteCommentId = null;
  pendingDeleteAttachmentId = null;
  render();
}

function cancelEditComment(): void {
  editingCommentId = null;
  render();
}

function requestDeleteComment(commentId: string): void {
  pendingDeleteCommentId = commentId;
  editingCommentId = null;
  pendingDeleteAttachmentId = null;
  render();
}

function cancelDeleteComment(): void {
  pendingDeleteCommentId = null;
  render();
}

function requestDeleteAttachment(attachmentId: string): void {
  pendingDeleteAttachmentId = attachmentId;
  pendingDeleteCommentId = null;
  editingCommentId = null;
  render();
}

function cancelDeleteAttachment(): void {
  pendingDeleteAttachmentId = null;
  render();
}

function confirmDeleteAttachment(commentId: string, attachmentId: string): void {
  const sessionId = selectedSessionId;
  if (sessionId === null) {
    return;
  }
  void runAction(async () => {
    const result = await container.deleteReviewCommentAttachment({
      sessionId,
      commentId,
      attachmentId,
    });
    pendingDeleteAttachmentId = null;
    return result.ok ? null : describeDeleteAttachmentFailure(result);
  });
}

function exportHandoff(sessionId: string): void {
  void runAction(async () => {
    const result: ExportReviewHandoffResult = await container.exportReviewHandoff(sessionId);
    if (!result.ok) {
      return describeExportFailure(result);
    }
    return `Agent brief copied. Artifacts written to ${result.handoff.directory}`;
  });
}

async function runAction(action: () => Promise<string | null>): Promise<void> {
  try {
    notice = await action();
  } catch (error) {
    notice = error instanceof Error ? error.message : String(error);
  }
  await load();
}

function startReview(): void {
  void runAction(async () => {
    const result = await container.startReviewSession();
    if (!result.ok) {
      return describeStartFailure(result);
    }
    selectedSessionId = result.session.id;
    pendingClearSessionId = null;
    pendingDeleteCommentId = null;
    pendingDeleteAttachmentId = null;
    editingCommentId = null;
    container.syncPageOverlay(result.session.pageUrl);
    return null;
  });
}

function stopReview(sessionId: string): void {
  void runAction(async () => {
    const result = await container.stopReviewSession(sessionId);
    if (!result.ok) {
      return describeStopFailure(result);
    }
    container.syncPageOverlay(result.session.pageUrl);
    return null;
  });
}

function renameSession(sessionId: string, name: string): void {
  void runAction(async () => {
    const result = await container.renameReviewSession(sessionId, name);
    return result.ok ? null : describeRenameFailure(result);
  });
}

function clearSession(sessionId: string): void {
  // Capture the page before the async clear: the read model no longer holds the session after.
  const pageUrl = panel?.sessions.find((session) => session.id === sessionId)?.pageUrl;
  void runAction(async () => {
    const result = await container.clearReviewSession(sessionId);
    if (result.ok) {
      selectedSessionId = null;
      if (pageUrl !== undefined) {
        container.syncPageOverlay(pageUrl);
      }
    }
    pendingClearSessionId = null;
    return result.ok ? null : describeClearFailure(result);
  });
}

function saveComment(input: SaveCommentInput): void {
  const sessionId = selectedSessionId;
  if (sessionId === null) {
    return;
  }
  void runAction(async () => {
    const result = await container.updateReviewComment({
      sessionId,
      commentId: input.commentId,
      text: input.text,
      category: input.category,
      priority: input.priority,
    });
    if (result.ok) {
      editingCommentId = null;
      return null;
    }
    return describeUpdateCommentFailure(result);
  });
}

function confirmDeleteComment(commentId: string): void {
  const sessionId = selectedSessionId;
  if (sessionId === null) {
    return;
  }
  const pageUrl = panel?.selectedSession?.pageUrl;
  void runAction(async () => {
    const result = await container.deleteReviewComment({ sessionId, commentId });
    pendingDeleteCommentId = null;
    if (!result.ok) {
      return describeDeleteCommentFailure(result);
    }
    if (pageUrl !== undefined) {
      container.syncPageOverlay(pageUrl);
    }
    return null;
  });
}

async function load(): Promise<void> {
  try {
    const input: LoadReviewPanelInput =
      selectedSessionId === null ? {} : { selectedSessionId };
    panel = await container.loadReviewPanel(input);
    selectedSessionId = panel.selectedSession?.id ?? null;
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderReviewPanelError(root, message, viewOptions());
  }
}

container.subscribeToReviewChanges(() => {
  void load();
});

void load();
