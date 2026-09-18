import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_INCOMPATIBLE_MESSAGE,
  BRIDGE_MISSING_MESSAGE,
  loadBridgeSetup,
  type LocalBridgePort,
} from '@core';

function stubPort(overrides: Partial<LocalBridgePort> = {}): LocalBridgePort {
  return {
    checkHealth: vi.fn().mockResolvedValue({
      ok: true,
      health: { status: 'ok', bridgeVersion: '0.1.0', platform: 'darwin', artifactRoot: '/root' },
    }),
    writeArtifact: vi.fn(),
    readArtifact: vi.fn(),
    materializeHandoff: vi.fn(),
    ...overrides,
  };
}

describe('loadBridgeSetup', () => {
  it('reports a bridge whose version matches the extension as ready', async () => {
    const setup = await loadBridgeSetup({ bridge: stubPort(), expectedVersion: '0.1.0' });

    expect(setup).toEqual({
      kind: 'ready',
      bridgeVersion: '0.1.0',
      platform: 'darwin',
      artifactRoot: '/root',
    });
  });

  it('reports a version mismatch as incompatible with both versions', async () => {
    const bridge = stubPort({
      checkHealth: vi.fn().mockResolvedValue({
        ok: true,
        health: {
          status: 'ok',
          bridgeVersion: '0.0.9',
          platform: 'darwin',
          artifactRoot: '/root',
        },
      }),
    });

    const setup = await loadBridgeSetup({ bridge, expectedVersion: '0.1.0' });

    expect(setup).toMatchObject({
      kind: 'incompatible',
      bridgeVersion: '0.0.9',
      expectedVersion: '0.1.0',
    });
    if (setup.kind === 'incompatible') {
      expect(setup.message).toContain('v0.0.9');
      expect(setup.message).toContain('v0.1.0');
    }
  });

  it('reports an unreachable bridge as missing', async () => {
    const bridge = stubPort({
      checkHealth: vi.fn().mockResolvedValue({
        ok: false,
        reason: 'bridge-unavailable',
        message: 'The local bridge is not installed or not reachable.',
        code: null,
      }),
    });

    const setup = await loadBridgeSetup({ bridge, expectedVersion: '0.1.0' });

    expect(setup).toEqual({ kind: 'missing', message: BRIDGE_MISSING_MESSAGE });
  });

  it('reports a port that throws as missing instead of crashing the panel', async () => {
    const bridge = stubPort({
      checkHealth: vi.fn().mockRejectedValue(new Error('native messaging exploded')),
    });

    await expect(
      loadBridgeSetup({ bridge, expectedVersion: '0.1.0' }),
    ).resolves.toMatchObject({ kind: 'missing' });
  });

  it('treats a rejected or malformed handshake as an incompatible build', async () => {
    const rejected = stubPort({
      checkHealth: vi.fn().mockResolvedValue({
        ok: false,
        reason: 'bridge-rejected',
        message: 'The bridge rejected the request.',
        code: 'protocol-mismatch',
      }),
    });
    const malformed = stubPort({
      checkHealth: vi.fn().mockResolvedValue({
        ok: false,
        reason: 'invalid-response',
        message: 'The bridge response was invalid.',
        code: null,
      }),
    });

    await expect(
      loadBridgeSetup({ bridge: rejected, expectedVersion: '0.1.0' }),
    ).resolves.toMatchObject({
      kind: 'incompatible',
      message: BRIDGE_INCOMPATIBLE_MESSAGE,
      bridgeVersion: null,
      expectedVersion: '0.1.0',
    });
    await expect(
      loadBridgeSetup({ bridge: malformed, expectedVersion: '0.1.0' }),
    ).resolves.toMatchObject({ kind: 'incompatible' });
  });
});
