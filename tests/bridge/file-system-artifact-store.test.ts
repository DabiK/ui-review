import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystemArtifactStore } from '../../src/bridge/adapters/fs/file-system-artifact-store';
import { describeArtifactStorePortContract } from './artifact-store.contract';

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ui-review-store-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describeArtifactStorePortContract({
  createStore: async () => new FileSystemArtifactStore({ root: await createRoot() }),
});

describe('FileSystemArtifactStore', () => {
  it('persists bytes and a metadata sidecar under the root', async () => {
    const root = await createRoot();
    const store = new FileSystemArtifactStore({ root });

    const written = await store.write({
      sessionId: 'session-1',
      name: 'shot.png',
      mediaType: 'image/png',
      content: new Uint8Array([137, 80, 78, 71]),
    });

    expect(written.ok).toBe(true);
    expect(Array.from(await readFile(join(root, 'sessions/session-1/artifacts/shot.png')))).toEqual([
      137, 80, 78, 71,
    ]);
    const metadata = JSON.parse(
      await readFile(join(root, 'sessions/session-1/metadata/shot.png.json'), 'utf8'),
    ) as { mediaType: string; byteLength: number };
    expect(metadata).toEqual({ mediaType: 'image/png', byteLength: 4 });
  });

  it('refuses a relative root at construction', () => {
    expect(() => new FileSystemArtifactStore({ root: 'relative/path' })).toThrow(/absolute/i);
  });

  it('refuses a session folder that symlinks outside the root', async () => {
    const root = await createRoot();
    const outside = await mkdtemp(join(tmpdir(), 'ui-review-outside-'));
    roots.push(outside);
    await mkdir(join(root, 'sessions'), { recursive: true });
    await symlink(outside, join(root, 'sessions/session-1'), 'dir');
    const store = new FileSystemArtifactStore({ root });

    const written = await store.write({
      sessionId: 'session-1',
      name: 'escape.txt',
      mediaType: 'text/plain',
      content: new Uint8Array([1]),
    });

    expect(written).toMatchObject({ ok: false, code: 'path-not-allowed' });
    await expect(readFile(join(outside, 'artifacts/escape.txt'))).rejects.toThrow();
  });

  it('refuses a symlinked artifact file on read and write', async () => {
    const root = await createRoot();
    const outside = await mkdtemp(join(tmpdir(), 'ui-review-outside-'));
    roots.push(outside);
    await writeFile(join(outside, 'secret.txt'), 'top secret');
    await mkdir(join(root, 'sessions/session-1/artifacts'), { recursive: true });
    await mkdir(join(root, 'sessions/session-1/metadata'), { recursive: true });
    await symlink(join(outside, 'secret.txt'), join(root, 'sessions/session-1/artifacts/leak.txt'));
    const store = new FileSystemArtifactStore({ root });

    const read = await store.read({ sessionId: 'session-1', name: 'leak.txt' });
    const written = await store.write({
      sessionId: 'session-1',
      name: 'leak.txt',
      mediaType: 'text/plain',
      content: new Uint8Array([2]),
    });

    expect(read).toMatchObject({ ok: false, code: 'path-not-allowed' });
    expect(written).toMatchObject({ ok: false, code: 'path-not-allowed' });
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('top secret');
  });

  it('reports corrupted metadata instead of pretending the media type', async () => {
    const root = await createRoot();
    const store = new FileSystemArtifactStore({ root });
    await store.write({
      sessionId: 'session-1',
      name: 'review.json',
      mediaType: 'application/json',
      content: new Uint8Array([1]),
    });
    await writeFile(join(root, 'sessions/session-1/metadata/review.json.json'), '{not json');

    const read = await store.read({ sessionId: 'session-1', name: 'review.json' });

    expect(read).toMatchObject({ ok: false, code: 'io-error' });
  });

  it('reports metadata that no longer matches the stored bytes', async () => {
    const root = await createRoot();
    const store = new FileSystemArtifactStore({ root });
    await store.write({
      sessionId: 'session-1',
      name: 'review.json',
      mediaType: 'application/json',
      content: new Uint8Array([1]),
    });
    await writeFile(
      join(root, 'sessions/session-1/metadata/review.json.json'),
      JSON.stringify({ mediaType: 'application/json', byteLength: 99 }),
    );

    const read = await store.read({ sessionId: 'session-1', name: 'review.json' });

    expect(read).toMatchObject({ ok: false, code: 'io-error' });
  });

  it('reports a missing root as an artifact-not-found instead of crashing', async () => {
    const root = await createRoot();
    const store = new FileSystemArtifactStore({ root: join(root, 'never-created') });

    const read = await store.read({ sessionId: 'session-1', name: 'review.json' });

    expect(read).toMatchObject({ ok: false, code: 'artifact-not-found' });
  });

  it('reads back artifacts without metadata by guessing the extension', async () => {
    const root = await createRoot();
    await mkdir(join(root, 'sessions/session-1/artifacts'), { recursive: true });
    await writeFile(join(root, 'sessions/session-1/artifacts/review.md'), '# Review');
    const store = new FileSystemArtifactStore({ root });

    const read = await store.read({ sessionId: 'session-1', name: 'review.md' });

    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.artifact.mediaType).toBe('text/markdown');
      expect(new TextDecoder().decode(read.artifact.content)).toBe('# Review');
    }
  });
});
