import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSystemHandoffWriter } from '../../src/bridge/adapters/fs/file-system-handoff-writer';
import { describeHandoffWriterPortContract } from './handoff-writer.contract';

const created: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ui-review-handoff-'));
  created.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describeHandoffWriterPortContract({
  createWriter: async () => new FileSystemHandoffWriter({ root: await createRoot() }),
  readFile: async (writer, sessionId, name) => {
    const fsWriter = writer as FileSystemHandoffWriter;
    try {
      return new Uint8Array(await readFile(join(fsWriter.root, sessionId, name)));
    } catch {
      return null;
    }
  },
  fileNames: async (writer, sessionId) => {
    const fsWriter = writer as FileSystemHandoffWriter;
    return readdir(join(fsWriter.root, sessionId)).catch(() => []);
  },
});

describe('FileSystemHandoffWriter', () => {
  it('refuses a symlinked artifact file instead of following it', async () => {
    const root = await createRoot();
    const writer = new FileSystemHandoffWriter({ root });
    const outside = await createRoot();
    const target = join(outside, 'secret.png');
    await writeFile(target, new Uint8Array([1, 2, 3]));

    const planned = writer.plan({ sessionId: 'session-1', fileNames: ['01-element-crop.png'] });
    if (!planned.ok) {
      throw new Error('expected the plan to succeed');
    }
    await mkdir(planned.plan.directory, { recursive: true });
    await symlink(target, planned.plan.filePaths['01-element-crop.png'] ?? '');

    const outcome = await writer.materialize({
      sessionId: 'session-1',
      reviewJson: '{}\n',
      reviewMarkdown: '# brief\n',
      files: [
        {
          name: '01-element-crop.png',
          mediaType: 'image/png',
          content: new Uint8Array([9, 9, 9]),
        },
      ],
    });

    expect(outcome).toMatchObject({ ok: false, code: 'path-not-allowed' });
    expect(Array.from(await readFile(target))).toEqual([1, 2, 3]);
  });

  it('refuses a symlinked session directory that escapes the root', async () => {
    const root = await createRoot();
    const outside = await createRoot();
    const writer = new FileSystemHandoffWriter({ root });

    await symlink(outside, join(root, 'session-1'));

    const outcome = await writer.materialize({
      sessionId: 'session-1',
      reviewJson: '{}\n',
      reviewMarkdown: '# brief\n',
      files: [],
    });

    expect(outcome).toMatchObject({ ok: false, code: 'path-not-allowed' });
  });

  it('removes stale files and planted directories from a previous export', async () => {
    const root = await createRoot();
    const writer = new FileSystemHandoffWriter({ root });

    await writer.materialize({
      sessionId: 'session-1',
      reviewJson: '{}\n',
      reviewMarkdown: '# first\n',
      files: [
        {
          name: '01-element-crop.png',
          mediaType: 'image/png',
          content: new Uint8Array([1]),
        },
      ],
    });
    const staleDirectory = join(root, 'session-1', 'stale');
    await mkdir(staleDirectory, { recursive: true });
    await writeFile(join(staleDirectory, 'old.png'), new Uint8Array([2]));

    await writer.materialize({
      sessionId: 'session-1',
      reviewJson: '{}\n',
      reviewMarkdown: '# second\n',
      files: [],
    });

    expect((await readdir(join(root, 'session-1'))).sort()).toEqual(['review.json', 'review.md']);
  });
});
