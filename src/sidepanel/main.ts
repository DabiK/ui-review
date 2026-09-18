import type {
  ClearReviewSessionResult,
  RenameReviewSessionResult,
  ReviewPanelState,
  StartReviewSessionResult,
  StopReviewSessionResult,
} from '@core';
import { createAppContainer } from '@app';
import {
  renderReviewPanel,
  renderReviewPanelError,
  type ReviewPanelViewOptions,
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
let notice: string | null = null;

type StartFailure = Extract<StartReviewSessionResult, { ok: false }>;
type StopFailure = Extract<StopReviewSessionResult, { ok: false }>;
type RenameFailure = Extract<RenameReviewSessionResult, { ok: false }>;
type ClearFailure = Extract<ClearReviewSessionResult, { ok: false }>;

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

function resolveSelection(state: ReviewPanelState): void {
  if (selectedSessionId !== null && state.sessions.some((session) => session.id === selectedSessionId)) {
    return;
  }
  selectedSessionId = state.currentSession?.id ?? state.sessions[0]?.id ?? null;
}

function viewOptions(): ReviewPanelViewOptions {
  return {
    selectedSessionId,
    pendingClearSessionId,
    notice,
    onRefresh: () => refreshPanel(),
    onStartReview: () => startReview(),
    onStopReview: (sessionId) => stopReview(sessionId),
    onRenameSession: (sessionId, name) => renameSession(sessionId, name),
    onSelectSession: (sessionId) => selectSession(sessionId),
    onRequestClearSession: (sessionId) => requestClearSession(sessionId),
    onConfirmClearSession: (sessionId) => clearSession(sessionId),
    onCancelClearSession: () => cancelClearSession(),
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
  void load();
}

function selectSession(sessionId: string): void {
  selectedSessionId = sessionId;
  pendingClearSessionId = null;
  render();
}

function requestClearSession(sessionId: string): void {
  selectedSessionId = sessionId;
  pendingClearSessionId = sessionId;
  render();
}

function cancelClearSession(): void {
  pendingClearSessionId = null;
  render();
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
    return null;
  });
}

function stopReview(sessionId: string): void {
  void runAction(async () => {
    const result = await container.stopReviewSession(sessionId);
    return result.ok ? null : describeStopFailure(result);
  });
}

function renameSession(sessionId: string, name: string): void {
  void runAction(async () => {
    const result = await container.renameReviewSession(sessionId, name);
    return result.ok ? null : describeRenameFailure(result);
  });
}

function clearSession(sessionId: string): void {
  void runAction(async () => {
    const result = await container.clearReviewSession(sessionId);
    if (result.ok) {
      selectedSessionId = null;
    }
    pendingClearSessionId = null;
    return result.ok ? null : describeClearFailure(result);
  });
}

async function load(): Promise<void> {
  try {
    panel = await container.loadReviewPanel();
    resolveSelection(panel);
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderReviewPanelError(root, message, viewOptions());
  }
}

void load();
