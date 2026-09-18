import type { ReviewSessionRepository, StorageDescriptor } from '../ports/review-session-repository';
import type { RuntimeInfoPort } from '../ports/runtime-info';

export interface WorkspaceStatus {
  readonly extensionName: string;
  readonly extensionVersion: string;
  readonly runtimeLabel: string;
  readonly storage: StorageDescriptor;
  readonly sessionCount: number;
  readonly activeSessionCount: number;
}

export interface LoadWorkspaceStatusDeps {
  readonly reviewSessions: ReviewSessionRepository;
  readonly runtimeInfo: RuntimeInfoPort;
}

/**
 * Read model used by the side-panel status view: proves the shell is wired to the core
 * through ports, without exposing adapters or persistence internals to the UI.
 */
export async function loadWorkspaceStatus(
  deps: LoadWorkspaceStatusDeps,
): Promise<WorkspaceStatus> {
  const [sessions, runtimeInfo] = await Promise.all([
    deps.reviewSessions.list(),
    deps.runtimeInfo.read(),
  ]);

  return {
    extensionName: runtimeInfo.extensionName,
    extensionVersion: runtimeInfo.extensionVersion,
    runtimeLabel: runtimeInfo.runtimeLabel,
    storage: deps.reviewSessions.describe(),
    sessionCount: sessions.length,
    activeSessionCount: sessions.filter((session) => session.status === 'active').length,
  };
}
