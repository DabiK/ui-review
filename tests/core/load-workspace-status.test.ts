import { describe, expect, it } from 'vitest';
import { createReviewSession, loadWorkspaceStatus } from '@core';
import { InMemoryReviewSessionRepository } from '@adapters/persistence/in-memory/in-memory-review-session-repository';
import { StaticRuntimeInfoAdapter } from '@adapters/runtime/static-runtime-info';

const runtimeInfo = new StaticRuntimeInfoAdapter({
  extensionName: 'UI Review',
  extensionVersion: '0.1.0',
  runtimeLabel: 'Chrome MV3 side panel',
});

function makeSession(id: string, status: 'active' | 'stopped') {
  const session = createReviewSession({
    id,
    name: `${id} — 18 Sep 2026`,
    pageUrl: `https://${id}.example.com/`,
    startedAt: '2026-09-18T10:00:00.000Z',
  });
  return status === 'active' ? session : { ...session, status };
}

describe('loadWorkspaceStatus', () => {
  it('reports an empty workspace with its storage descriptor', async () => {
    const repository = new InMemoryReviewSessionRepository();

    const status = await loadWorkspaceStatus({ reviewSessions: repository, runtimeInfo });

    expect(status).toEqual({
      extensionName: 'UI Review',
      extensionVersion: '0.1.0',
      runtimeLabel: 'Chrome MV3 side panel',
      storage: {
        kind: 'in-memory',
        persistent: false,
        label: 'In-memory (ephemeral)',
      },
      sessionCount: 0,
      activeSessionCount: 0,
    });
  });

  it('counts all sessions and active ones separately', async () => {
    const repository = new InMemoryReviewSessionRepository();
    await repository.save(makeSession('session-a', 'active'));
    await repository.save(makeSession('session-b', 'active'));
    await repository.save(makeSession('session-c', 'stopped'));

    const status = await loadWorkspaceStatus({ reviewSessions: repository, runtimeInfo });

    expect(status.sessionCount).toBe(3);
    expect(status.activeSessionCount).toBe(2);
  });
});
