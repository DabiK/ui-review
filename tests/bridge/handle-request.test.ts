import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  buildReviewBrief,
  createAttachment,
  createReviewComment,
  createReviewSession,
  decodeBase64,
  encodeBase64,
  type BridgeResponse,
} from '@core';
import { InMemoryArtifactStore } from '../../src/bridge/adapters/in-memory/in-memory-artifact-store';
import { InMemoryHandoffWriter } from '../../src/bridge/adapters/in-memory/in-memory-handoff-writer';
import { handleBridgeMessage, type BridgeHandlerDeps } from '../../src/bridge/core/handle-request';

const ORIGIN = 'chrome-extension://allowed/';

function createDeps(overrides: Partial<BridgeHandlerDeps> = {}): BridgeHandlerDeps {
  return {
    store: new InMemoryArtifactStore({ root: '/root' }),
    handoff: new InMemoryHandoffWriter({ root: '/handoff-root' }),
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

function handoffBundle() {
  const comment = createReviewComment({
    id: 'comment-1',
    sessionId: 'session-1',
    text: 'The button is misaligned.',
    pageUrl: 'https://example.com/pricing',
    viewport: { width: 1440, height: 900 },
    createdAt: '2026-09-18T10:05:00.000Z',
    attachments: [
      createAttachment({
        id: 'attachment-1',
        commentId: 'comment-1',
        kind: 'element-crop',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 3,
        createdAt: '2026-09-18T10:05:00.000Z',
        storage: { type: 'inline-data-url', dataUrl: 'data:image/png;base64,AQID' },
      }),
    ],
  });
  const session = createReviewSession({
    id: 'session-1',
    name: 'example.com — 18 Sep 2026, 10:00',
    pageUrl: 'https://example.com/pricing',
    startedAt: '2026-09-18T10:00:00.000Z',
    comments: [comment],
  });
  return buildReviewBrief(session, { generatedAt: '2026-09-18T10:06:00.000Z' });
}

function handoffPayload(bundle = handoffBundle()) {
  return {
    sessionId: bundle.brief.session.id,
    brief: bundle.brief,
    files: bundle.files.map((file) => ({
      name: file.name,
      mediaType: file.mediaType,
      contentBase64: encodeBase64(file.content),
    })),
  };
}

function handoffRequest(bundle = handoffBundle()) {
  return request('handoff.materialize', handoffPayload(bundle));
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

describe('handleBridgeMessage handoff materialization', () => {
  it('writes the brief and its images and returns the rendered markdown', async () => {
    const handoff = new InMemoryHandoffWriter({ root: '/handoff-root' });

    const response = await handleBridgeMessage(handoffRequest(), createDeps({ handoff }));

    expect(response).toMatchObject({
      ok: true,
      result: { kind: 'handoff.materialize', sessionId: 'session-1' },
    });
    if (!response.ok || response.result.kind !== 'handoff.materialize') {
      return;
    }
    expect(response.result.directory).toBe('/handoff-root/session-1');
    expect(response.result.markdownPath).toBe('/handoff-root/session-1/review.md');
    expect(response.result.jsonPath).toBe('/handoff-root/session-1/review.json');
    expect(response.result.markdown).toContain('Comment ID: comment-1');
    expect(response.result.markdown).toContain(response.result.files[0]?.path ?? '');
    expect(response.result.files).toEqual([
      {
        name: '01-element-crop.png',
        path: '/handoff-root/session-1/01-element-crop.png',
        byteLength: 3,
      },
    ]);
    expect(handoff.readFile('session-1', '01-element-crop.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(
      new TextDecoder().decode(handoff.readFile('session-1', 'review.json') ?? new Uint8Array()),
    ).toContain('"schemaVersion": 1');
    expect(
      new TextDecoder().decode(handoff.readFile('session-1', 'review.md') ?? new Uint8Array()),
    ).toBe(response.result.markdown);
  });

  it('refuses invalid payloads before the writer runs', async () => {
    const handoff = new InMemoryHandoffWriter({ root: '/handoff-root' });
    const materialize = vi.spyOn(handoff, 'materialize');
    const deps = createDeps({ handoff });
    const bundle = handoffBundle();
    const payload = handoffPayload(bundle);

    const wrongVersion = await handleBridgeMessage(
      request('handoff.materialize', {
        ...payload,
        brief: { ...bundle.brief, schemaVersion: 2 },
      }),
      deps,
    );
    const wrongSession = await handleBridgeMessage(
      request('handoff.materialize', { ...payload, sessionId: 'other-session' }),
      deps,
    );
    const missingFiles = await handleBridgeMessage(
      request('handoff.materialize', { ...payload, files: [] }),
      deps,
    );
    const traversal = await handleBridgeMessage(
      request('handoff.materialize', {
        ...payload,
        files: [{ ...payload.files[0], name: '../escape.png' }],
      }),
      deps,
    );

    expect(wrongVersion).toMatchObject({
      ok: false,
      error: { code: 'unsupported-brief-version' },
    });
    expect(wrongSession).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(missingFiles).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(traversal).toMatchObject({ ok: false, error: { code: 'invalid-artifact-name' } });
    expect(materialize).not.toHaveBeenCalled();
    expect(handoff.fileNames('session-1')).toEqual([]);
  });

  it('turns an unexpected writer failure into an explicit io-error response', async () => {
    const handoff = new InMemoryHandoffWriter({ root: '/handoff-root' });
    vi.spyOn(handoff, 'materialize').mockRejectedValue(new Error('disk on fire'));

    const response = await handleBridgeMessage(handoffRequest(), createDeps({ handoff }));

    expect(response).toMatchObject({ ok: false, error: { code: 'io-error' } });
  });
});
