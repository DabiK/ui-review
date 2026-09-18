import { describe, expect, it } from 'vitest';
import { InMemoryArtifactStore } from '../../src/bridge/adapters/in-memory/in-memory-artifact-store';
import { describeArtifactStorePortContract } from './artifact-store.contract';

describeArtifactStorePortContract({
  createStore: async () => new InMemoryArtifactStore({ root: '/test-root' }),
});

describe('InMemoryArtifactStore', () => {
  it('exposes deterministic paths under its root', async () => {
    const store = new InMemoryArtifactStore({ root: '/test-root/' });

    const written = await store.write({
      sessionId: 'session-1',
      name: 'review.json',
      mediaType: 'application/json',
      content: new Uint8Array([1]),
    });

    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.artifact.path).toBe('/test-root/sessions/session-1/artifacts/review.json');
    }
  });

  it('copies bytes in and out instead of sharing references', async () => {
    const store = new InMemoryArtifactStore();
    const content = new Uint8Array([1, 2, 3]);

    await store.write({
      sessionId: 'session-1',
      name: 'review.json',
      mediaType: 'application/json',
      content,
    });
    content[0] = 9;

    const read = await store.read({ sessionId: 'session-1', name: 'review.json' });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(Array.from(read.artifact.content)).toEqual([1, 2, 3]);
    }
  });
});
