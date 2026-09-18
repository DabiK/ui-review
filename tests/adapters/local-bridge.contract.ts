import { describe, expect, it } from 'vitest';
import type { LocalBridgePort } from '@core';

export type LocalBridgeScenario = 'available' | 'unavailable';

export interface LocalBridgePortContractOptions {
  readonly createPort: (scenario: LocalBridgeScenario) => LocalBridgePort;
}

const WRITE_INPUT = {
  sessionId: 'session-1',
  name: 'review.json',
  mediaType: 'application/json',
  content: new Uint8Array([1, 2, 3]),
} as const;

/** Behaviour every `LocalBridgePort` implementation must provide. */
export function describeLocalBridgePortContract(options: LocalBridgePortContractOptions): void {
  describe('LocalBridgePort contract', () => {
    it('reports a healthy bridge with its artifact root', async () => {
      const result = await options.createPort('available').checkHealth();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.health.status).toBe('ok');
        expect(result.health.artifactRoot.trim().length).toBeGreaterThan(0);
      }
    });

    it('round-trips an artifact through the bridge protocol', async () => {
      const port = options.createPort('available');

      const written = await port.writeArtifact(WRITE_INPUT);

      expect(written.ok).toBe(true);
      if (!written.ok) {
        return;
      }
      expect(written.artifact.path.trim().length).toBeGreaterThan(0);
      expect(written.artifact.byteLength).toBe(3);

      const read = await port.readArtifact({
        sessionId: WRITE_INPUT.sessionId,
        name: WRITE_INPUT.name,
      });

      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(Array.from(read.artifact.content)).toEqual([1, 2, 3]);
        expect(read.artifact.mediaType).toBe('application/json');
      }
    });

    it('reports a missing artifact with an explicit reason', async () => {
      const result = await options
        .createPort('available')
        .readArtifact({ sessionId: 'session-1', name: 'nope.json' });

      expect(result).toMatchObject({ ok: false, reason: 'artifact-not-found' });
    });

    it('refuses traversal-shaped names without persisting anything', async () => {
      const port = options.createPort('available');

      const written = await port.writeArtifact({ ...WRITE_INPUT, name: '../escape.json' });
      const read = await port.readArtifact({ sessionId: 'session-1', name: 'escape.json' });

      expect(written.ok).toBe(false);
      expect(read.ok).toBe(false);
    });

    it('reports an unavailable bridge as a typed failure', async () => {
      const result = await options.createPort('unavailable').checkHealth();

      expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
    });

    it('never throws for expected failures', async () => {
      const port = options.createPort('unavailable');

      await expect(port.writeArtifact(WRITE_INPUT)).resolves.toBeDefined();
      await expect(
        port.readArtifact({ sessionId: 'session-1', name: 'review.json' }),
      ).resolves.toBeDefined();
    });
  });
}
