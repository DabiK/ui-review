import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import {
  BRIDGE_PROTOCOL_VERSION,
  buildReviewBrief,
  createAttachment,
  createReviewComment,
  createReviewSession,
  decodeBase64,
  encodeBase64,
  type BridgeResponse,
  type ReviewBriefBundle,
} from '@core';
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

function sampleBundle(): ReviewBriefBundle {
  const comment = createReviewComment({
    id: 'comment-1',
    sessionId: 'handoff-session',
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
    id: 'handoff-session',
    name: 'example.com — 18 Sep 2026, 10:00',
    pageUrl: 'https://example.com/pricing',
    startedAt: '2026-09-18T10:00:00.000Z',
    comments: [comment],
  });
  return buildReviewBrief(session, { generatedAt: '2026-09-18T10:06:00.000Z' });
}

function handoffPayload(bundle: ReviewBriefBundle): unknown {
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

let buildDir: string;
let home: string;
let handoffRoot: string;
let bundlePath: string;

beforeAll(async () => {
  buildDir = await mkdtemp(join(tmpdir(), 'ui-review-bridge-build-'));
  home = await mkdtemp(join(tmpdir(), 'ui-review-bridge-home-'));
  handoffRoot = await mkdtemp(join(tmpdir(), 'ui-review-bridge-handoff-'));
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
      rolldownOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'main.cjs',
        },
      },
    },
  });
  bundlePath = join(buildDir, 'main.cjs');
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  await rm(handoffRoot, { recursive: true, force: true });
});

describe('bridge executable over the real Native Messaging framing', () => {
  it('answers --health without an allowlist and reports the protocol version', () => {
    const result = spawnSync(process.execPath, [bundlePath, '--health'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: '' },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'bridge.health',
      status: 'ok',
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      platform: process.platform,
    });
  });

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

  it('materializes an agent handoff into the OS temporary directory and updates it in place', async () => {
    const bundle = sampleBundle();
    const bridge = startBridge(
      {
        UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
        HOME: home,
        TMPDIR: handoffRoot,
        TEMP: handoffRoot,
        TMP: handoffRoot,
      },
      [ORIGIN],
    );
    try {
      bridge.send(request('handoff.materialize', handoffPayload(bundle)));
      const response = await bridge.next();

      expect(response).toMatchObject({
        ok: true,
        result: { kind: 'handoff.materialize', sessionId: 'handoff-session' },
      });
      if (!response.ok || response.result.kind !== 'handoff.materialize') {
        return;
      }
      expect(response.result.directory.startsWith(handoffRoot)).toBe(true);

      const markdown = await readFile(response.result.markdownPath, 'utf8');
      expect(markdown).toBe(response.result.markdown);
      expect(markdown).toContain('Comment ID: comment-1');
      const json = JSON.parse(await readFile(response.result.jsonPath, 'utf8')) as {
        readonly schemaVersion: number;
        readonly session: { readonly id: string };
      };
      expect(json.schemaVersion).toBe(1);
      expect(json.session.id).toBe('handoff-session');

      const imagePath = response.result.files[0]?.path;
      expect(imagePath).toBeDefined();
      expect(Array.from(await readFile(imagePath ?? ''))).toEqual([1, 2, 3]);

      bridge.send(request('handoff.materialize', handoffPayload(bundle)));
      const second = await bridge.next();

      expect(second).toMatchObject({
        ok: true,
        result: { directory: response.result.directory },
      });
    } finally {
      bridge.stop();
    }
  }, 20_000);

  it('refuses a traversal-shaped handoff before writing anything', async () => {
    const bundle = sampleBundle();
    const bridge = startBridge(
      {
        UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: ORIGIN,
        HOME: home,
        TMPDIR: handoffRoot,
        TEMP: handoffRoot,
        TMP: handoffRoot,
      },
      [ORIGIN],
    );
    try {
      bridge.send(
        request('handoff.materialize', {
          ...(handoffPayload(bundle) as Record<string, unknown>),
          sessionId: '../escape',
        }),
      );

      const response = await bridge.next();

      expect(response).toMatchObject({ ok: false, error: { code: 'invalid-session-id' } });
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
