#!/usr/bin/env node
/**
 * Diagnostics for the built native bridge: spawns `dist/bridge/main.js`, speaks the real
 * Native Messaging framing and asserts a health check plus a write/read artifact round trip
 * in a throwaway data root. Run `npm run build` first.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = resolve(root, 'dist', 'bridge', 'main.js');

if (!existsSync(bundlePath)) {
  console.error('[ui-review] dist/bridge/main.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const origin = 'chrome-extension://smoke-test/';
const dataRoot = mkdtempSync(join(tmpdir(), 'ui-review-smoke-'));
const protocolVersion = 1;

function encode(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.allocUnsafe(4 + payload.byteLength);
  frame.writeUInt32LE(payload.byteLength, 0);
  payload.copy(frame, 4);
  return frame;
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.byteLength - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
    if (buffer.byteLength - offset - 4 < length) {
      break;
    }
    frames.push(JSON.parse(buffer.subarray(offset + 4, offset + 4 + length).toString('utf8')));
    offset += 4 + length;
  }
  return { frames, remainder: buffer.subarray(offset) };
}

function request(operation, payload) {
  return {
    protocolVersion,
    requestId: `smoke-${operation}`,
    operation,
    origin,
    payload,
  };
}

function fail(message) {
  console.error(`[ui-review] bridge smoke test failed: ${message}`);
  child.stdin.end();
  rmSync(dataRoot, { recursive: true, force: true });
  process.exit(1);
}

let buffer = Buffer.alloc(0);
const pending = [];
const waiters = [];

const child = spawn(process.execPath, [bundlePath], {
  env: {
    ...process.env,
    UI_REVIEW_BRIDGE_ALLOWED_ORIGINS: origin,
    UI_REVIEW_BRIDGE_DATA_ROOT: dataRoot,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('exit', (code) => {
  if (pending.length > 0) {
    console.error(`[ui-review] bridge exited early with code ${code ?? 'null'}`);
    process.exit(1);
  }
});

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  const decoded = decodeFrames(buffer);
  buffer = decoded.remainder;
  for (const frame of decoded.frames) {
    const resolveNext = waiters.shift();
    if (resolveNext === undefined) {
      pending.push(frame);
    } else {
      resolveNext(frame);
    }
  }
});

function nextFrame() {
  if (pending.length > 0) {
    return Promise.resolve(pending.shift());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a bridge frame')), 5000);
    waiters.push((frame) => {
      clearTimeout(timer);
      resolve(frame);
    });
  });
}

function send(message) {
  child.stdin.write(encode(message));
}

async function main() {
  send(request('bridge.health', {}));
  const health = await nextFrame();
  if (health.ok !== true || health.result?.kind !== 'bridge.health') {
    fail(`unexpected health response: ${JSON.stringify(health)}`);
  }
  console.log(
    `[ui-review] health ok — bridge ${health.result.bridgeVersion} on ${health.result.platform}, root ${health.result.artifactRoot}`,
  );

  const content = Buffer.from('{"smoke":true}', 'utf8');
  send(
    request('artifact.write', {
      sessionId: 'smoke-session',
      name: 'review.json',
      mediaType: 'application/json',
      contentBase64: content.toString('base64'),
    }),
  );
  const written = await nextFrame();
  if (written.ok !== true || written.result?.kind !== 'artifact.write') {
    fail(`unexpected write response: ${JSON.stringify(written)}`);
  }
  const onDisk = readFileSync(written.result.path);
  if (!onDisk.equals(content)) {
    fail(`artifact on disk differs at ${written.result.path}`);
  }
  console.log(`[ui-review] write ok — ${written.result.byteLength} bytes at ${written.result.path}`);

  send(
    request('artifact.read', { sessionId: 'smoke-session', name: 'review.json' }),
  );
  const read = await nextFrame();
  if (read.ok !== true || read.result?.kind !== 'artifact.read') {
    fail(`unexpected read response: ${JSON.stringify(read)}`);
  }
  if (Buffer.from(read.result.contentBase64, 'base64').toString('utf8') !== '{"smoke":true}') {
    fail('read content differs from the written content');
  }
  console.log('[ui-review] read ok — round trip complete');

  child.stdin.end();
  rmSync(dataRoot, { recursive: true, force: true });
  console.log('[ui-review] bridge smoke test passed');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
