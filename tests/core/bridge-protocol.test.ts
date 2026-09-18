import { describe, expect, it } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  buildReviewBrief,
  createReviewComment,
  createReviewSession,
  encodeBase64,
  errorResponse,
  guessArtifactMediaType,
  isSafeArtifactName,
  isSafeArtifactSessionId,
  parseBridgeEnvelope,
  parseBridgePayload,
  parseBridgeResponse,
  readRequestId,
  successResponse,
  type BridgeArtifactReadResult,
  type BridgeHandoffMaterializeResult,
  type BridgeResponse,
  type ReviewBriefBundle,
} from '@core';

const CONTENT = new Uint8Array([1, 2, 3, 4]);

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: 'req-1',
    operation: 'bridge.health',
    origin: 'chrome-extension://example/',
    payload: {},
    ...overrides,
  };
}

function rawWritePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    name: 'review.json',
    mediaType: 'application/json',
    contentBase64: encodeBase64(CONTENT),
    ...overrides,
  };
}

describe('bridge protocol envelope', () => {
  it('accepts a well-formed request and keeps the payload opaque', () => {
    const parsed = parseBridgeEnvelope(envelope({ requestId: 'abc_123.4-5' }));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.envelope).toEqual({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'abc_123.4-5',
        operation: 'bridge.health',
        origin: 'chrome-extension://example/',
      });
      expect(parsed.value.payload).toEqual({});
    }
  });

  it('rejects non-objects, missing fields and unknown fields', () => {
    expect(parseBridgeEnvelope(null).ok).toBe(false);
    expect(parseBridgeEnvelope([envelope()]).ok).toBe(false);

    const missing = envelope();
    delete missing['payload'];
    expect(parseBridgeEnvelope(missing).ok).toBe(false);

    expect(parseBridgeEnvelope(envelope({ extra: true })).ok).toBe(false);
  });

  it('rejects an unsupported protocol version with a typed mismatch', () => {
    const parsed = parseBridgeEnvelope(envelope({ protocolVersion: BRIDGE_PROTOCOL_VERSION + 1 }));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('protocol-mismatch');
    }
    expect(parseBridgeEnvelope(envelope({ protocolVersion: '1' })).ok).toBe(false);
  });

  it('rejects unknown operations before any payload is considered', () => {
    const parsed = parseBridgeEnvelope(envelope({ operation: 'artifact.delete' }));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('unsupported-operation');
    }
  });

  it('rejects blank, oversized or malformed request ids', () => {
    for (const requestId of ['', '   ', 'has space', 'a'.repeat(129), 42, null]) {
      expect(parseBridgeEnvelope(envelope({ requestId })).ok).toBe(false);
    }
  });

  it('rejects malformed or missing origins', () => {
    for (const origin of ['', 'example.com', 'chrome extension', 'https://a b/', 7]) {
      expect(parseBridgeEnvelope(envelope({ origin })).ok).toBe(false);
    }
  });

  it('reads the request id from raw messages, even invalid ones', () => {
    expect(readRequestId({ requestId: 'req-9' })).toBe('req-9');
    expect(readRequestId({ requestId: 5 })).toBe('');
    expect(readRequestId(null)).toBe('');
    expect(readRequestId('nope')).toBe('');
  });
});

describe('bridge protocol payloads', () => {
  it('accepts an empty health payload only', () => {
    expect(parseBridgePayload('bridge.health', {}).ok).toBe(true);
    expect(parseBridgePayload('bridge.health', { limit: 1 }).ok).toBe(false);
    expect(parseBridgePayload('bridge.health', null).ok).toBe(false);
  });

  it('validates and decodes an artifact write payload', () => {
    const parsed = parseBridgePayload('artifact.write', rawWritePayload());

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.sessionId).toBe('session-1');
      expect(parsed.value.name).toBe('review.json');
      expect(parsed.value.mediaType).toBe('application/json');
      expect(Array.from(parsed.value.content)).toEqual([1, 2, 3, 4]);
    }
  });

  it('rejects unknown or missing write fields', () => {
    expect(parseBridgePayload('artifact.write', rawWritePayload({ extra: 1 })).ok).toBe(false);

    const missing = rawWritePayload();
    delete missing['contentBase64'];
    expect(parseBridgePayload('artifact.write', missing).ok).toBe(false);
  });

  it('refuses session ids that could become path traversal', () => {
    const traversal = [
      '..',
      '../other',
      '..%2fother',
      'a/b',
      'a\\b',
      '/absolute',
      '.hidden',
      'trailing.',
      'CON',
      'com1',
      'a'.repeat(65),
      '',
    ];

    for (const sessionId of traversal) {
      const parsed = parseBridgePayload('artifact.write', rawWritePayload({ sessionId }));
      expect(parsed.ok, `session id ${sessionId} must be refused`).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe('invalid-session-id');
      }
    }
  });

  it('refuses artifact names that could escape the session folder', () => {
    const traversal = ['..', '../../etc/passwd', 'a/b', 'a\\b', '/etc/passwd', 'nul', 'x.', ''];

    for (const name of traversal) {
      const parsed = parseBridgePayload('artifact.write', rawWritePayload({ name }));
      expect(parsed.ok, `name ${name} must be refused`).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe('invalid-artifact-name');
      }
    }
  });

  it('refuses media types outside the allowlist', () => {
    for (const mediaType of ['application/octet-stream', 'text/html', 'image/svg+xml', 3]) {
      const parsed = parseBridgePayload('artifact.write', rawWritePayload({ mediaType }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe('unsupported-media-type');
      }
    }
  });

  it('refuses malformed base64 without decoding anything', () => {
    for (const contentBase64 of ['', 'not base64!', 'AAA', 42]) {
      const parsed = parseBridgePayload('artifact.write', rawWritePayload({ contentBase64 }));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error.code).toBe('invalid-base64');
      }
    }
  });

  it('refuses artifacts above the byte limit', () => {
    const parsed = parseBridgePayload(
      'artifact.write',
      rawWritePayload({ contentBase64: encodeBase64(new Uint8Array(5)) }),
      { maxArtifactBytes: 4 },
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('artifact-too-large');
    }
  });

  it('validates artifact read payloads', () => {
    const parsed = parseBridgePayload('artifact.read', { sessionId: 's-1', name: 'review.md' });

    expect(parsed.ok).toBe(true);
    expect(parseBridgePayload('artifact.read', { sessionId: 's-1' }).ok).toBe(false);
    expect(
      parseBridgePayload('artifact.read', { sessionId: '../x', name: 'review.md' }).ok,
    ).toBe(false);
    expect(parseBridgePayload('artifact.read', { sessionId: 's-1', name: '../x' }).ok).toBe(false);
  });
});

describe('artifact path segment guards', () => {
  it('accepts conservative slugs', () => {
    expect(isSafeArtifactSessionId('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(true);
    expect(isSafeArtifactName('review.json')).toBe(true);
    expect(isSafeArtifactName('Fig_1-crop.webp')).toBe(true);
  });

  it('refuses traversal and Windows device names', () => {
    for (const value of ['..', '.', '../a', 'a/b', 'C:', 'con', 'LPT1.txt', 'trailing.']) {
      expect(isSafeArtifactSessionId(value), value).toBe(false);
      expect(isSafeArtifactName(value), value).toBe(false);
    }
  });
});

describe('bridge protocol responses', () => {
  const health = successResponse('req-1', {
    kind: 'bridge.health',
    status: 'ok',
    bridgeVersion: '0.1.0',
    platform: 'darwin',
    artifactRoot: '/Users/reviewer/Library/Application Support/ui-review',
  });

  const write = successResponse('req-2', {
    kind: 'artifact.write',
    sessionId: 'session-1',
    name: 'review.json',
    path: '/root/sessions/session-1/artifacts/review.json',
    byteLength: 4,
  });

  const read: BridgeResponse = successResponse('req-3', {
    kind: 'artifact.read',
    sessionId: 'session-1',
    name: 'review.json',
    path: '/root/sessions/session-1/artifacts/review.json',
    byteLength: 4,
    mediaType: 'application/json',
    contentBase64: encodeBase64(CONTENT),
  });

  it('accepts the three allowlisted success results', () => {
    for (const response of [health, write, read]) {
      expect(parseBridgeResponse(JSON.parse(JSON.stringify(response))).ok).toBe(true);
    }
  });

  it('accepts a typed error response', () => {
    const response = errorResponse('req-4', { code: 'artifact-not-found', message: 'Missing.' });

    const parsed = parseBridgeResponse(response);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && !parsed.value.ok) {
      expect(parsed.value.error.code).toBe('artifact-not-found');
    }
  });

  it('rejects unknown result kinds and unexpected fields', () => {
    expect(
      parseBridgeResponse({
        ...health,
        result: { kind: 'artifact.delete', sessionId: 's-1', name: 'x' },
      }).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse({
        ...write,
        result: { ...write.result, extra: true },
      }).ok,
    ).toBe(false);
  });

  it('rejects mismatched protocol versions and malformed errors', () => {
    expect(parseBridgeResponse({ ...health, protocolVersion: 99 }).ok).toBe(false);
    expect(
      parseBridgeResponse({ protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId: 'r', ok: false, error: { code: 'nope', message: 'x' } }).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse({ protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId: 'r', ok: false, error: { code: 'io-error', message: ' ' } }).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse({ ...health, ok: true, error: { code: 'io-error', message: 'x' } }).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse({ ...errorResponse('r', { code: 'io-error', message: 'x' }), result: write.result }).ok,
    ).toBe(false);
  });

  it('keeps response shape validation independent from base64 decoding', () => {
    const result: BridgeArtifactReadResult = {
      kind: 'artifact.read',
      sessionId: 's-1',
      name: 'review.json',
      path: '/root/review.json',
      byteLength: 4,
      mediaType: 'application/json',
      contentBase64: 'not base64!',
    };

    // Shape validation stays cheap; decoding is the caller's job and fails explicitly.
    expect(parseBridgeResponse(successResponse('r', result)).ok).toBe(true);
  });
});

describe('artifact media type guessing', () => {
  it('maps known file extensions', () => {
    expect(guessArtifactMediaType('a.png')).toBe('image/png');
    expect(guessArtifactMediaType('a.jpeg')).toBe('image/jpeg');
    expect(guessArtifactMediaType('review.md')).toBe('text/markdown');
    expect(guessArtifactMediaType('review.json')).toBe('application/json');
    expect(guessArtifactMediaType('notes.unknownext')).toBeNull();
    expect(guessArtifactMediaType('noextension')).toBeNull();
  });
});

const TINY_PNG_BASE64 = 'AQID';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function sampleBundle(): ReviewBriefBundle {
  const comment = createReviewComment({
    id: 'comment-1',
    sessionId: 'session-1',
    text: 'The button is misaligned.',
    pageUrl: 'https://example.com/pricing',
    viewport: { width: 1440, height: 900 },
    createdAt: '2026-09-18T10:05:00.000Z',
    attachments: [
      {
        id: 'attachment-1',
        commentId: 'comment-1',
        kind: 'element-crop',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 3,
        createdAt: '2026-09-18T10:05:00.000Z',
        storage: { type: 'inline-data-url', dataUrl: TINY_PNG_DATA_URL },
      },
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

function handoffPayload(bundle: ReviewBriefBundle, overrides: Record<string, unknown> = {}) {
  return {
    sessionId: bundle.brief.session.id,
    brief: bundle.brief,
    files: bundle.files.map((file) => ({
      name: file.name,
      mediaType: file.mediaType,
      contentBase64: encodeBase64(file.content),
    })),
    ...overrides,
  };
}

describe('bridge protocol handoff payloads', () => {
  it('accepts a brief that matches its decoded files', () => {
    const bundle = sampleBundle();

    const parsed = parseBridgePayload('handoff.materialize', handoffPayload(bundle));

    expect(parsed.ok).toBe(true);
    if (parsed.ok && 'files' in parsed.value) {
      expect(parsed.value.sessionId).toBe('session-1');
      expect(parsed.value.brief.comments[0]?.attachments[0]?.file).toBe('01-element-crop.png');
      expect(Array.from(parsed.value.files[0]?.content ?? [])).toEqual([1, 2, 3]);
    }
  });

  it('refuses an unsupported brief schema version with a typed code', () => {
    const bundle = sampleBundle();

    const parsed = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { brief: { ...bundle.brief, schemaVersion: 2 } }),
    );

    expect(parsed).toMatchObject({ ok: false, error: { code: 'unsupported-brief-version' } });
  });

  it('refuses a brief from another session or a mismatched file list', () => {
    const bundle = sampleBundle();

    const wrongSession = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { sessionId: 'session-2' }),
    );
    const missingFile = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { files: [] }),
    );
    const extraFile = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, {
        files: [
          ...handoffPayload(bundle)['files'],
          { name: 'extra.png', mediaType: 'image/png', contentBase64: TINY_PNG_BASE64 },
        ],
      }),
    );

    expect(wrongSession.ok).toBe(false);
    expect(missingFile.ok).toBe(false);
    expect(extraFile.ok).toBe(false);
  });

  it('refuses traversal, reserved and duplicated file names', () => {
    const bundle = sampleBundle();
    const files = handoffPayload(bundle)['files'];

    const traversal = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { files: [{ ...files[0], name: '../escape.png' }] }),
    );
    const reserved = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { files: [{ ...files[0], name: 'review.md' }] }),
    );
    const duplicated = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, {
        files: [
          { ...files[0], name: '01-element-crop.png' },
          { ...files[0], name: '01-element-crop.png' },
        ],
        brief: {
          ...bundle.brief,
          comments: [
            {
              ...bundle.brief.comments[0],
              attachments: [
                { ...bundle.brief.comments[0]?.attachments[0], file: '01-element-crop.png' },
              ],
            },
          ],
        },
      }),
    );

    expect(traversal).toMatchObject({ ok: false, error: { code: 'invalid-artifact-name' } });
    expect(reserved).toMatchObject({ ok: false, error: { code: 'invalid-artifact-name' } });
    expect(duplicated.ok).toBe(false);
  });

  it('refuses malformed base64, non-image media types and oversized files', () => {
    const bundle = sampleBundle();
    const files = handoffPayload(bundle)['files'];

    const badBase64 = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { files: [{ ...files[0], contentBase64: 'not base64!' }] }),
    );
    const badMedia = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle, { files: [{ ...files[0], mediaType: 'application/json' }] }),
    );
    const tooLarge = parseBridgePayload(
      'handoff.materialize',
      handoffPayload(bundle),
      { maxArtifactBytes: 2 },
    );

    expect(badBase64).toMatchObject({ ok: false, error: { code: 'invalid-base64' } });
    expect(badMedia).toMatchObject({ ok: false, error: { code: 'unsupported-media-type' } });
    expect(tooLarge).toMatchObject({ ok: false, error: { code: 'artifact-too-large' } });
  });

  it('parses a well-formed handoff result and rejects malformed ones', () => {
    const result: BridgeHandoffMaterializeResult = {
      kind: 'handoff.materialize',
      sessionId: 'session-1',
      directory: '/tmp/ui-review/session-1',
      markdownPath: '/tmp/ui-review/session-1/review.md',
      jsonPath: '/tmp/ui-review/session-1/review.json',
      files: [
        {
          name: '01-element-crop.png',
          path: '/tmp/ui-review/session-1/01-element-crop.png',
          byteLength: 3,
        },
      ],
      markdown: '# UI Review brief\n',
    };

    expect(parseBridgeResponse(successResponse('r', result)).ok).toBe(true);
    expect(
      parseBridgeResponse(
        successResponse('r', { ...result, markdown: '' } as unknown as BridgeHandoffMaterializeResult),
      ).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse(
        successResponse('r', { ...result, unknown: true } as unknown as BridgeHandoffMaterializeResult),
      ).ok,
    ).toBe(false);
    expect(
      parseBridgeResponse(
        successResponse('r', {
          ...result,
          files: [{ name: 'a.png', path: '/tmp/a.png', byteLength: -1 }],
        } as unknown as BridgeHandoffMaterializeResult),
      ).ok,
    ).toBe(false);
  });
});
