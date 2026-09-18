import {
  addReviewComment,
  clearReviewSession,
  deleteReviewComment,
  loadOverlayState,
  loadReviewPanel,
  renameReviewSession,
  startReviewSession,
  stopReviewSession,
  updateReviewComment,
  type AddReviewCommentInput,
  type AddReviewCommentResult,
  type ClearReviewSessionResult,
  type DeleteReviewCommentInput,
  type DeleteReviewCommentResult,
  type LoadReviewPanelInput,
  type OverlayState,
  type RenameReviewSessionResult,
  type ReviewPanelState,
  type SessionId,
  type StartReviewSessionResult,
  type StopReviewSessionResult,
  type UpdateReviewCommentInput,
  type UpdateReviewCommentResult,
} from '@core';
import { ChromeActivePageAdapter } from '@adapters/chrome/active-page';
import { ChromeReviewChannel } from '@adapters/chrome/review-channel';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { ChromeRuntimeInfoAdapter } from '@adapters/runtime/chrome-runtime-info';
import { CryptoIdGeneratorAdapter } from '@adapters/runtime/crypto-id-generator';
import { SystemClockAdapter } from '@adapters/runtime/system-clock';
import type { ReviewChangeBroadcaster } from './gateways';

/**
 * Composition root: the only place allowed to pick concrete adapters. Driving adapters
 * (side panel, page overlay, service worker) receive use cases, never adapters directly.
 */
export interface AppContainer extends ReviewChangeBroadcaster {
  loadReviewPanel(input?: LoadReviewPanelInput): Promise<ReviewPanelState>;
  startReviewSession(): Promise<StartReviewSessionResult>;
  stopReviewSession(sessionId: SessionId): Promise<StopReviewSessionResult>;
  renameReviewSession(sessionId: SessionId, name: string): Promise<RenameReviewSessionResult>;
  clearReviewSession(sessionId: SessionId): Promise<ClearReviewSessionResult>;
  loadOverlayState(pageUrl: string): Promise<OverlayState>;
  addReviewComment(input: AddReviewCommentInput): Promise<AddReviewCommentResult>;
  updateReviewComment(input: UpdateReviewCommentInput): Promise<UpdateReviewCommentResult>;
  deleteReviewComment(input: DeleteReviewCommentInput): Promise<DeleteReviewCommentResult>;
  subscribeToReviewChanges(listener: () => void): () => void;
}

export function createAppContainer(): AppContainer {
  const sessions = new IndexedDbReviewSessionRepository();
  const runtimeInfo = new ChromeRuntimeInfoAdapter();
  const pages = new ChromeActivePageAdapter();
  const clock = new SystemClockAdapter();
  const ids = new CryptoIdGeneratorAdapter();
  const channel = new ChromeReviewChannel();

  return {
    loadReviewPanel: (input) => loadReviewPanel({ sessions, pages, runtimeInfo }, input),
    startReviewSession: () => startReviewSession({ sessions, pages, clock, ids }),
    stopReviewSession: (sessionId) => stopReviewSession({ sessions, clock }, { sessionId }),
    renameReviewSession: (sessionId, name) =>
      renameReviewSession({ sessions }, { sessionId, name }),
    clearReviewSession: (sessionId) => clearReviewSession({ sessions }, { sessionId }),
    loadOverlayState: (pageUrl) => loadOverlayState({ sessions }, { pageUrl }),
    addReviewComment: (input) => addReviewComment({ sessions, clock, ids }, input),
    updateReviewComment: (input) => updateReviewComment({ sessions, clock }, input),
    deleteReviewComment: (input) => deleteReviewComment({ sessions }, input),
    notifyPanelChanged: () => channel.notifyPanelChanged(),
    syncPageOverlay: (pageUrl) => channel.syncPageOverlay(pageUrl),
    subscribeToReviewChanges: (listener) => channel.subscribe(listener),
  };
}
