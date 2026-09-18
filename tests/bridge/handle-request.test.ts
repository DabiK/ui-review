import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  decodeBase64,
  encodeBase64,
  type BridgeResponse,
} from '@core';
import { InMemoryArtifactStore } from '../../src/bridge/adapters/in-memory/in-memory-artifact-store';
import { handleBridgeMessage, type BridgeHandlerDeps } from '../../src/bridge/core/handle-request';

const ORIGIN = 'chrome-extension://allowed/';

function createDeps(overrides: Partial<BridgeHandlerDeps> = {}): BridgeHandlerDeps {
  return {
    store: new InMemoryArtifactStore({ root: '/root' }),
    allowedOrigins: [ORIGIN],
    bridgeVersion: '0.1.0',
    platform: 'darwin',
    ...overrides,
  };
}

function request(operation: string, payload: unknown, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: 'req-1',
    operation,
    origin: ORIGIN,
    payload,
    ...overrides,
  };
}

function writeRequest(overrides: Record<string, unknown> = {}) {
  return request('artifact.write', {
    sessionId: 'session-1',
    name: 'review.json',
    mediaType: 'application/json',
    contentBase64: encodeBase64(new Uint8Array([1, 2, 3])),
    ...overrides,
  });
}

function readRequest(sessionId = 'session-1', name = 'review.json') {
  return request('artifact.read', { sessionId, name });
}

describe('handleBridgeMessage', () => {
  it('answers a health check with the version, platform and storage root', async () => {
    const response = await handleBridgeMessage(request('bridge.health', {}), createDeps());

    expect(response).toEqual({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'req-1',
      ok: true,
      result: {
        kind: 'bridge.health',
        status: 'ok',
        bridgeVersion: '0.1.0',
        platform: 'darwin',
        artifactRoot: '/root',
      },
    });
  });

  it('rejects a malformed message without touching the store', async () => {
    const store = new InMemoryArtifactStore({ root: '/root' });
    const write = vi.spyOn(store, 'write');
    const response = await handleBridgeMessage(null, createDeps({ store }));

    expect(response).toMatchObject({
      ok: false,
      requestId: '',
      error: { code: 'invalid-request' },
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects an unknown operation as not allowlisted', async () => {
    const response = await handleBridgeMessage(request('artifact.delete', {}), createDeps());

    expect(response).toMatchObject({
      ok: false,
      requestId: 'req-1',
      error: { code: 'unsupported-operation' },
    });
  });

  it('rejects a protocol version mismatch before dispatching', async () => {
    const response = await handleBridgeMessage(
      request('bridge.health', {}, { protocolVersion: BRIDGE_PROTOCOL_VERSION + 1 }),
      createDeps(),
    );

    expect(response).toMatchObject({ ok: false, error: { code: 'protocol-mismatch' } });
  });

  it('fails closed for an origin outside the allowlist, even on health', async () => {
    const store = new InMemoryArtifactStore({ root: '/root' });
    const write = vi.spyOn(store, 'write');
    const deps = createDeps({ store });

    const rejected = await handleBridgeMessage(
      request('bridge.health', {}, { origin: 'chrome-extension://intruder/' }),
      deps,
    );
    const noAllowlist = await handleBridgeMessage(request('bridge.health', {}), createDeps({ allowedOrigins: [] }));

    expect(rejected).toMatchObject({ ok: false, error: { code: 'origin-not-allowed' } });
    expect(noAllowlist).toMatchObject({ ok: false, error: { code: 'origin-not-allowed' } });
    expect(write).not.toHaveBeenCalled();
  });

  it('writes and reads an artifact through the protocol', async () => {
    const deps = createDeps();

    const written = await handleBridgeMessage(writeRequest(), deps);
    const readBack = await handleBridgeMessage(
      readRequest(),
      deps,
    );

    expect(written).toMatchObject({
      ok: true,
      result: {
        kind: 'artifact.write',
        sessionId: 'session-1',
        name: 'review.json',
        byteLength: 3,
      },
    });
    expect(readBack.ok).toBe(true);
    if (readBack.ok && readBack.result.kind === 'artifact.read') {
      expect(readBack.result.mediaType).toBe('application/json');
      expect(readBack.result.byteLength).toBe(3);
      const decoded = decodeBase64(readBack.result.contentBase64);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(Array.from(decoded.bytes)).toEqual([1, 2, 3]);
      }
    }
  });

  it('refuses path traversal payloads without writing anything', async () => {
    const store = new InMemoryArtifactStore({ root: '/root' });
    const write = vi.spyOn(store, 'write');
    const deps = createDeps({ store });

    const badName = await handleBridgeMessage(writeRequest({ name: '../../escape.txt' }), deps);
    const badSession = await handleBridgeMessage(writeRequest({ sessionId: '../other' }), deps);
    const badBase64 = await handleBridgeMessage(
      writeRequest({ contentBase64: 'not base64' }),
      deps,
    );

    expect(badName).toMatchObject({ ok: false, error: { code: 'invalid-artifact-name' } });
    expect(badSession).toMatchObject({ ok: false, error: { code: 'invalid-session-id' } });
    expect(badBase64).toMatchObject({ ok: false, error: { code: 'invalid-base64' } });
    expect(write).not.toHaveBeenCalled();
  });

  it('reports a missing artifact with a typed error', async () => {
    const response = await handleBridgeMessage(readRequest('session-1', 'nope.json'), createDeps());

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'artifact-not-found' },
    });
  });

  it('turns an unexpected store failure into an io-error response', async () => {
    const store = new InMemoryArtifactStore({ root: '/root' });
    vi.spyOn(store, 'read').mockRejectedValue(new Error('disk on fire'));

    const response = await handleBridgeMessage(
      readRequest(),
      createDeps({ store }),
    );

    expect(response).toMatchObject({ ok: false, error: { code: 'io-error' } });
  });

  it('answers with the protocol version on every response', async () => {
    const responses: BridgeResponse[] = [
      await handleBridgeMessage(request('bridge.health', {}), createDeps()),
      await handleBridgeMessage(writeRequest(), createDeps()),
      await handleBridgeMessage(request('nope', {}), createDeps()),
    ];

    for (const response of responses) {
      expect(response.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    }
  });
});
