import { describe, expect, it } from 'vitest';
import {
  InMemoryLocalBridgeAdapter,
  IN_MEMORY_BRIDGE_ORIGIN,
} from '@adapters/runtime/in-memory-local-bridge';
import { describeLocalBridgePortContract } from './local-bridge.contract';

describeLocalBridgePortContract({
  createPort: (scenario) => {
    const port = new InMemoryLocalBridgeAdapter();
    if (scenario === 'unavailable') {
      port.setFailure({
        ok: false,
        reason: 'bridge-unavailable',
        message: 'No bridge was configured.',
        code: null,
      });
    }
    return port;
  },
});

describe('InMemoryLocalBridgeAdapter', () => {
  it('exposes the in-process origin and storage root in health', async () => {
    const port = new InMemoryLocalBridgeAdapter({ artifactRoot: '/memory-root' });

    const result = await port.checkHealth();

    expect(result).toMatchObject({
      ok: true,
      health: { status: 'ok', artifactRoot: '/memory-root', platform: 'in-memory' },
    });
    expect(IN_MEMORY_BRIDGE_ORIGIN).toMatch(/^chrome-extension:\/\//);
  });

  it('rejects a foreign origin through the real handler', async () => {
    const port = new InMemoryLocalBridgeAdapter({
      origin: 'chrome-extension://intruder/',
      allowedOrigins: [IN_MEMORY_BRIDGE_ORIGIN],
    });

    const result = await port.checkHealth();

    expect(result).toMatchObject({
      ok: false,
      reason: 'bridge-rejected',
      code: 'origin-not-allowed',
    });
  });

  it('can clear a scripted failure', async () => {
    const port = new InMemoryLocalBridgeAdapter();
    port.setFailure({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'down',
      code: null,
    });
    port.setFailure(null);

    expect(await port.checkHealth()).toMatchObject({ ok: true });
  });
});
