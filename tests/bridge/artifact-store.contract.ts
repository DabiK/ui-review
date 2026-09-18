import { describe, expect, it } from 'vitest';
import type { ArtifactStorePort } from '../../src/bridge/core/ports/artifact-store';

export interface ArtifactStoreContractOptions {
  /** Returns a store backed by an isolated root; the same store is used for the whole test. */
  readonly createStore: () => Promise<ArtifactStorePort>;
  readonly disposeStore?: (store: ArtifactStorePort) => Promise<void>;
}

const CONTENT = new Uint8Array([0, 1, 2, 254, 255]);

/** Behaviour every `ArtifactStorePort` implementation must provide. */
export function describeArtifactStorePortContract(options: ArtifactStoreContractOptions): void {
  describe('ArtifactStorePort contract', () => {
    it('writes and reads back an artifact with its media type', async () => {
      const store = await options.createStore();
      try {
        const written = await store.write({
          sessionId: 'session-1',
          name: 'shot.png',
          mediaType: 'image/png',
          content: CONTENT,
        });

        expect(written.ok).toBe(true);
        if (!written.ok) {
          return;
        }
        expect(written.artifact.byteLength).toBe(CONTENT.byteLength);
        expect(written.artifact.path.startsWith(store.root)).toBe(true);

        const read = await store.read({ sessionId: 'session-1', name: 'shot.png' });

        expect(read.ok).toBe(true);
        if (!read.ok) {
          return;
        }
        expect(read.artifact.path).toBe(written.artifact.path);
        expect(read.artifact.mediaType).toBe('image/png');
        expect(Array.from(read.artifact.content)).toEqual(Array.from(CONTENT));
      } finally {
        await options.disposeStore?.(store);
      }
    });

    it('replaces an existing artifact instead of accumulating copies', async () => {
      const store = await options.createStore();
      try {
        await store.write({
          sessionId: 'session-1',
          name: 'review.json',
          mediaType: 'application/json',
          content: new Uint8Array([1]),
        });
        await store.write({
          sessionId: 'session-1',
          name: 'review.json',
          mediaType: 'application/json',
          content: new Uint8Array([2, 3]),
        });

        const read = await store.read({ sessionId: 'session-1', name: 'review.json' });

        expect(read.ok).toBe(true);
        if (read.ok) {
          expect(Array.from(read.artifact.content)).toEqual([2, 3]);
          expect(read.artifact.byteLength).toBe(2);
        }
      } finally {
        await options.disposeStore?.(store);
      }
    });

    it('keeps sessions isolated from each other', async () => {
      const store = await options.createStore();
      try {
        await store.write({
          sessionId: 'session-1',
          name: 'review.json',
          mediaType: 'application/json',
          content: new Uint8Array([1]),
        });

        const missing = await store.read({ sessionId: 'session-2', name: 'review.json' });

        expect(missing).toMatchObject({ ok: false, code: 'artifact-not-found' });
      } finally {
        await options.disposeStore?.(store);
      }
    });

    it('reports a missing artifact with an explicit code', async () => {
      const store = await options.createStore();
      try {
        const missing = await store.read({ sessionId: 'session-1', name: 'nope.json' });

        expect(missing).toMatchObject({ ok: false, code: 'artifact-not-found' });
      } finally {
        await options.disposeStore?.(store);
      }
    });

    it('refuses traversal-shaped session ids and names without writing', async () => {
      const store = await options.createStore();
      try {
        const badSession = await store.write({
          sessionId: '../../escape',
          name: 'review.json',
          mediaType: 'application/json',
          content: CONTENT,
        });
        const badName = await store.write({
          sessionId: 'session-1',
          name: '../escape.json',
          mediaType: 'application/json',
          content: CONTENT,
        });

        expect(badSession).toMatchObject({ ok: false, code: 'invalid-session-id' });
        expect(badName).toMatchObject({ ok: false, code: 'invalid-artifact-name' });
        expect(await store.read({ sessionId: 'session-1', name: 'review.json' })).toMatchObject({
          ok: false,
          code: 'artifact-not-found',
        });
      } finally {
        await options.disposeStore?.(store);
      }
    });

    it('never throws for expected failures', async () => {
      const store = await options.createStore();
      try {
        await expect(store.read({ sessionId: '../x', name: 'a' })).resolves.toBeDefined();
        await expect(
          store.read({ sessionId: 'session-1', name: 'missing.txt' }),
        ).resolves.toBeDefined();
      } finally {
        await options.disposeStore?.(store);
      }
    });
  });
}
