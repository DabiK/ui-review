import { loadWorkspaceStatus, type ReviewSessionRepository, type WorkspaceStatus } from '@core';
import { IndexedDbReviewSessionRepository } from '@adapters/persistence/indexeddb/indexeddb-review-session-repository';
import { ChromeRuntimeInfoAdapter } from '@adapters/runtime/chrome-runtime-info';

/**
 * Composition root: the only place allowed to pick concrete adapters. Driving adapters
 * (side panel, future overlay) receive use cases, never adapters directly.
 */
export interface AppContainer {
  readonly reviewSessions: ReviewSessionRepository;
  loadWorkspaceStatus(): Promise<WorkspaceStatus>;
}

export function createAppContainer(): AppContainer {
  const reviewSessions = new IndexedDbReviewSessionRepository();
  const runtimeInfo = new ChromeRuntimeInfoAdapter();

  return {
    reviewSessions,
    loadWorkspaceStatus: () => loadWorkspaceStatus({ reviewSessions, runtimeInfo }),
  };
}
