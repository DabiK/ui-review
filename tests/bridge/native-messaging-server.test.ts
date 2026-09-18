import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, encodeBase64, type BridgeResponse } from '@core';
import { decodeNativeFrames, encodeNativeMessage } from '../../src/bridge/adapters/native-messaging/message-framing';
import { serveNativeMessaging } from '../../src/bridge/adapters/native-messaging/native-messaging-server';
import { handleBridgeMessage } from '../../src/bridge/core/handle-request';
import { InMemoryArtifactStore } from '../../src/bridge/adapters/in-memory/in-memory-artifact-store';
import { InMemoryHandoffWriter } from '../../src/bridge/adapters/in-memory/in-memory-handoff-writer';

class FrameReader {
  readonly frames: BridgeResponse[] = [];

  private buffer: Buffer = Buffer.alloc(0);

  private waiters: Array<() => void> = [];

  constructor(stream: PassThrough) {
    stream.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const decoded = decodeNativeFrames(this.buffer);
      if (decoded.ok) {
        this.buffer = decoded.remainder;
        for (const raw of decoded.frames) {
          this.frames.push(JSON.parse(raw) as BridgeResponse);
        }
        this.waiters.splice(0).forEach((resolve) => resolve());
      }
    });
  }

  async next(): Promise<BridgeResponse> {
    if (this.frames.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for a frame.')), 1000);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    const frame = this.frames.shift();
    if (frame === undefined) {
      throw new Error('No frame available.');
    }
    return frame;
  }
}

function createServer(handle: (message: unknown) => Promise<BridgeResponse> | BridgeResponse) {
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = new FrameReader(output);
  const onProtocolError = vi.fn();
  const server = serveNativeMessaging({ input, output, handle, onProtocolError });
  return { input, server, reader, onProtocolError };
}

describe('native messaging server', () => {
  it('answers requests with framed JSON responses', async () => {
    const { input, reader } = createServer(() => ({
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
    }));

    input.write(
      encodeNativeMessage({ requestId: 'req-1', operation: 'bridge.health', payload: {} }),
    );
    const response = await reader.next();

    expect(response).toMatchObject({ ok: true, requestId: 'req-1' });
  });

  it('runs the real handler end to end over the stdio framing', async () => {
    const store = new InMemoryArtifactStore({ root: '/root' });
    const { input, reader } = createServer((message) =>
      handleBridgeMessage(message, {
        store,
        handoff: new InMemoryHandoffWriter({ root: '/handoff-root' }),
        allowedOrigins: ['chrome-extension://allowed/'],
        bridgeVersion: '0.1.0',
        platform: 'darwin',
      }),
    );

    input.write(
      encodeNativeMessage({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'write-1',
        operation: 'artifact.write',
        origin: 'chrome-extension://allowed/',
        payload: {
          sessionId: 'session-1',
          name: 'review.json',
          mediaType: 'application/json',
          contentBase64: encodeBase64(new Uint8Array([9, 8])),
        },
      }),
    );
    input.write(
      encodeNativeMessage({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'read-1',
        operation: 'artifact.read',
        origin: 'chrome-extension://allowed/',
        payload: { sessionId: 'session-1', name: 'review.json' },
      }),
    );

    const write = await reader.next();
    const read = await reader.next();

    expect(write).toMatchObject({ ok: true, requestId: 'write-1' });
    expect(read).toMatchObject({
      ok: true,
      requestId: 'read-1',
      result: { kind: 'artifact.read', mediaType: 'application/json' },
    });
  });

  it('answers an invalid JSON frame with a protocol error instead of crashing', async () => {
    const { input, reader, onProtocolError } = createServer(() => {
      throw new Error('must not be called');
    });
    const badFrame = Buffer.from('{not json', 'utf8');
    const framed = Buffer.alloc(4 + badFrame.byteLength);
    framed.writeUInt32LE(badFrame.byteLength, 0);
    badFrame.copy(framed, 4);

    input.write(framed);
    const response = await reader.next();

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(onProtocolError).toHaveBeenCalled();
  });

  it('reports an unexpected handler rejection as io-error', async () => {
    const { input, reader } = createServer(() => Promise.reject(new Error('boom')));
    input.write(encodeNativeMessage({ requestId: 'req-7', operation: 'bridge.health' }));

    const response = await reader.next();

    expect(response).toMatchObject({
      ok: false,
      requestId: 'req-7',
      error: { code: 'io-error' },
    });
  });

  it('stops writing after stop()', async () => {
    const { input, server, reader } = createServer(() => ({
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
    }));
    server.stop();

    input.write(encodeNativeMessage({ requestId: 'req-1' }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reader.frames).toHaveLength(0);
  });
});
