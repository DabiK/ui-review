import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { BRIDGE_PROTOCOL_VERSION, decodeBase64, encodeBase64, type BridgeResponse } from '@core';
import {
  decodeNativeFrames,
  encodeNativeMessage,
} from '../../src/bridge/adapters/native-messaging/message-framing';

const ENTRY = fileURLToPath(new URL('../../src/bridge/main.ts', import.meta.url));
const ORIGIN = 'chrome-extension://allowed/';

interface BridgeProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stderr: () => string;
  send(message: unknown): void;
  next(): Promise<BridgeResponse>;
  stop(): void;
}

function startBridge(env: NodeJS.ProcessEnv, args: readonly string[] = []): BridgeProcess {
  const child = spawn(process.execPath, [bundlePath, ...args], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer: Buffer = Buffer.alloc(0);
  let stderrText = '';
  const frames: BridgeResponse[] = [];
  const waiters: Array<() => void> = [];

  child.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeNativeFrames(buffer);
    if (!decoded.ok) {
      return;
    }
    buffer = decoded.remainder;
    for (const raw of decoded.frames) {
      frames.push(JSON.parse(raw) as BridgeResponse);
    }
    waiters.splice(0).forEach((resolve) => resolve());
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrText += chunk.toString('utf8');
  });

  return {
    child,
    stderr: () => stderrText,
    send: (message) => child.stdin.write(encodeNativeMessage(message)),
    next: async () => {
      if (frames.length === 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Timed out. stderr: ${stderrText}`)), 5000);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      const frame = frames.shift();
      if (frame === undefined) {
        throw new Error('No frame available.');
      }
      return frame;
    },
    stop: () => {
      child.kill('SIGTERM');
    },
  };
}

function request(operation: string, payload: unknown, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId: `req-${operation}`,
    operation,
    origin: ORIGIN,
    payload,
    ...overrides,
  };
}

let buildDir: string;
let home: string;
let bundlePath: string;

beforeAll(async () => {
  buildDir = await mkdtemp(join(tmpdir(), 'ui-review-bridge-build-'));
  home = await mkdtemp(join(tmpdir(), 'ui-review-bridge-home-'));
  await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    build: {
      ssr: ENTRY,
      outDir: buildDir,
      emptyOutDir: true,
      target: 'node20',
      minify: false,
      sourcemap: false,
    },
  });
  bundlePath = join(buildDir, 'main.js');
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('bridge executable over the real Native Messaging framing', () => {
  it('round-trips a health check, a write and a read', async () => {
    const bridge = startBridge(
      {
        UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
        HOME: home,
      },
      [ORIGIN],
    );
    try {
      bridge.send(request('bridge.health', {}));
      const health = await bridge.next();

      expect(health).toMatchObject({
        ok: true,
        result: { kind: 'bridge.health', status: 'ok' },
      });
      if (!health.ok || health.result.kind !== 'bridge.health') {
        return;
      }
      expect(health.result.artifactRoot.length).toBeGreaterThan(0);

      bridge.send(
        request('artifact.write', {
          sessionId: 'session-1',
          name: 'review.json',
          mediaType: 'application/json',
          contentBase64: encodeBase64(new Uint8Array([7, 8, 9])),
        }),
      );
      const written = await bridge.next();

      expect(written.ok).toBe(true);
      if (!written.ok || written.result.kind !== 'artifact.write') {
        return;
      }
      expect(Array.from(await readFile(written.result.path))).toEqual([7, 8, 9]);

      bridge.send(request('artifact.read', { sessionId: 'session-1', name: 'review.json' }));
      const read = await bridge.next();

      expect(read.ok).toBe(true);
      if (read.ok && read.result.kind === 'artifact.read') {
        const decoded = decodeBase64(read.result.contentBase64);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
          expect(Array.from(decoded.bytes)).toEqual([7, 8, 9]);
        }
      }
    } finally {
      bridge.stop();
    }
  }, 20_000);

  it('rejects an origin outside the allowlist without writing', async () => {
    const bridge = startBridge({
      UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
      HOME: home,
    });
    try {
      bridge.send(
        request(
          'artifact.write',
          {
            sessionId: 'session-2',
            name: 'intruder.json',
            mediaType: 'application/json',
            contentBase64: encodeBase64(new Uint8Array([1])),
          },
          { origin: 'chrome-extension://intruder/' },
        ),
      );

      const response = await bridge.next();

      expect(response).toMatchObject({ ok: false, error: { code: 'origin-not-allowed' } });
    } finally {
      bridge.stop();
    }
  }, 20_000);

  it('rejects unknown operations and malformed payloads without crashing', async () => {
    const bridge = startBridge({
      UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
      HOME: home,
    });
    try {
      bridge.send(request('artifact.delete', {}));
      bridge.send(
        request('artifact.write', {
          sessionId: 'session-1',
          name: '../../escape.json',
          mediaType: 'application/json',
          contentBase64: encodeBase64(new Uint8Array([1])),
        }),
      );

      const unknown = await bridge.next();
      const traversal = await bridge.next();

      expect(unknown).toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
      expect(traversal).toMatchObject({ ok: false, error: { code: 'invalid-artifact-name' } });
    } finally {
      bridge.stop();
    }
  }, 20_000);

  it('refuses to start without a configured allowlist', async () => {
    const bridge = startBridge({ HOME: home, UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: '' });

    const exitCode = await new Promise<number | null>((resolve) => {
      bridge.child.on('exit', (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(bridge.stderr()).toContain('Refusing to start');
  }, 20_000);

  it("refuses a caller origin that Chrome passes but the allowlist rejects", async () => {
    const bridge = startBridge(
      {
        UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
        HOME: home,
      },
      ['chrome-extension://intruder/'],
    );

    const exitCode = await new Promise<number | null>((resolve) => {
      bridge.child.on('exit', (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(bridge.stderr()).toContain('Refusing to serve the origin');
  }, 20_000);
});
