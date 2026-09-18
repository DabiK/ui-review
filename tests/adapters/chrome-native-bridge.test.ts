import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_HOST_NAME, BRIDGE_PROTOCOL_VERSION, parseBridgeEnvelope } from '@core';
import { ChromeNativeMessagingBridgeAdapter } from '@adapters/chrome/native-bridge';
import { SequentialIdGeneratorAdapter } from '@adapters/runtime/sequential-id-generator';
import { InMemoryArtifactStore } from '../../src/bridge/adapters/in-memory/in-memory-artifact-store';
import { InMemoryHandoffWriter } from '../../src/bridge/adapters/in-memory/in-memory-handoff-writer';
import { handleBridgeMessage } from '../../src/bridge/core/handle-request';
import { describeLocalBridgePortContract } from './local-bridge.contract';

const ORIGIN = 'chrome-extension://allowed/';

interface StubChromeOptions {
  readonly lastError?: { readonly message: string } | null;
}

function stubChrome(
  send: (host: string, message: unknown) => Promise<unknown>,
  options: StubChromeOptions = {},
): void {
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: vi.fn(() => ORIGIN),
      sendNativeMessage: vi.fn(send),
      get lastError() {
        return options.lastError ?? null;
      },
    },
  });
}

function healthResponse(result: unknown): unknown {
  return { protocolVersion: BRIDGE_PROTOCOL_VERSION, requestId: 'req-1', ok: true, result };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describeLocalBridgePortContract({
  createPort: (scenario) => {
    if (scenario === 'unavailable') {
      stubChrome(() => Promise.reject(new Error('Specified native messaging host not found.')));
    } else {
      const store = new InMemoryArtifactStore({ root: '/chrome-contract' });
      stubChrome((_host, message) =>
        handleBridgeMessage(message, {
          store,
          handoff: new InMemoryHandoffWriter({ root: '/chrome-contract-handoff' }),
          allowedOrigins: [ORIGIN],
          bridgeVersion: '0.1.0',
          platform: 'test',
        }),
      );
    }
    return new ChromeNativeMessagingBridgeAdapter({ ids: new SequentialIdGeneratorAdapter() });
  },
});

describe('ChromeNativeMessagingBridgeAdapter', () => {
  it('sends a versioned envelope with the extension origin and a fresh request id', async () => {
    const sent: Array<{ host: string; message: unknown }> = [];
    stubChrome((host, message) => {
      sent.push({ host, message });
      return Promise.resolve(
        healthResponse({
          kind: 'bridge.health',
          status: 'ok',
          bridgeVersion: '0.1.0',
          platform: 'darwin',
          artifactRoot: '/root',
        }),
      );
    });

    await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter('req'),
    }).checkHealth();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.host).toBe(BRIDGE_HOST_NAME);

    const parsed = parseBridgeEnvelope(sent[0]?.message);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.envelope.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
      expect(parsed.value.envelope.requestId).toBe('req-1');
      expect(parsed.value.envelope.operation).toBe('bridge.health');
      expect(parsed.value.envelope.origin).toBe('chrome-extension://allowed/');
      expect(parsed.value.payload).toEqual({});
    }
  });

  it('maps a runtime lastError to an unavailable bridge', async () => {
    stubChrome(
      () =>
        Promise.resolve(
          healthResponse({
            kind: 'bridge.health',
            status: 'ok',
            bridgeVersion: '0.1.0',
            platform: 'darwin',
            artifactRoot: '/root',
          }),
        ),
      { lastError: { message: 'Access to the specified native messaging host is forbidden.' } },
    );

    const result = await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter(),
    }).checkHealth();

    expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
    if (!result.ok) {
      expect(result.message).toMatch(/forbidden/);
    }
  });

  it('maps a rejected sendNativeMessage to an unavailable bridge', async () => {
    stubChrome(() => Promise.reject(new Error('host not found')));

    const result = await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter(),
    }).checkHealth();

    expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
  });

  it('maps an unresolvable extension origin to an unavailable bridge', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn(() => {
          throw new Error('no runtime');
        }),
        sendNativeMessage: vi.fn(),
        lastError: null,
      },
    });

    const result = await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter(),
    }).checkHealth();

    expect(result).toMatchObject({ ok: false, reason: 'bridge-unavailable' });
  });

  it('refuses a malformed or mismatched response instead of trusting it', async () => {
    const responses: unknown[] = [
      { ok: true },
      {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'x',
        ok: true,
        result: {
          kind: 'artifact.write',
          sessionId: 's',
          name: 'n',
          path: '/p',
          byteLength: 1,
        },
      },
    ];

    for (const response of responses) {
      stubChrome(() => Promise.resolve(response));
      const result = await new ChromeNativeMessagingBridgeAdapter({
        ids: new SequentialIdGeneratorAdapter(),
      }).checkHealth();

      expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
    }
  });

  it('refuses a read result whose declared size does not match the payload', async () => {
    stubChrome(() =>
      Promise.resolve({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'read-1',
        ok: true,
        result: {
          kind: 'artifact.read',
          sessionId: 'session-1',
          name: 'review.json',
          path: '/root/review.json',
          byteLength: 99,
          mediaType: 'application/json',
          contentBase64: 'AQID',
        },
      }),
    );

    const result = await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter(),
    }).readArtifact({ sessionId: 'session-1', name: 'review.json' });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
  });

  it('maps a bridge error response to a typed failure', async () => {
    stubChrome(() =>
      Promise.resolve({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'read-1',
        ok: false,
        error: { code: 'origin-not-allowed', message: 'Not your bridge.' },
      }),
    );

    const result = await new ChromeNativeMessagingBridgeAdapter({
      ids: new SequentialIdGeneratorAdapter(),
    }).readArtifact({ sessionId: 'session-1', name: 'review.json' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'bridge-rejected',
      code: 'origin-not-allowed',
    });
  });
});
