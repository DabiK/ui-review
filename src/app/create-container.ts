import {
  clearReviewSession,
  loadReviewPanel,
  renameReviewSession,
  startReviewSession,
  stopReviewSession,
  type ClearReviewSessionResult,
  type RenameReviewSessionResult,
  type ReviewPanelState,
  type SessionId,
  type StartReviewSessionResult,
  type StopReviewSessionResult,
} from '@core';
import { ChromeActivePageAdapter } from '@adapters/chrome/active-page';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { ChromeRuntimeInfoAdapter } from '@adapters/runtime/chrome-runtime-info';
import { CryptoIdGeneratorAdapter } from '@adapters/runtime/crypto-id-generator';
import { SystemClockAdapter } from '@adapters/runtime/system-clock';

/**
 * Composition root: the only place allowed to pick concrete adapters. Driving adapters
 * (side panel, future overlay) receive use cases, never adapters directly.
 */
export interface AppContainer {
  loadReviewPanel(): Promise<ReviewPanelState>;
  startReviewSession(): Promise<StartReviewSessionResult>;
  stopReviewSession(sessionId: SessionId): Promise<StopReviewSessionResult>;
  renameReviewSession(sessionId: SessionId, name: string): Promise<RenameReviewSessionResult>;
  clearReviewSession(sessionId: SessionId): Promise<ClearReviewSessionResult>;
}

export function createAppContainer(): AppContainer {
  const sessions = new IndexedDbReviewSessionRepository();
  const runtimeInfo = new ChromeRuntimeInfoAdapter();
  const pages = new ChromeActivePageAdapter();
  const clock = new SystemClockAdapter();
  const ids = new CryptoIdGeneratorAdapter();

  return {
    loadReviewPanel: () => loadReviewPanel({ sessions, pages, runtimeInfo }),
    startReviewSession: () => startReviewSession({ sessions, pages, clock, ids }),
    stopReviewSession: (sessionId) => stopReviewSession({ sessions, clock }, { sessionId }),
    renameReviewSession: (sessionId, name) =>
      renameReviewSession({ sessions }, { sessionId, name }),
    clearReviewSession: (sessionId) => clearReviewSession({ sessions }, { sessionId }),
  };
}
