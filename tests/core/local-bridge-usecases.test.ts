import { describe, expect, it, vi } from 'vitest';
import {
  checkLocalBridge,
  readSessionArtifact,
  storeSessionArtifact,
  type LocalBridgePort,
} from '@core';

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
