import { describe, expect, it, vi } from 'vitest';
import {
  buildReviewBrief,
  checkLocalBridge,
  createAttachment,
  createReviewComment,
  createReviewSession,
  materializeReviewHandoff,
  readSessionArtifact,
  storeSessionArtifact,
  type LocalBridgePort,
  type ReviewBriefBundle,
} from '@core';

function sampleBundle(): ReviewBriefBundle {
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

function stubPort(overrides: Partial<LocalBridgePort> = {}): LocalBridgePort {
  return {
    checkHealth: vi.fn().mockResolvedValue({
      ok: true,
      health: { status: 'ok', bridgeVersion: '0.1.0', platform: 'darwin', artifactRoot: '/root' },
    }),
    writeArtifact: vi.fn().mockResolvedValue({
      ok: true,
      artifact: { sessionId: 'session-1', name: 'review.json', path: '/root/review.json', byteLength: 4 },
    }),
    readArtifact: vi.fn().mockResolvedValue({
      ok: true,
      artifact: {
        sessionId: 'session-1',
        name: 'review.json',
        path: '/root/review.json',
        byteLength: 4,
        mediaType: 'application/json',
        content: new Uint8Array([1, 2, 3, 4]),
      },
    }),
    materializeHandoff: vi.fn().mockResolvedValue({
      ok: true,
      handoff: {
        sessionId: 'session-1',
        directory: '/tmp/ui-review/session-1',
        markdownPath: '/tmp/ui-review/session-1/review.md',
        jsonPath: '/tmp/ui-review/session-1/review.json',
        files: [],
        markdown: '# UI Review brief\n',
      },
    }),
    ...overrides,
  };
}

describe('checkLocalBridge', () => {
  it('passes a healthy bridge through', async () => {
    const result = await checkLocalBridge({ bridge: stubPort() });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.health.status).toBe('ok');
    }
  });

  it('turns a throwing port into an explicit unavailable bridge', async () => {
    const bridge = stubPort({
      checkHealth: vi.fn().mockRejectedValue(new Error('no host')),
    });

    const result = await checkLocalBridge({ bridge });

    expect(result).toEqual({
      ok: false,
      reason: 'bridge-unavailable',
      message: 'The local bridge could not be reached.',
      code: null,
    });
  });
});

describe('storeSessionArtifact', () => {
  const input = {
    sessionId: 'session-1',
    name: 'review.json',
    mediaType: 'application/json',
    content: new Uint8Array([1, 2, 3, 4]),
  } as const;

  it('validates and forwards a well-formed artifact', async () => {
    const bridge = stubPort();
    const result = await storeSessionArtifact({ bridge }, { ...input });

    expect(result.ok).toBe(true);
    expect(bridge.writeArtifact).toHaveBeenCalledWith({ ...input });
  });

  it('refuses unsafe session ids and names without calling the bridge', async () => {
    const bridge = stubPort();

    const badSession = await storeSessionArtifact(
      { bridge },
      { ...input, sessionId: '../escape' },
    );
    const badName = await storeSessionArtifact(
      { bridge },
      { ...input, name: '../../etc/passwd' },
    );

    expect(badSession).toMatchObject({ ok: false, reason: 'invalid-session-id' });
    expect(badName).toMatchObject({ ok: false, reason: 'invalid-artifact-name' });
    expect(bridge.writeArtifact).not.toHaveBeenCalled();
  });

  it('refuses unsupported media types, empty content and oversized artifacts', async () => {
    const bridge = stubPort();

    const media = await storeSessionArtifact(
      { bridge },
      { ...input, mediaType: 'application/octet-stream' as never },
    );
    const empty = await storeSessionArtifact({ bridge }, { ...input, content: new Uint8Array() });
    const large = await storeSessionArtifact(
      { bridge },
      { ...input, content: new Uint8Array(16 * 1024 * 1024 + 1) },
    );

    expect(media).toMatchObject({ ok: false, reason: 'unsupported-media-type' });
    expect(empty).toMatchObject({ ok: false, reason: 'empty-artifact' });
    expect(large).toMatchObject({ ok: false, reason: 'artifact-too-large' });
    expect(bridge.writeArtifact).not.toHaveBeenCalled();
  });

  it('forwards a typed bridge refusal', async () => {
    const bridge = stubPort({
      writeArtifact: vi.fn().mockResolvedValue({
        ok: false,
        reason: 'bridge-rejected',
        message: 'The artifact name is not a safe file name.',
        code: 'invalid-artifact-name',
      }),
    });

    const result = await storeSessionArtifact({ bridge }, { ...input });

    expect(result).toMatchObject({ ok: false, reason: 'bridge-rejected', code: 'invalid-artifact-name' });
  });
});

describe('readSessionArtifact', () => {
  it('validates the reference and forwards it', async () => {
    const bridge = stubPort();
    const result = await readSessionArtifact(
      { bridge },
      { sessionId: 'session-1', name: 'review.json' },
    );

    expect(result.ok).toBe(true);
    expect(bridge.readArtifact).toHaveBeenCalledWith({
      sessionId: 'session-1',
      name: 'review.json',
    });
  });

  it('refuses unsafe references without calling the bridge', async () => {
    const bridge = stubPort();

    const result = await readSessionArtifact(
      { bridge },
      { sessionId: 'session-1', name: '..' },
    );

    expect(result).toMatchObject({ ok: false, reason: 'invalid-artifact-name' });
    expect(bridge.readArtifact).not.toHaveBeenCalled();
  });

  it('turns a throwing port into an explicit unavailable bridge', async () => {
    const bridge = stubPort({ readArtifact: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await readSessionArtifact(
      { bridge },
      { sessionId: 'session-1', name: 'review.json' },
    );

    expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
  });
});

describe('materializeReviewHandoff', () => {
  it('validates and forwards a well-formed handoff', async () => {
    const bridge = stubPort();
    const { brief, files } = sampleBundle();

    const result = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief, files },
    );

    expect(result.ok).toBe(true);
    expect(bridge.materializeHandoff).toHaveBeenCalledWith({
      sessionId: 'session-1',
      brief,
      files,
    });
  });

  it('refuses unsafe sessions, mismatched documents and unsafe files before the wire', async () => {
    const bridge = stubPort();
    const { brief, files } = sampleBundle();
    const firstFile = files[0];
    if (firstFile === undefined) {
      throw new Error('expected the sample bundle to reference a file');
    }

    const badSession = await materializeReviewHandoff(
      { bridge },
      { sessionId: '../escape', brief, files },
    );
    const wrongBrief = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief: { ...brief, session: { ...brief.session, id: 'other' } }, files },
    );
    const badFile = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief, files: [{ ...firstFile, name: '../escape.png' }] },
    );

    expect(badSession).toMatchObject({ ok: false, reason: 'invalid-session-id' });
    expect(wrongBrief).toMatchObject({ ok: false, reason: 'invalid-brief' });
    expect(badFile).toMatchObject({ ok: false, reason: 'invalid-artifact-name' });
    expect(bridge.materializeHandoff).not.toHaveBeenCalled();
  });

  it('refuses an unsupported brief version and a mismatched file list', async () => {
    const bridge = stubPort();
    const { brief, files } = sampleBundle();

    const version = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief: { ...brief, schemaVersion: 2 } as never, files },
    );
    const mismatch = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief, files: [] },
    );

    expect(version).toMatchObject({ ok: false, reason: 'invalid-brief' });
    expect(mismatch).toMatchObject({ ok: false, reason: 'invalid-brief' });
    expect(bridge.materializeHandoff).not.toHaveBeenCalled();
  });

  it('turns a throwing port into an explicit unavailable bridge', async () => {
    const bridge = stubPort({
      materializeHandoff: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { brief, files } = sampleBundle();

    const result = await materializeReviewHandoff(
      { bridge },
      { sessionId: 'session-1', brief, files },
    );

    expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
  });
});
